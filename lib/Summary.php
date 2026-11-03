<?php

declare(strict_types=1);

/**
 * Tageskennzahlen (Min, Max, Saunadauer, Anzahl Sessions …).
 *
 * Warum eine Cache-Tabelle?
 * Die Jahresansicht bräuchte sonst bei jedem Aufruf rund 525 000 Messwerte
 * (365 Tage × 1440 Minuten), was auf Shared Hosting mehrere Sekunden und viel
 * Speicher kostet. Weil der ESP nur «jetzt» sendet, ändern sich vergangene Tage
 * nicht mehr. Ihre Kennzahlen werden deshalb einmal berechnet und in
 * `daily_summary` abgelegt. Heute und gestern werden immer live gerechnet.
 *
 * Der Cache ist selbstheilend: Ändern sich die Session-Einstellungen in
 * config.php, passt der gespeicherte Hash nicht mehr und die Tage werden neu
 * berechnet. Die Tabelle kann ausserdem jederzeit geleert werden.
 */
final class Summary
{
    /**
     * Sicherheitsrand um den berechneten Zeitraum, damit Sessions über
     * Mitternacht vollständig erkannt werden (Sekunden).
     */
    private const MARGIN = 12 * 3600;

    public static function settingsHash(): string
    {
        return substr(md5(json_encode(Config::sessionSettings(), JSON_THROW_ON_ERROR)), 0, 8);
    }

    /**
     * Kennzahlen für alle Tage von $from bis $to (inklusive).
     *
     * @return array<string, array<string, mixed>> Datum => Kennzahlen
     */
    public static function days(string $from, string $to): array
    {
        $today = Time::today();
        $bounds = Measurements::bounds();
        $firstDate = $bounds['first'] !== null ? Time::localDate($bounds['first']) : null;

        $cached = $firstDate !== null ? self::loadCache($from, $to) : [];
        $result = [];
        $missing = [];

        foreach (Time::dateRange($from, $to) as $date) {
            if ($firstDate === null || $date > $today || $date < $firstDate) {
                $result[$date] = self::empty($date);
            } elseif (isset($cached[$date])) {
                $result[$date] = $cached[$date];
            } else {
                $missing[] = $date;
            }
        }

        // Fehlende Tage monatsweise berechnen: wenige Abfragen, begrenzter Speicher.
        $byMonth = [];
        foreach ($missing as $date) {
            $byMonth[substr($date, 0, 7)][] = $date;
        }
        foreach ($byMonth as $dates) {
            foreach (self::compute($dates) as $date => $summary) {
                $result[$date] = $summary;
            }
        }

        ksort($result);
        return $result;
    }

    /**
     * Vollständige Auswertung eines Tages für die Tagesansicht.
     *
     * @return array{series: array{t: list<int>, v: list<float>}, sessions: list<array<string, mixed>>, summary: array<string, mixed>}
     */
    public static function analyzeDay(string $date): array
    {
        [$ds, $de] = Time::dayBounds($date);
        $series = Measurements::series($ds - self::MARGIN, $de + self::MARGIN);
        $sessions = SessionDetector::detect($series['t'], $series['v'], Config::sessionSettings());

        $lo = self::lowerBound($series['t'], $ds);
        $hi = self::lowerBound($series['t'], $de);
        $daySeries = [
            't' => array_slice($series['t'], $lo, $hi - $lo),
            'v' => array_slice($series['v'], $lo, $hi - $lo),
        ];

        $overlapping = array_values(array_filter(
            $sessions,
            static fn (array $s): bool => $s['start'] < $de && $s['end'] > $ds,
        ));

        return [
            'series'   => $daySeries,
            'sessions' => $overlapping,
            'summary'  => self::summarize($date, $ds, $de, $series, $sessions),
        ];
    }

    /**
     * @param list<string> $dates Daten innerhalb eines Monats, aufsteigend
     * @return array<string, array<string, mixed>>
     */
    private static function compute(array $dates): array
    {
        [$from] = Time::dayBounds($dates[0]);
        [, $to] = Time::dayBounds($dates[count($dates) - 1]);

        $series = Measurements::series($from - self::MARGIN, $to + self::MARGIN);
        $sessions = SessionDetector::detect($series['t'], $series['v'], Config::sessionSettings());
        $now = time();

        $out = [];
        foreach ($dates as $date) {
            [$ds, $de] = Time::dayBounds($date);
            $summary = self::summarize($date, $ds, $de, $series, $sessions);
            $out[$date] = $summary;
            // Erst speichern, wenn der Tag samt Sicherheitsrand vorbei ist.
            if ($de + self::MARGIN <= $now) {
                self::store($summary);
            }
        }
        return $out;
    }

