<?php
/**
 * Erzeugt realistische Testdaten für die letzten Tage (Standard: 60).
 *
 * An einigen Tagen wird eine Sauna-Session simuliert: Aufheizen auf 80–95 °C,
 * Halten mit Thermostat und Türöffnungen (Saunagänge), langsames Abkühlen.
 * Sonst liegt die Temperatur auf Raumniveau mit leichtem Tagesgang.
 * Gelegentlich fehlen Messwerte, damit die Darstellung von Lücken sichtbar ist.
 *
 * Aufruf im Browser: https://deine-domain.ch/generate_testdata.php
 *   (Zum Bestätigen wird der API-Key aus config.php abgefragt.)
 * Aufruf per SSH:    php generate_testdata.php --days=60
 *
 * Nach dem Testen diese Datei löschen. Die Testwerte entfernt man mit
 * «Testdaten löschen» auf derselben Seite oder in phpMyAdmin mit
 * TRUNCATE measurements; TRUNCATE daily_summary;
 */

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

final class TestDataGenerator
{
    /** Verlustrate der Saunakabine pro Minute (Abkühlkonstante ≈ 85 min). */
    private const LOSS = 1 / 85;
    /** Ofenleistung in °C pro Minute. Ohne Thermostat würde die Kabine ~150 °C über Raumtemperatur erreichen. */
    private const POWER = 150 / 85;

    private float $roomDrift = 0.0;

    public function __construct(private readonly DateTimeZone $zone)
    {
    }

    /**
     * @return array{rows: int, days: int, sauna_days: int, from: int, to: int}
     */
    public function run(int $days, bool $replace): array
    {
        $now = time();
        $start = (new DateTimeImmutable('today', $this->zone))->modify('-' . ($days - 1) . ' days');
        $from = $start->getTimestamp();

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            if ($replace) {
                $del = $pdo->prepare('DELETE FROM measurements WHERE ts >= :from AND ts <= :to');
                $del->execute([':from' => Time::utc($from), ':to' => Time::utc($now + 60)]);
            }

            $plans = [];
            $saunaDays = 0;
            for ($d = 0; $d < $days; $d++) {
                $date = $start->modify("+{$d} days");
                $plans[$date->format('Y-m-d')] = $this->planDay($date);
                if ($plans[$date->format('Y-m-d')]['sessions'] !== []) {
                    $saunaDays++;
                }
            }

            $rows = $this->simulate($from, $now, $plans, $pdo);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        Summary::clearCache();

        return ['rows' => $rows, 'days' => $days, 'sauna_days' => $saunaDays, 'from' => $from, 'to' => $now];
    }

    /**
     * Legt für einen Tag fest, ob und wann sauniert wird.
     *
     * @return array{sessions: list<array<string, float|int>>, gaps: list<array{0: int, 1: int}>}
     */
    private function planDay(DateTimeImmutable $date): array
    {
        $weekday = (int) $date->format('N'); // 1 = Montag … 7 = Sonntag
        $probability = match (true) {
            $weekday >= 6 => 0.65,
            $weekday === 5 => 0.5,
            $weekday === 3 => 0.3,
            default => 0.2,
        };

        $sessions = [];
        if ($this->chance($probability)) {
            $weekend = $weekday >= 6;
            // Gelegentlich zweimal am Tag: Nachmittag und Abend.
            if ($weekend && $this->chance(0.18)) {
                $sessions[] = $this->session($date, $this->rand(13.5, 15.0), 1.3, 2.0);
                $sessions[] = $this->session($date, $this->rand(19.0, 20.0), 1.2, 2.0);
            } else {
                $startHour = $weekend ? $this->rand(15.0, 18.5) : $this->rand(17.25, 19.5);
                $sessions[] = $this->session($date, $startHour, 1.5, 3.0);
            }
        }

        // Kurze Sensoraussetzer, selten auch ein längerer.
        $gaps = [];
        if ($this->chance(0.18)) {
            $at = $date->getTimestamp() + (int) ($this->rand(0, 23.5) * 3600);
            $gaps[] = [$at, $at + random_int(4, 25) * 60];
        }
        if ($this->chance(0.03)) {
            $at = $date->getTimestamp() + (int) ($this->rand(1, 10) * 3600);
            $gaps[] = [$at, $at + random_int(3, 7) * 3600];
        }

        return ['sessions' => $sessions, 'gaps' => $gaps];
    }

