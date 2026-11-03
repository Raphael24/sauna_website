<?php

declare(strict_types=1);

/**
 * Erkennt Sauna-Sessions in einer Messreihe.
 *
 * Regeln:
 *  - Eine Session beginnt mit der ersten Messung ≥ Schwellwert und endet mit
 *    der ersten Messung darunter.
 *  - Fehlen mitten in einer Session länger als `max_gap_minutes` Messwerte,
 *    endet die Session bei der letzten Messung vor der Lücke.
 *  - Liegen zwei Sessions höchstens `merge_minutes` auseinander (z. B. weil
 *    die Tür lange offen war), werden sie zu einer verbunden.
 *  - Sessions kürzer als `min_minutes` werden verworfen (Messausreisser).
 *  - Endet die Messreihe über dem Schwellwert, ist die Session «offen».
 *
 * Zusätzlich wird der Heizbeginn gesucht: Ab dem Start der Session wird
 * zurückgegangen, solange die Temperatur davor tiefer war. Die Aufheizzeiten
 * bis 60 °C und 80 °C werden ab diesem Heizbeginn gemessen, weil das der
 * Wartezeit entspricht, die man tatsächlich erlebt.
 */
final class SessionDetector
{
    /** Maximal so weit wird nach dem Heizbeginn zurückgesucht (Sekunden). */
    private const HEAT_LOOKBACK = 3 * 3600;
    /** Rauschtoleranz bei der Suche nach dem Heizbeginn (°C). */
    private const HEAT_NOISE = 0.15;

    /**
     * @param list<int>   $t Zeitstempel, aufsteigend sortiert
     * @param list<float> $v Temperaturen
     * @param array{threshold: float, min_minutes: int, merge_minutes: int, max_gap_minutes: int} $settings
     * @return list<array<string, mixed>>
     */
    public static function detect(array $t, array $v, array $settings): array
    {
        $count = count($t);
        if ($count === 0) {
            return [];
        }

        $threshold = $settings['threshold'];
        $maxGap = $settings['max_gap_minutes'] * 60;

        $raw = [];
        $cur = null;

        for ($i = 0; $i < $count; $i++) {
            $ts = $t[$i];
            $temp = $v[$i];

            if ($cur !== null && $i > 0 && $ts - $t[$i - 1] > $maxGap) {
                $cur['end'] = $t[$i - 1];
                $raw[] = $cur;
                $cur = null;
            }

            if ($temp >= $threshold) {
                if ($cur === null) {
                    $cur = [
                        'start'     => $ts,
                        'start_idx' => $i,
                        'end'       => $ts,
                        'open'      => false,
                        'max'       => $temp,
                        'max_at'    => $ts,
                        'sum'       => 0.0,
                        'n'         => 0,
                        't60'       => null,
                        't80'       => null,
                    ];
                }
                $cur['sum'] += $temp;
                $cur['n']++;
                if ($temp > $cur['max']) {
                    $cur['max'] = $temp;
                    $cur['max_at'] = $ts;
                }
                if ($cur['t60'] === null && $temp >= 60) {
                    $cur['t60'] = $ts;
                }
                if ($cur['t80'] === null && $temp >= 80) {
                    $cur['t80'] = $ts;
                }
            } elseif ($cur !== null) {
                $cur['end'] = $ts;
                $raw[] = $cur;
                $cur = null;
            }
        }

        if ($cur !== null) {
            $cur['end'] = $t[$count - 1];
            $cur['open'] = true;
            $raw[] = $cur;
        }

        $merged = self::merge($raw, $settings['merge_minutes'] * 60);

        $minDuration = $settings['min_minutes'] * 60;
        $sessions = [];
        foreach ($merged as $s) {
            if (!$s['open'] && $s['end'] - $s['start'] < $minDuration) {
                continue;
            }
            $sessions[] = self::finish($s, $t, $v, $maxGap);
        }
        return $sessions;
    }

    /**
     * @param list<array<string, mixed>> $raw
     * @return list<array<string, mixed>>
     */
    private static function merge(array $raw, int $mergeGap): array
    {
        $out = [];
        foreach ($raw as $s) {
            $lastKey = array_key_last($out);
            if ($lastKey !== null && $s['start'] - $out[$lastKey]['end'] <= $mergeGap) {
                $prev = &$out[$lastKey];
                $prev['end'] = $s['end'];
                $prev['open'] = $s['open'];
                $prev['sum'] += $s['sum'];
                $prev['n'] += $s['n'];
                if ($s['max'] > $prev['max']) {
                    $prev['max'] = $s['max'];
                    $prev['max_at'] = $s['max_at'];
                }
                $prev['t60'] ??= $s['t60'];
                $prev['t80'] ??= $s['t80'];
                unset($prev);
                continue;
            }
            $out[] = $s;
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $s
     * @param list<int> $t
     * @param list<float> $v
     * @return array<string, mixed>
     */
    private static function finish(array $s, array $t, array $v, int $maxGap): array
    {
        // Heizbeginn: zurückgehen, solange die vorherige Messung tiefer war.
        $j = $s['start_idx'];
        while (
            $j > 0
            && $t[$j] - $t[$j - 1] <= $maxGap
            && $s['start'] - $t[$j - 1] <= self::HEAT_LOOKBACK
            && $v[$j - 1] < $v[$j] + self::HEAT_NOISE
        ) {
            $j--;
        }
        $heatStart = $t[$j];

        return [
            'start'            => $s['start'],
            'end'              => $s['end'],
            'open'             => $s['open'],
            'duration'         => $s['end'] - $s['start'],
            'max'              => round($s['max'], 2),
            'max_at'           => $s['max_at'],
            'avg'              => $s['n'] > 0 ? round($s['sum'] / $s['n'], 2) : null,
            'heat_start'       => $heatStart,
            'heat_start_temp'  => round($v[$j], 2),
            'heatup_60'        => $s['t60'] !== null ? $s['t60'] - $heatStart : null,
            'heatup_80'        => $s['t80'] !== null ? $s['t80'] - $heatStart : null,
            'reached_60_at'    => $s['t60'],
            'reached_80_at'    => $s['t80'],
        ];
    }
}
