<?php
/**
 * GET api/month.php?month=YYYY-MM
 *
 * Pro Tag: Max-Temperatur, Anzahl Sessions und Saunadauer.
 * Dazu die Monatssummen (Saunatage, Gesamtdauer, heissester Tag).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';

Http::api();
Http::requireMethod('GET');
Auth::requireApi();

$month = Http::query('month', '/^\d{4}-(0[1-9]|1[0-2])$/', substr(Time::today(), 0, 7));
$first = Time::parseDate($month . '-01');
$last = $first->modify('last day of this month');
$today = Time::today();

$summaries = Summary::days($first->format('Y-m-d'), $last->format('Y-m-d'));

$days = [];
$saunaDays = 0;
$sessions = 0;
$seconds = 0;
$longest = 0;
$hottest = null;
foreach ($summaries as $date => $s) {
    $isSaunaDay = $s['sauna_seconds'] > 0;
    $days[] = [
        'date'          => $date,
        'has_data'      => $s['samples'] > 0,
        'future'        => $date > $today,
        'max'           => $s['max'],
        'min'           => $s['min'],
        'avg'           => $s['avg'],
        'sessions'      => $s['sessions'],
        'sauna_seconds' => $s['sauna_seconds'],
        'sauna_day'     => $isSaunaDay,
    ];
    if ($isSaunaDay) {
        $saunaDays++;
    }
    $sessions += $s['sessions'];
    $seconds += $s['sauna_seconds'];
    $longest = max($longest, $s['longest_session_seconds']);
    if ($isSaunaDay && $s['max'] !== null && ($hottest === null || $s['max'] > $hottest['max'])) {
        $hottest = ['date' => $date, 'max' => $s['max'], 'max_at' => Time::ms($s['max_at'])];
    }
}

Http::json([
    'month'     => $month,
    'today'     => $today,
    'threshold' => Config::float('session.threshold', 40.0),
    'days'      => $days,
    'totals'    => [
        'sauna_days'              => $saunaDays,
        'sessions'                => $sessions,
        'sauna_seconds'           => $seconds,
        'avg_seconds_per_day'     => $saunaDays > 0 ? intdiv($seconds, $saunaDays) : 0,
        'longest_session_seconds' => $longest,
        'hottest'                 => $hottest,
    ],
]);