    /** @return array<string, float|int> */
    private function session(DateTimeImmutable $date, float $startHour, float $minHold, float $maxHold): array
    {
        $heatOn = $date->getTimestamp() + (int) round($startHour * 3600);
        return [
            'heat_on'   => $heatOn,
            'setpoint'  => $this->rand(80, 95),
            'hold'      => (int) round($this->rand($minHold, $maxHold) * 3600),
            'door_rate' => $this->rand(0.05, 0.09), // Wahrscheinlichkeit pro Minute für eine Türöffnung
        ];
    }

    /**
     * Minutengenaue Simulation über den ganzen Zeitraum.
     *
     * @param array<string, array{sessions: list<array<string, float|int>>, gaps: list<array{0: int, 1: int}>}> $plans
     */
    private function simulate(int $from, int $to, array $plans, PDO $pdo): int
    {
        $batchSize = 1000;
        $placeholders = implode(',', array_fill(0, $batchSize, '(?, ?)'));
        $fullStmt = $pdo->prepare("INSERT INTO measurements (ts, temp_c) VALUES {$placeholders}");

        $buffer = [];
        $rows = 0;

        $cabin = $this->room($from);   // tatsächliche Kabinentemperatur
        $sensor = $cabin;              // Sensor reagiert etwas träge
        $heater = false;
        $doorLeft = 0;

        $sessions = [];
        $allGaps = [];
        foreach ($plans as $plan) {
            foreach ($plan['sessions'] as $s) {
                $s['hold_until'] = null; // wird gesetzt, sobald der Sollwert erreicht ist
                $sessions[] = $s;
            }
            array_push($allGaps, ...$plan['gaps']);
        }

        for ($ts = $from; $ts <= $to; $ts += 60) {
            $room = $this->room($ts);

            // Phase bestimmen: aus, Aufheizen (höchstens 4 h) oder Halten.
            $phase = 'idle';
            $cur = null;
            foreach ($sessions as $k => $s) {
                if ($ts < $s['heat_on']) {
                    break;
                }
                if ($s['hold_until'] === null && $ts < $s['heat_on'] + 4 * 3600) {
                    $phase = 'heating';
                    $cur = $k;
                } elseif ($s['hold_until'] !== null && $ts < $s['hold_until']) {
                    $phase = 'hold';
                    $cur = $k;
                }
            }
            if ($phase === 'heating' && $cabin >= $sessions[$cur]['setpoint'] - 0.5) {
                $sessions[$cur]['hold_until'] = $ts + $sessions[$cur]['hold'];
                $phase = 'hold';
            }

            // Thermostat mit Hysterese.
            if ($phase === 'idle') {
                $heater = false;
            } else {
                $set = (float) $sessions[$cur]['setpoint'];
                if ($cabin < $set - 1.6) {
                    $heater = true;
                } elseif ($cabin > $set + 0.9) {
                    $heater = false;
                }
            }

            // Türöffnungen während der Haltezeit: kurzer, kräftiger Wärmeverlust.
            $doorLoss = 0.0;
            if ($phase === 'hold' && $doorLeft === 0 && $this->chance((float) $sessions[$cur]['door_rate'])) {
                $doorLeft = random_int(1, 2);
            }
            if ($doorLeft > 0) {
                $doorLoss = $this->rand(2.2, 4.2);
                $doorLeft--;
            }

            $cabin += ($heater ? self::POWER : 0.0) - self::LOSS * ($cabin - $room) - $doorLoss;
            $sensor += ($cabin - $sensor) * 0.45;

            if ($this->inGap($ts, $allGaps)) {
                continue;
            }

            $measured = round($sensor + $this->gauss() * 0.08, 2);
            $buffer[] = Time::utc($ts + random_int(0, 3));
            $buffer[] = $measured;

            if (count($buffer) === $batchSize * 2) {
                $fullStmt->execute($buffer);
                $rows += $batchSize;
                $buffer = [];
            }
        }

        if ($buffer !== []) {
            $n = intdiv(count($buffer), 2);
            $stmt = $pdo->prepare('INSERT INTO measurements (ts, temp_c) VALUES ' . implode(',', array_fill(0, $n, '(?, ?)')));
            $stmt->execute($buffer);
            $rows += $n;
        }

        return $rows;
    }

