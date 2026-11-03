<?php
/**
 * GET api/range.php
 *
 * Erstes und letztes Datum mit Messwerten sowie der letzte Tag mit einer
 * Session. Das Frontend begrenzt damit Kalender und Blättern.
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';

Http::api();
Http::requireMethod('GET');
Auth::requireApi();

$bounds = Measurements::bounds();
$lastHot = Measurements::hotPhaseStartBefore(time() + 60, Config::float('session.threshold', 40.0));

Http::json([
    'has_data'          => $bounds['first'] !== null,
    'first_date'        => $bounds['first'] !== null ? Time::localDate($bounds['first']) : null,
    'last_date'         => $bounds['last'] !== null ? Time::localDate($bounds['last']) : null,
    'last_session_date' => $lastHot !== null ? Time::localDate($lastHot) : null,
    'today'             => Time::today(),
    'timezone'          => Config::get('timezone', 'Europe/Zurich'),
]);
