<?php
/**
 * Gemeinsamer Einstieg für alle PHP-Seiten und API-Endpunkte.
 * Lädt die Konfiguration, setzt Zeitzone und Fehlerbehandlung.
 */

declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));

require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Time.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Measurements.php';
require_once __DIR__ . '/SessionDetector.php';
require_once __DIR__ . '/Summary.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// Warnungen und Notices als Exceptions behandeln, damit nichts still schiefgeht.
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

try {
    Config::load(APP_ROOT . '/config.php');
} catch (Throwable $e) {
    Http::fatal($e, 'Die Konfiguration konnte nicht geladen werden. Ist config.php vorhanden?');
}

date_default_timezone_set(Config::get('timezone', 'Europe/Zurich'));