    /** Raumtemperatur ausserhalb der Session: Jahreszeit, Tagesgang, langsames Wandern. */
    private function room(int $ts): float
    {
        $local = (new DateTimeImmutable('@' . $ts))->setTimezone($this->zone);
        $doy = (int) $local->format('z');
        $hour = (int) $local->format('G') + (int) $local->format('i') / 60;

        $season = 14.5 + 5.5 * sin(2 * M_PI * ($doy - 110) / 365);
        $daily = 2.2 * sin(2 * M_PI * ($hour - 9) / 24);
        $this->roomDrift = max(-1.5, min(1.5, $this->roomDrift + $this->gauss() * 0.02));

        return $season + $daily + $this->roomDrift;
    }

    /** @param list<array{0: int, 1: int}> $gaps */
    private function inGap(int $ts, array $gaps): bool
    {
        foreach ($gaps as [$a, $b]) {
            if ($ts >= $a && $ts < $b) {
                return true;
            }
        }
        return false;
    }

    private function rand(float $min, float $max): float
    {
        return $min + (mt_rand() / mt_getrandmax()) * ($max - $min);
    }

    private function chance(float $p): bool
    {
        return mt_rand() / mt_getrandmax() < $p;
    }

    /** Normalverteilte Zufallszahl (Box-Muller). */
    private function gauss(): float
    {
        $u = max(1e-9, mt_rand() / mt_getrandmax());
        $v = mt_rand() / mt_getrandmax();
        return sqrt(-2 * log($u)) * cos(2 * M_PI * $v);
    }
}

/** Löscht alle Mess- und Cachewerte. */
function deleteAllData(): void
{
    $pdo = Database::pdo();
    $pdo->exec('DELETE FROM measurements');
    Summary::clearCache();
}

@set_time_limit(300);

