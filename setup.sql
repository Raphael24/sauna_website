-- ---------------------------------------------------------------------------
-- Sauna-Monitor: Datenbankschema
--
-- In phpMyAdmin die Datenbank links auswählen, Reiter "SQL" öffnen,
-- diesen Inhalt einfügen und auf "OK" klicken.
--
-- Hinweis zur Zeitzone: `ts` wird in UTC gespeichert. So ist jeder Zeitpunkt
-- eindeutig, auch in der Nacht der Zeitumstellung (Oktober), in der es die
-- Stunde 02:00–03:00 Schweizer Zeit zweimal gibt. Die Webseite rechnet alle
-- Werte für die Anzeige in Europe/Zurich um.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS measurements (
    id      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    ts      DATETIME      NOT NULL COMMENT 'Empfangszeit in UTC',
    temp_c  DECIMAL(5,2)  NOT NULL COMMENT 'Temperatur in °C',
    PRIMARY KEY (id),
    KEY idx_measurements_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Zwischenspeicher für Tageswerte (Max, Saunadauer, Anzahl Sessions …).
-- Wird automatisch gefüllt, sobald ein Tag abgeschlossen ist, und macht die
-- Monats- und Jahresansicht schnell. Die Tabelle darf jederzeit geleert
-- werden (TRUNCATE daily_summary), sie wird dann neu berechnet.
CREATE TABLE IF NOT EXISTS daily_summary (
    day                      DATE              NOT NULL COMMENT 'Kalendertag in Europe/Zurich',
    samples                  INT UNSIGNED      NOT NULL DEFAULT 0,
    temp_min                 DECIMAL(5,2)      NULL,
    temp_max                 DECIMAL(5,2)      NULL,
    temp_avg                 DECIMAL(5,2)      NULL,
    max_at                   DATETIME          NULL COMMENT 'UTC',
    sessions                 SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    sauna_seconds            INT UNSIGNED      NOT NULL DEFAULT 0,
    longest_session_seconds  INT UNSIGNED      NOT NULL DEFAULT 0,
    session_avg              DECIMAL(5,2)      NULL,
    settings_hash            CHAR(8)           NOT NULL COMMENT 'Session-Einstellungen bei der Berechnung',
    computed_at              DATETIME          NOT NULL COMMENT 'UTC',
    PRIMARY KEY (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
