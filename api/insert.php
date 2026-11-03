<?php
/**
 * POST api/insert.php
 * Header:  X-API-Key: <api_key aus config.php>
 * Body:    {"temp": 85.4}
 *
 * Speichert eine Messung. Der Zeitstempel wird hier beim Empfang gesetzt.
 * Antwort: 201 {"ok": true, "id": 123, "ts": 1762184400000, "temp": 85.4}
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';

Http::api();
Http::requireMethod('POST');

$expected = (string) Config::get('api_key', '');
if ($expected === '' || str_starts_with($expected, 'HIER-')) {
    throw new HttpException(500, 'api_key_missing', 'In config.php ist noch kein API-Key eingetragen.');
}

// Je nach PHP-Betriebsart kommt der Header unter einem anderen Namen an.
$provided = $_SERVER['HTTP_X_API_KEY'] ?? $_SERVER['REDIRECT_HTTP_X_API_KEY'] ?? '';
if ($provided === '' && function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        if (strcasecmp($name, 'X-API-Key') === 0) {
            $provided = (string) $value;
            break;
        }
    }
}
if (!is_string($provided) || !hash_equals($expected, $provided)) {
    throw new HttpException(401, 'invalid_api_key', 'Der API-Key fehlt oder ist falsch.');
}

$raw = file_get_contents('php://input', false, null, 0, 4096);
try {
    $data = json_decode($raw === false ? '' : $raw, true, 8, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    throw new HttpException(400, 'invalid_json', 'Der Inhalt ist kein gültiges JSON. Erwartet wird z. B. {"temp": 85.4}.');
}

$temp = is_array($data) ? ($data['temp'] ?? null) : null;
if (is_string($temp) && is_numeric($temp)) {
    $temp = (float) $temp;
}
if (!is_int($temp) && !is_float($temp)) {
    throw new HttpException(422, 'invalid_temp', 'Das Feld «temp» fehlt oder ist keine Zahl.');
}
$temp = (float) $temp;
if (!is_finite($temp) || $temp < -40 || $temp > 150) {
    throw new HttpException(422, 'temp_out_of_range', 'Die Temperatur muss zwischen -40 und 150 °C liegen.');
}

$now = time();
$id = Measurements::insert($temp, $now);

Http::json([
    'ok'   => true,
    'id'   => $id,
    'ts'   => Time::ms($now),
    'temp' => round($temp, 2),
], 201);