// ---------------------------------------------------------------------------
// Kommandozeile
// ---------------------------------------------------------------------------
if (PHP_SAPI === 'cli') {
    $opts = getopt('', ['days::', 'keep', 'delete-all']);
    if (isset($opts['delete-all'])) {
        deleteAllData();
        echo "Alle Messwerte wurden gelöscht.\n";
        exit(0);
    }
    $days = max(1, min(400, (int) ($opts['days'] ?? 60)));
    $result = (new TestDataGenerator(Time::zone()))->run($days, !isset($opts['keep']));
    printf("%d Messwerte für %d Tage erzeugt (%d Saunatage).\n", $result['rows'], $result['days'], $result['sauna_days']);
    exit(0);
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
$message = null;
$error = null;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $expected = (string) Config::get('api_key', '');
    $provided = (string) ($_POST['api_key'] ?? '');
    if ($expected === '' || str_starts_with($expected, 'HIER-')) {
        $error = 'In config.php ist noch kein API-Key eingetragen.';
    } elseif (!hash_equals($expected, $provided)) {
        sleep(2);
        $error = 'Der API-Key ist falsch.';
    } else {
        try {
            if (($_POST['action'] ?? '') === 'delete') {
                deleteAllData();
                $message = 'Alle Messwerte wurden gelöscht.';
            } else {
                $days = max(1, min(400, (int) ($_POST['days'] ?? 60)));
                $result = (new TestDataGenerator(Time::zone()))->run($days, isset($_POST['replace']));
                $message = sprintf(
                    '%s Messwerte für %d Tage erzeugt, davon %d Saunatage.',
                    number_format($result['rows'], 0, '.', '’'),
                    $result['days'],
                    $result['sauna_days'],
                );
            }
        } catch (PDOException $ex) {
            error_log('[sauna] testdata: ' . $ex->getMessage());
            $error = 'Datenbankfehler. Sind config.php ausgefüllt und setup.sql ausgeführt?'
                . (Config::debug() ? ' (' . $ex->getMessage() . ')' : '');
        }
    }
}
?>
<!doctype html>
<html lang="de-CH">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Testdaten · Sauna</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
               font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; background: #161210; color: #f3ebe3; }
        main { width: min(100%, 36rem); background: #211a16; border: 1px solid rgba(255, 230, 200, .08);
               border-radius: 20px; padding: 28px; box-shadow: 0 20px 50px rgba(0, 0, 0, .45); }
        h1 { margin: 0 0 6px; font-size: 1.35rem; }
        p { color: #c9b8a8; margin: 0 0 16px; }
        label { display: block; font-weight: 600; margin: 14px 0 6px; }
        input[type=password], input[type=number] { width: 100%; padding: 12px 14px; border-radius: 12px; font: inherit;
               border: 1px solid rgba(255, 230, 200, .18); background: #161210; color: inherit; }
        .check { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; color: #e4d6c8; }
        .check input { margin-top: 5px; accent-color: #ff7a2f; }
        .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
        button { padding: 12px 18px; border: 0; border-radius: 12px; font: inherit; font-weight: 600; cursor: pointer; }
        .primary { background: linear-gradient(135deg, #ff8a3d, #e2412b); color: #1a0f0a; }
        .danger { background: transparent; color: #ff9c8a; border: 1px solid rgba(255, 140, 120, .4); }
        :focus-visible { outline: 3px solid #ff9a52; outline-offset: 2px; }
        .ok, .error { padding: 12px 14px; border-radius: 12px; margin: 0 0 16px; }
        .ok { background: rgba(120, 200, 140, .12); color: #a8e5b5; }
        .error { background: rgba(255, 110, 90, .12); color: #ffb0a2; }
        a { color: #ffad6b; }
        small { color: #a89585; }
    </style>
</head>
<body>
<main>
    <h1>Testdaten erzeugen</h1>
    <p>Erzeugt minütliche Messwerte mit realistischen Sauna-Sessions, damit du das Design ohne ESP32 testen kannst.</p>

    <?php if ($message): ?>
        <p class="ok" role="status"><?= $e($message) ?> <a href="./">Zur Webseite →</a></p>
    <?php endif; ?>
    <?php if ($error): ?>
        <p class="error" role="alert"><?= $e($error) ?></p>
    <?php endif; ?>

    <form method="post">
        <label for="api_key">API-Key aus config.php (zur Bestätigung)</label>
        <input id="api_key" type="password" name="api_key" required autocomplete="off">

        <label for="days">Anzahl Tage</label>
        <input id="days" type="number" name="days" min="1" max="400" value="60">

        <label class="check">
            <input type="checkbox" name="replace" value="1" checked>
            <span>Vorhandene Messwerte in diesem Zeitraum vorher löschen</span>
        </label>

        <div class="row">
            <button class="primary" type="submit" name="action" value="generate">Testdaten erzeugen</button>
            <button class="danger" type="submit" name="action" value="delete"
                    formnovalidate>Alle Messwerte löschen</button>
        </div>
    </form>

    <p style="margin-top:22px"><small>Dauert einige Sekunden. Nach dem Testen diese Datei
        (<strong>generate_testdata.php</strong>) im Dateimanager löschen.</small></p>
</main>
</body>
</html>
