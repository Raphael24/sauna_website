<?php
/**
 * GET api/year.php?year=YYYY
 *
 * Pro Tag Max-Temperatur und Saunadauer (für die Heatmap) sowie die
 * Monatssummen und Jahreskennzahlen.
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';

Http::api();
Http::requireMethod('GET');
Auth::requireApi();

// Das erste Berechnen eines ganzen Jahres kann einige Sekunden dauern.
@set_time_limit(120);

$year = Http::query('year', '/^(19|20)\d{2}$/', substr(Time::today(), 0, 4));
$today = Time::today();

$summaries = Summary::days("{$year}-01-01", "{$year}-12-31");

$days = [];
$months = [];
for ($m = 1; $m <= 12; $m++) {
    $months[$m] = ['month' => $m, 'sauna_days' => 0, 'sessions' => 0, 'sauna_seconds' => 0, 'max' => null];
}

$totals = ['sauna_days' => 0, 'sessions' => 0, 'sauna_seconds' => 0];
$record = null;
$longest = null;

foreach ($summaries as $date => $s) {
    $isSaunaDay = $s['sauna_seconds'] > 0;
    $m = (int) substr($date, 5, 2);

    if ($s['samples'] > 0) {
        $days[] = [
            'date'          => $date,
            'max'           => $s['max'],
            'sessions'      => $s['sessions'],
            'sauna_seconds' => $s['sauna_seconds'],
            'sauna_day'     => $isSaunaDay,
        ];
    }

    if ($isSaunaDay) {
        $months[$m]['sauna_days']++;
        $totals['sauna_days']++;
        if ($s['max'] !== null && ($months[$m]['max'] === null || $s['max'] > $months[$m]['max'])) {
            $months[$m]['max'] = $s['max'];
        }
        if ($s['max'] !== null && ($record === null || $s['max'] > $record['max'])) {
            $record = ['date' => $date, 'max' => $s['max'], 'max_at' => Time::ms($s['max_at'])];
        }
    }
    $months[$m]['sessions'] += $s['sessions'];
    $months[$m]['sauna_seconds'] += $s['sauna_seconds'];
    $totals['sessions'] += $s['sessions'];
    $totals['sauna_seconds'] += $s['sauna_seconds'];

    if ($s['longest_session_seconds'] > 0 && ($longest === null || $s['longest_session_seconds'] > $longest['seconds'])) {
        $longest = ['date' => $date, 'seconds' => $s['longest_session_seconds']];
    }
}

Http::json([
    'year'      => (int) $year,
    'today'     => $today,
    'threshold' => Config::float('session.threshold', 40.0),
    'days'      => $days,
    'months'    => array_values($months),
    'totals'    => $totals + [
        'record'          => $record,
        'longest_session' => $longest,
    ],
]);
