<?php

declare(strict_types=1);

/**
 * Lesender und schreibender Zugriff auf die Tabelle `measurements`.
 *
 * Messreihen werden als zwei parallele Arrays geliefert (Zeitstempel und
 * Temperaturen). Das braucht deutlich weniger Speicher als ein Array pro
 * Messpunkt, was bei Monats- und Jahresberechnungen auf Shared Hosting zählt.
 */
final class Measurements
{
    public static function insert(float $temp, ?int $ts = null): int
    {
        $stmt = Database::pdo()->prepare('INSERT INTO measurements (ts, temp_c) VALUES (:ts, :temp)');
        $stmt->execute([
            ':ts'   => Time::utc($ts ?? time()),
            ':temp' => round($temp, 2),
        ]);
        return (int) Database::pdo()->lastInsertId();
    }

    /**
     * Messwerte im Bereich [$from, $to) als parallele Arrays.
     *
     * @return array{t: list<int>, v: list<float>}
     */
    public static function series(int $from, int $to): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT UNIX_TIMESTAMP(ts) AS t, temp_c AS v
               FROM measurements
              WHERE ts >= :from AND ts < :to
              ORDER BY ts, id'
        );
        $stmt->execute([':from' => Time::utc($from), ':to' => Time::utc($to)]);

        $t = [];
        $v = [];
        while (($row = $stmt->fetch(PDO::FETCH_NUM)) !== false) {
            $t[] = (int) $row[0];
            $v[] = (float) $row[1];
        }
        return ['t' => $t, 'v' => $v];
    }

    /**
     * Messpunkte für ECharts: [Millisekunden, Temperatur]. Bei Lücken, die
     * länger als $gapSeconds sind, wird ein Punkt mit null eingefügt. Dadurch
     * unterbricht das Diagramm die Linie, statt die Lücke zu überbrücken.
     *
     * @param list<int> $t
     * @param list<float> $v
     * @return list<array{0: int, 1: float|null}>
     */
    public static function chartPoints(array $t, array $v, int $gapSeconds): array
    {
        $points = [];
        $count = count($t);
        for ($i = 0; $i < $count; $i++) {
            if ($i > 0 && $t[$i] - $t[$i - 1] > $gapSeconds) {
                $points[] = [intdiv($t[$i] + $t[$i - 1], 2) * 1000, null];
            }
            $points[] = [$t[$i] * 1000, round($v[$i], 2)];
        }
        return $points;
    }

    /**
     * Letzte Messung oder null, wenn die Tabelle leer ist.
     *
     * @return array{t: int, v: float}|null
     */
    public static function latest(): ?array
    {
        $row = Database::pdo()
            ->query('SELECT UNIX_TIMESTAMP(ts) AS t, temp_c AS v FROM measurements ORDER BY ts DESC, id DESC LIMIT 1')
            ->fetch();
        return $row ? ['t' => (int) $row['t'], 'v' => (float) $row['v']] : null;
    }

    /**
     * Zeitstempel der ersten und letzten Messung.
     *
     * @return array{first: ?int, last: ?int}
     */
    public static function bounds(): array
    {
        $row = Database::pdo()
            ->query('SELECT UNIX_TIMESTAMP(MIN(ts)) AS first, UNIX_TIMESTAMP(MAX(ts)) AS last FROM measurements')
            ->fetch();
        return [
            'first' => $row && $row['first'] !== null ? (int) $row['first'] : null,
            'last'  => $row && $row['last'] !== null ? (int) $row['last'] : null,
        ];
    }

    /**
     * Letzter Zeitpunkt vor $before, an dem der Schwellwert erreicht war.
     * Nutzt den Index auf `ts` rückwärts und ist daher schnell.
     */
    public static function lastHotBefore(int $before, float $threshold): ?int
    {
        $stmt = Database::pdo()->prepare(
            'SELECT UNIX_TIMESTAMP(ts) FROM measurements
              WHERE ts < :before AND temp_c >= :thr
              ORDER BY ts DESC LIMIT 1'
        );
        $stmt->execute([':before' => Time::utc($before), ':thr' => $threshold]);
        $value = $stmt->fetchColumn();
        return $value === false || $value === null ? null : (int) $value;
    }

    /** Erster Zeitpunkt ab $after, an dem der Schwellwert erreicht war. */
    public static function firstHotAfter(int $after, float $threshold): ?int
    {
        $stmt = Database::pdo()->prepare(
            'SELECT UNIX_TIMESTAMP(ts) FROM measurements
              WHERE ts >= :after AND temp_c >= :thr
              ORDER BY ts ASC LIMIT 1'
        );
        $stmt->execute([':after' => Time::utc($after), ':thr' => $threshold]);
        $value = $stmt->fetchColumn();
        return $value === false || $value === null ? null : (int) $value;
    }

    /**
     * Beginn der letzten heissen Phase vor $before. Läuft eine Session über
     * Mitternacht, liefert das ihren Start und nicht die Minuten nach 00:00.
     */
    public static function hotPhaseStartBefore(int $before, float $threshold): ?int
    {
        $hot = self::lastHotBefore($before, $threshold);
        if ($hot === null) {
            return null;
        }
        $stmt = Database::pdo()->prepare(
            'SELECT UNIX_TIMESTAMP(ts) FROM measurements
              WHERE ts < :hot AND temp_c < :thr
              ORDER BY ts DESC LIMIT 1'
        );
        $stmt->execute([':hot' => Time::utc($hot), ':thr' => $threshold]);
        $cold = $stmt->fetchColumn();
        return $cold === false || $cold === null ? self::firstHotAfter(0, $threshold) : self::firstHotAfter((int) $cold, $threshold);
    }

    /**
     * Beginn der nächsten heissen Phase ab $after, die nicht schon vorher
     * begonnen hat (eine Session über Mitternacht wird übersprungen).
     */
    public static function hotPhaseStartAfter(int $after, float $threshold): ?int
    {
        $stmt = Database::pdo()->prepare(
            'SELECT UNIX_TIMESTAMP(ts) FROM measurements
              WHERE ts >= :after AND temp_c < :thr
              ORDER BY ts ASC LIMIT 1'
        );
        $stmt->execute([':after' => Time::utc($after), ':thr' => $threshold]);
        $cold = $stmt->fetchColumn();
        if ($cold === false || $cold === null) {
            return null;
        }
        return self::firstHotAfter((int) $cold, $threshold);
    }

    /**
     * Min, Max und Durchschnitt im Bereich [$from, $to) direkt in SQL.
     *
     * @return array{min: ?float, max: ?float, count: int}
     */
    public static function aggregate(int $from, int $to): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT MIN(temp_c) AS mn, MAX(temp_c) AS mx, COUNT(*) AS n
               FROM measurements WHERE ts >= :from AND ts < :to'
        );
        $stmt->execute([':from' => Time::utc($from), ':to' => Time::utc($to)]);
        $row = $stmt->fetch();
        return [
            'min'   => $row['mn'] !== null ? (float) $row['mn'] : null,
            'max'   => $row['mx'] !== null ? (float) $row['mx'] : null,
            'count' => (int) $row['n'],
        ];
    }
}
