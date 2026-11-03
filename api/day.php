<?php
/**
 * GET api/day.php?date=YYYY-MM-DD
 *
 * Alle Messpunkte eines Tages (mit Lücken als null), Min/Max/Durchschnitt
 * und die Sessions, die diesen Tag berühren.
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';

Http::api();
Http::requireMethod('GET');
Auth::requireApi();

$date = Http::query('date', '/^\d{4}-\d{2}-\d{2}$/', Time::today());
[$ds, $de] = Time::dayBounds($date);
$now = time();
$settings = Config::sessionSettings();
$gapSeconds = Config::int('display.gap_minutes', 3) * 60;
$offlineAfter = Config::int('display.offline_after_seconds', 300);

$day = Summary::analyzeDay($date);
$summary = $day['summary'];
$t = $day['series']['t'];
$lastTs = $t === [] ? null : $t[count($t) - 1];

$sessions = [];
foreach ($day['sessions'] as $s) {
    // «Läuft noch» nur, wenn die Messreihe gerade erst endet.
    $ongoing = $s['open'] && $lastTs !== null && $now - $lastTs <= $offlineAfter && $de > $now;
    $sessions[] = [
        'start'            => Time::ms($s['start']),
        'end'              => Time::ms($s['end']),
        'ongoing'          => $ongoing,
        'duration'         => $ongoing ? max(0, $now - $s['start']) : $s['duration'],
        'starts_before'    => $s['start'] < $ds,
        'ends_after'       => $s['end'] > $de,
        'max'              => $s['max'],
        'max_at'           => Time::ms($s['max_at']),
        'avg'              => $s['avg'],
        'heat_start'       => Time::ms($s['heat_start']),
        'heat_start_temp'  => $s['heat_start_temp'],
        'heatup_60'        => $s['heatup_60'],
        'heatup_80'        => $s['heatup_80'],
        'reached_60_at'    => Time::ms($s['reached_60_at']),
        'reached_80_at'    => Time::ms($s['reached_80_at']),
    ];
}

// Nachbartage mit Saunadaten für den Leerzustand und schnelles Blättern.
$prevHot = Measurements::hotPhaseStartBefore($ds, $settings['threshold']);
$nextHot = Measurements::hotPhaseStartAfter($de, $settings['threshold']);

Http::json([
    'date'        => $date,
    'is_today'    => $date === Time::today(),
    'day_start'   => Time::ms($ds),
    'day_end'     => Time::ms($de),
    'server_now'  => Time::ms($now),
    'threshold'   => $settings['threshold'],
    'gap_minutes' => intdiv($gapSeconds, 60),
    'points'      => Measurements::chartPoints($t, $day['series']['v'], $gapSeconds),
    'stats'       => [
        'samples'       => $summary['samples'],
        'min'           => $summary['min'],
        'min_at'        => Time::ms($summary['min_at']),
        'max'           => $summary['max'],
        'max_at'        => Time::ms($summary['max_at']),
        'avg'           => $summary['avg'],
        'session_avg'   => $summary['session_avg'],
        // Wie in Monat und Jahr: nur Sessions, die an diesem Tag begonnen haben.
        'sessions'      => count(array_filter($sessions, static fn (array $s): bool => !$s['starts_before'])),
        'sauna_seconds' => array_sum(array_map(
            static fn (array $s): int => $s['starts_before'] ? 0 : $s['duration'],
            $sessions,
        )),
    ],
    'sessions'  => $sessions,
    'neighbors' => [
        'prev_session_date' => $prevHot !== null ? Time::localDate($prevHot) : null,
        'next_session_date' => $nextHot !== null ? Time::localDate($nextHot) : null,
    ],
]);