    /**
     * @param array{t: list<int>, v: list<float>} $series
     * @param list<array<string, mixed>> $sessions
     * @return array<string, mixed>
     */
    private static function summarize(string $date, int $ds, int $de, array $series, array $sessions): array
    {
        $lo = self::lowerBound($series['t'], $ds);
        $hi = self::lowerBound($series['t'], $de);

        $min = null;
        $max = null;
        $maxAt = null;
        $minAt = null;
        $sum = 0.0;
        for ($i = $lo; $i < $hi; $i++) {
            $temp = $series['v'][$i];
            $sum += $temp;
            if ($max === null || $temp > $max) {
                $max = $temp;
                $maxAt = $series['t'][$i];
            }
            if ($min === null || $temp < $min) {
                $min = $temp;
                $minAt = $series['t'][$i];
            }
        }
        $samples = $hi - $lo;

        $count = 0;
        $saunaSeconds = 0;
        $longest = 0;
        $weighted = 0.0;
        $weight = 0;
        // Eine Session zählt ganz zu dem Tag, an dem sie begonnen hat. Sonst würde
        // ein Saunaabend bis nach Mitternacht den Folgetag zum «Saunatag» machen.
        foreach ($sessions as $s) {
            if ($s['start'] >= $ds && $s['start'] < $de) {
                $saunaSeconds += $s['duration'];
                $count++;
                $longest = max($longest, $s['duration']);
                if ($s['avg'] !== null && $s['duration'] > 0) {
                    $weighted += $s['avg'] * $s['duration'];
                    $weight += $s['duration'];
                }
            }
        }

        return [
            'date'                    => $date,
            'samples'                 => $samples,
            'min'                     => $min !== null ? round($min, 2) : null,
            'min_at'                  => $minAt,
            'max'                     => $max !== null ? round($max, 2) : null,
            'max_at'                  => $maxAt,
            'avg'                     => $samples > 0 ? round($sum / $samples, 2) : null,
            'sessions'                => $count,
            'sauna_seconds'           => $saunaSeconds,
            'longest_session_seconds' => $longest,
            'session_avg'             => $weight > 0 ? round($weighted / $weight, 2) : null,
        ];
    }

    /** @return array<string, mixed> */
    private static function empty(string $date): array
    {
        return [
            'date'                    => $date,
            'samples'                 => 0,
            'min'                     => null,
            'min_at'                  => null,
            'max'                     => null,
            'max_at'                  => null,
            'avg'                     => null,
            'sessions'                => 0,
            'sauna_seconds'           => 0,
            'longest_session_seconds' => 0,
            'session_avg'             => null,
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private static function loadCache(string $from, string $to): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT day, samples, temp_min, temp_max, temp_avg, UNIX_TIMESTAMP(max_at) AS max_at,
                    sessions, sauna_seconds, longest_session_seconds, session_avg
               FROM daily_summary
              WHERE day BETWEEN :from AND :to AND settings_hash = :hash'
        );
        $stmt->execute([':from' => $from, ':to' => $to, ':hash' => self::settingsHash()]);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $date = (string) $row['day'];
            $out[$date] = [
                'date'                    => $date,
                'samples'                 => (int) $row['samples'],
                'min'                     => $row['temp_min'] !== null ? (float) $row['temp_min'] : null,
                'min_at'                  => null,
                'max'                     => $row['temp_max'] !== null ? (float) $row['temp_max'] : null,
                'max_at'                  => $row['max_at'] !== null ? (int) $row['max_at'] : null,
                'avg'                     => $row['temp_avg'] !== null ? (float) $row['temp_avg'] : null,
                'sessions'                => (int) $row['sessions'],
                'sauna_seconds'           => (int) $row['sauna_seconds'],
                'longest_session_seconds' => (int) $row['longest_session_seconds'],
                'session_avg'             => $row['session_avg'] !== null ? (float) $row['session_avg'] : null,
            ];
        }
        return $out;
    }

    /** @param array<string, mixed> $s */
    private static function store(array $s): void
    {
        $stmt = Database::pdo()->prepare(
            'INSERT INTO daily_summary
                (day, samples, temp_min, temp_max, temp_avg, max_at, sessions, sauna_seconds,
                 longest_session_seconds, session_avg, settings_hash, computed_at)
             VALUES
                (:day, :samples, :min, :max, :avg, :max_at, :sessions, :sauna,
                 :longest, :session_avg, :hash, UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE
                samples = VALUES(samples), temp_min = VALUES(temp_min), temp_max = VALUES(temp_max),
                temp_avg = VALUES(temp_avg), max_at = VALUES(max_at), sessions = VALUES(sessions),
                sauna_seconds = VALUES(sauna_seconds), longest_session_seconds = VALUES(longest_session_seconds),
                session_avg = VALUES(session_avg), settings_hash = VALUES(settings_hash),
                computed_at = VALUES(computed_at)'
        );
        $stmt->execute([
            ':day'         => $s['date'],
            ':samples'     => $s['samples'],
            ':min'         => $s['min'],
            ':max'         => $s['max'],
            ':avg'         => $s['avg'],
            ':max_at'      => $s['max_at'] !== null ? Time::utc($s['max_at']) : null,
            ':sessions'    => $s['sessions'],
            ':sauna'       => $s['sauna_seconds'],
            ':longest'     => $s['longest_session_seconds'],
            ':session_avg' => $s['session_avg'],
            ':hash'        => self::settingsHash(),
        ]);
    }

    /** Leert den Cache, z. B. nach dem Erzeugen von Testdaten. */
    public static function clearCache(): void
    {
        Database::pdo()->exec('DELETE FROM daily_summary');
    }

    /**
     * Index des ersten Elements ≥ $value in einer sortierten Liste.
     *
     * @param list<int> $list
     */
    private static function lowerBound(array $list, int $value): int
    {
        $lo = 0;
        $hi = count($list);
        while ($lo < $hi) {
            $mid = ($lo + $hi) >> 1;
            if ($list[$mid] < $value) {
                $lo = $mid + 1;
            } else {
                $hi = $mid;
            }
        }
        return $lo;
    }
}
