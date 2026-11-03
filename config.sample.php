<?php
/**
 * Sauna-Monitor – Konfiguration
 *
 * Diese Datei als `config.php` speichern (umbenennen) und ausfüllen.
 * `config.php` ist per .htaccess vor Direktzugriff geschützt und gehört
 * nicht ins Git-Repository.
 */

return [

    // -----------------------------------------------------------------------
    // Datenbank (hPanel → Datenbanken → MySQL-Datenbanken)
    // Auf Hostinger ist der Host von PHP aus immer "localhost".
    // -----------------------------------------------------------------------
    'db' => [
        'host'    => 'localhost',
        'port'    => 3306,
        'name'    => 'u000000000_sauna',
        'user'    => 'u000000000_sauna',
        'pass'    => 'HIER-DB-PASSWORT-EINTRAGEN',
        'charset' => 'utf8mb4',
    ],

    // -----------------------------------------------------------------------
    // API-Key für den ESP32 (Header "X-API-Key").
    // Einen langen Zufallswert verwenden, z. B. von
    // https://www.random.org/strings/ oder mit `openssl rand -hex 32`.
    // -----------------------------------------------------------------------
    'api_key' => 'HIER-LANGEN-ZUFAELLIGEN-KEY-EINTRAGEN',

    // Zeitzone für alle Anzeigen und Tagesgrenzen.
    'timezone' => 'Europe/Zurich',

    // -----------------------------------------------------------------------
    // Erkennung der Sauna-Sessions
    // -----------------------------------------------------------------------
    'session' => [
        // Eine Session beginnt, wenn die Temperatur diesen Wert erreicht,
        // und endet, wenn sie wieder darunter fällt (°C).
        'threshold'       => 40.0,
        // Kürzere Ausschläge über den Schwellwert werden ignoriert (Minuten).
        'min_minutes'     => 5,
        // Fällt die Temperatur nur kurz unter den Schwellwert (z. B. Tür lange
        // offen), werden die beiden Teile zu einer Session verbunden (Minuten).
        'merge_minutes'   => 10,
        // Fehlen während einer Session länger Messwerte, gilt sie als beendet.
        'max_gap_minutes' => 30,
    ],

    // -----------------------------------------------------------------------
    // Anzeige
    // -----------------------------------------------------------------------
    'display' => [
        // Fehlen länger als so viele Minuten Messwerte, wird die Linie im
        // Diagramm unterbrochen statt verbunden.
        'gap_minutes'           => 3,
        // Sensor gilt als offline, wenn die letzte Messung älter ist (Sekunden).
        'offline_after_seconds' => 300,
        // Zeitraum für die Trendberechnung (Minuten).
        'trend_window_minutes'  => 10,
        // Ab dieser Änderung pro Minute gilt der Trend als steigend/fallend.
        'trend_threshold'       => 0.2,
        // Automatische Aktualisierung der Live-Karte (Sekunden).
        'refresh_seconds'       => 30,
        // Farbig hinterlegte Zonen in der Tagesansicht.
        'zones' => [
            ['from' => 60, 'to' => 80,  'label' => 'Finnische Sauna'],
            ['from' => 80, 'to' => 100, 'label' => 'Heiss'],
        ],
    ],

    // -----------------------------------------------------------------------
    // Passwortschutz der Webseite (der ESP-Endpunkt bleibt immer erreichbar)
    // Den Hash mit tools/password_hash.php erzeugen und hier einfügen.
    // -----------------------------------------------------------------------
    'auth' => [
        'enabled'       => false,
        'password_hash' => '',
        // So lange bleibt man angemeldet (Tage).
        'remember_days' => 30,
    ],

    // -----------------------------------------------------------------------
    // Wartung: alte Messwerte löschen (maintenance/cleanup.php per Cronjob)
    // -----------------------------------------------------------------------
    'retention' => [
        'enabled' => false,
        'years'   => 5,
    ],

    // Zeigt bei Fehlern technische Details an. Im Betrieb auf false lassen.
    'debug' => false,
];
