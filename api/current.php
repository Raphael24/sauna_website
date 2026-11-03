<?php
/**
 * GET api/current.php
 *
 * Letzte Messung, Trend der letzten Minuten, Online-Status und Zustand der
 * Sauna (aktiv / heizt auf / aus / offline) für die Live-Karte.
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';

Http::api();
Http::requireMethod('GET');
Auth::requireApi();

$now = time();
$settings = Config::sessionSettings();
$threshold = $settings['threshold'];
$offlineAfter = Config::int('display.offline_after_seconds', 300);
$trendWindow = Config::int('display.trend_window_minutes', 10) * 60;
$trendThreshold = Config::float('display.trend_threshold', 0.2);
$gapSeconds = Config::int('display.gap_minutes', 3) * 60;

[$todayStart, $todayEnd] = Time::dayBounds(Time::today());

$latest = Measurements::latest();
if ($latest === null) {
    Http::json([
        'has_data'   => false,
        'online'     => false,
        'threshold'  => $threshold,
        'server_now' => Time::ms($now),
        'status'     => ['state' => 'offline', 'since' => null],
    ]);
}

$age = max(0, $now - $latest['t']);
$online = $age <= $offlineAfter;

// Letzte 12 Stunden: genug, um eine laufende Session samt Heizbeginn zu finden.
$series = Measurements::series($now - 12 * 3600, $now + 60);

// Trend: lineare Regression über das Trendfenster, Ergebnis in °C pro Minute.
$slope = null;
$xs = [];
$ys = [];
foreach ($series['t'] as $i => $ts) {
    if ($ts >= $latest['t'] - $trendWindow) {
        $xs[] = ($ts - $latest['t']) / 60;
        $ys[] = $series['v'][$i];
    }
}
$n = count($xs);
if ($n >= 3) {
    $mx = array_sum($xs) / $n;
    $my = array_sum($ys) / $n;
    $num = 0.0;
    $den = 0.0;
    for ($i = 0; $i < $n; $i++) {
        $num += ($xs[$i] - $mx) * ($ys[$i] - $my);
        $den += ($xs[$i] - $mx) ** 2;
    }
    $slope = $den > 0 ? $num / $den : 0.0;
}
$direction = 'stable';
if ($slope !== null && $slope >= $trendThreshold) {
    $direction = 'rising';
} elseif ($slope !== null && $slope <= -$trendThreshold) {
    $direction = 'falling';
}

$sessions = SessionDetector::detect($series['t'], $series['v'], $settings);
$last = $sessions === [] ? null : $sessions[count($sessions) - 1];
$active = $online && $last !== null && $last['open'];

if (!$online) {
    $status = ['state' => 'offline', 'since' => null];
} elseif ($active) {
    $status = ['state' => 'active', 'since' => Time::ms($last['start'])];
} elseif ($direction === 'rising' && $latest['v'] < $threshold) {
    // Heizbeginn der laufenden Aufheizphase suchen.
    $since = $latest['t'];
    for ($i = count($series['t']) - 1; $i > 0; $i--) {
        if ($series['v'][$i - 1] >= $series['v'][$i] + 0.15 || $series['t'][$i] - $series['t'][$i - 1] > $gapSeconds * 5) {
            break;
        }
        $since = $series['t'][$i - 1];
    }
    $status = ['state' => 'heating', 'since' => Time::ms($since)];
} else {
    $status = ['state' => 'off', 'since' => null];
}

$sessionOut = static fn (array $s): array => [
    'start'      => Time::ms($s['start']),
    'end'        => Time::ms($s['end']),
    'open'       => $s['open'],
    'duration'   => $s['open'] ? max(0, $now - $s['start']) : $s['duration'],
    'max'        => $s['max'],
    'max_at'     => Time::ms($s['max_at']),
    'avg'        => $s['avg'],
    'heat_start' => Time::ms($s['heat_start']),
    'heatup_60'  => $s['heatup_60'],
    'heatup_80'  => $s['heatup_80'],
];

$lastClosed = null;
for ($i = count($sessions) - 1; $i >= 0; $i--) {
    if (!$sessions[$i]['open']) {
        $lastClosed = $sessionOut($sessions[$i]);
        break;
    }
}

// Verlauf der letzten 3 Stunden für die kleine Kurve in der Live-Karte.
$recentFrom = $now - 3 * 3600;
$rt = [];
$rv = [];
foreach ($series['t'] as $i => $ts) {
    if ($ts >= $recentFrom) {
        $rt[] = $ts;
        $rv[] = $series['v'][$i];
    }
}

$today = Measurements::aggregate($todayStart, $todayEnd);

Http::json([
    'has_data'    => true,
    'temp'        => round($latest['v'], 2),
    'ts'          => Time::ms($latest['t']),
    'age_seconds' => $age,
    'online'      => $online,
    'server_now'  => Time::ms($now),
    'threshold'   => $threshold,
    'trend'       => [
        'direction'      => $direction,
        'slope_per_min'  => $slope !== null ? round($slope, 3) : null,
        'window_minutes' => intdiv($trendWindow, 60),
    ],
    'status'       => $status,
    'session'      => $active ? $sessionOut($last) : null,
    'last_session' => $lastClosed,
    'today'        => [
        'date' => Time::today(),
        'min'  => $today['min'],
        'max'  => $today['max'],
    ],
    'recent' => [
        'from'   => Time::ms($recentFrom),
        'to'     => Time::ms($now),
        'points' => Measurements::chartPoints($rt, $rv, $gapSeconds),
    ],
]);
