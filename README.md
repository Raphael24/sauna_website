# Sauna-Monitor

Webseite zur Anzeige und Auswertung der Sauna-Temperatur. Ein ESP32 sendet jede Minute
die Temperatur, die Seite zeigt den Live-Wert, Tages-, Monats- und Jahresauswertungen mit
automatisch erkannten Sauna-Sessions.

- **Backend:** PHP 8.1+ mit PDO, MySQL/MariaDB
- **Frontend:** HTML, CSS, Vanilla-JavaScript (ES-Module), Apache ECharts 5.5.1 über CDN
- **Kein Build-Schritt:** alle Dateien werden so hochgeladen, wie sie sind

---

## Ordnerstruktur

```
.htaccess                 Sicherheit, HTTPS, Caching
index.php                 Hauptseite (Gerüst, Inhalte lädt das JavaScript)
login.php / logout.php    Optionaler Passwortschutz
config.sample.php         Vorlage → als config.php speichern und ausfüllen
setup.sql                 Tabellen anlegen (phpMyAdmin)
generate_testdata.php     Testdaten erzeugen (nach dem Testen löschen)

api/
  insert.php              POST vom ESP32: {"temp": 85.4}, Header X-API-Key
  current.php             Letzte Messung, Trend, Status (aktiv/heizt auf/aus/offline)
  day.php?date=…          Messpunkte, Kennzahlen und Sessions eines Tages
  month.php?month=…       Pro Tag: Max, Sessions, Saunadauer
  year.php?year=…         Pro Tag (Heatmap) und Monatssummen
  range.php               Erstes/letztes Datum mit Daten

lib/                      PHP-Klassen (per .htaccess gesperrt)
  bootstrap.php           Gemeinsamer Einstieg
  Config.php, Database.php, Http.php, Time.php, Auth.php
  Measurements.php        Zugriff auf die Messwerte
  SessionDetector.php     Erkennung der Sauna-Sessions
  Summary.php             Tageskennzahlen mit Cache

assets/
  css/                    tokens (Farben/Modi), base, layout, components, live, datepicker, views, login
  js/                     main, router, nav, datepicker, live, api, format, dates, colors, theme, ui, icons
  js/views/               day, month, year
  js/charts/base.js       Gemeinsame Diagramm-Einstellungen
  img/favicon.svg

maintenance/cleanup.php   Alte Daten löschen (Cronjob, standardmässig aus)
tools/password_hash.php   Passwort-Hash für den Login erzeugen
storage/sessions/         Sitzungsdateien des Logins (gesperrt)
```

---

## Wie die Auswertung funktioniert

**Session:** beginnt mit der ersten Messung ≥ Schwellwert (Standard 40 °C) und endet mit der
ersten Messung darunter. Kurze Einbrüche (Tür lange offen, bis 10 min) werden zusammengefasst,
Ausreisser unter 5 min verworfen. Alles in `config.php` → `session` einstellbar.

**Aufheizzeit:** gemessen ab *Heizbeginn* (dem Punkt, an dem die Temperatur zu steigen begann)
bis 60 °C bzw. 80 °C – also die Wartezeit, die man tatsächlich erlebt.

**Saunadauer pro Tag:** Eine Session zählt ganz zu dem Tag, an dem sie begonnen hat. Ein
Saunaabend bis nach Mitternacht macht den Folgetag also nicht zum «Saunatag».

**Zeitzone:** In der Datenbank steht UTC, damit jeder Zeitpunkt eindeutig ist – auch in der
Oktobernacht, in der es 02:00–03:00 zweimal gibt. Angezeigt wird alles in Europe/Zurich.

**Warum eine zweite Tabelle (`daily_summary`)?** Die Jahresansicht bräuchte sonst bei jedem
Aufruf rund 525 000 Messwerte. Weil vergangene Tage sich nicht mehr ändern, werden ihre
Kennzahlen einmal berechnet und gespeichert; heute und gestern werden immer live gerechnet.
Ändert man die Session-Einstellungen, rechnet die Seite automatisch neu. Die Tabelle darf
jederzeit geleert werden (`TRUNCATE daily_summary;`).

---

## Einrichtung auf Hostinger – Schritt für Schritt

### 1. PHP-Version prüfen

hPanel → **Websites** → deine Domain → **Erweitert → PHP-Konfiguration** → **PHP 8.2** oder
neuer wählen (mindestens 8.1).

### 2. Datenbank anlegen

1. hPanel → **Datenbanken → MySQL-Datenbanken**.
2. Unter «Neue MySQL-Datenbank und Benutzer erstellen» einen Namen (z. B. `sauna`), einen
   Benutzer (z. B. `sauna`) und ein starkes Passwort eingeben → **Erstellen**.
3. Die vollständigen Namen notieren, Hostinger stellt eine Nummer voran, z. B.
   `u123456789_sauna` (Datenbank) und `u123456789_sauna` (Benutzer).

### 3. Tabellen anlegen (setup.sql)

1. In der Liste der Datenbanken bei deiner Datenbank auf **phpMyAdmin öffnen** klicken.
2. Links die Datenbank auswählen, oben den Reiter **SQL** öffnen.
3. Den Inhalt von `setup.sql` hineinkopieren → **OK**.
4. Links erscheinen die Tabellen `measurements` und `daily_summary`.

### 4. Dateien hochladen

1. hPanel → **Dateien → Dateimanager** → Ordner `public_html` öffnen
   (oder einen Unterordner, z. B. `public_html/sauna`, wenn die Seite unter `/sauna` laufen soll).
2. Alle Dateien und Ordner dieses Projekts hochladen. Am einfachsten: lokal alles als ZIP
   packen, die ZIP-Datei hochladen, rechte Maustaste → **Entpacken**.
3. Wichtig: auch die versteckten Dateien `.htaccess` (im Hauptordner sowie in `lib/`,
   `maintenance/` und `storage/`) müssen mit. Der Ordner `.git` wird nicht gebraucht.

### 5. config.php ausfüllen

1. Im Dateimanager `config.sample.php` kopieren und die Kopie in **`config.php`** umbenennen.
2. `config.php` bearbeiten:
   - `db` → `name`, `user`, `pass` aus Schritt 2 eintragen (`host` bleibt `localhost`).
   - `api_key` → einen langen Zufallswert eintragen (z. B. 64 Zeichen von
     <https://www.random.org/strings/>). Denselben Wert bekommt der ESP32.
   - Optional `session.threshold` (Standard 40 °C) und die Zonen unter `display.zones`.
3. Speichern. Test: `https://deine-domain.ch/config.php` muss **403 Forbidden** zeigen.

### 6. Testdaten erzeugen

1. `https://deine-domain.ch/generate_testdata.php` öffnen.
2. API-Key eingeben, Anzahl Tage (60) lassen → **Testdaten erzeugen**. Dauert einige Sekunden.
3. `https://deine-domain.ch/` öffnen und das Design ausprobieren.
4. Vor dem Echtbetrieb auf derselben Seite **Alle Messwerte löschen** wählen und danach
   `generate_testdata.php` im Dateimanager **löschen**.

### 7. Endpunkt mit curl testen

Im Terminal (Windows: PowerShell oder Git Bash):

```bash
curl -i -X POST "https://deine-domain.ch/api/insert.php" -H "Content-Type: application/json" -H "X-API-Key: DEIN-API-KEY" -d "{\"temp\": 85.4}"
```

Erwartet: `HTTP/1.1 201 Created` und `{"ok":true,"id":…,"ts":…,"temp":85.4}`.

Weitere Prüfungen:

| Aufruf | Erwartung |
| --- | --- |
| ohne Header `X-API-Key` | `401` mit `invalid_api_key` |
| `{"temp": 200}` | `422` mit `temp_out_of_range` |
| `{"temp": "abc"}` | `422` mit `invalid_temp` |
| `GET` statt `POST` | `405` |
| `https://deine-domain.ch/api/current.php` im Browser | JSON mit der letzten Messung |

### 8. SSL prüfen

1. hPanel → **Sicherheit → SSL** → für die Domain muss ein Zertifikat **aktiv** sein
   (Hostinger stellt es kostenlos aus; sonst **Installieren** klicken und einige Minuten warten).
2. `http://deine-domain.ch` aufrufen: Die `.htaccess` leitet automatisch auf `https://` um.
3. Im Browser auf das Schloss-Symbol klicken: «Verbindung ist sicher».
4. Der ESP32 muss `https://` verwenden. Eine Umleitung würde den POST-Inhalt verlieren.

### 9. Optional: Passwortschutz

1. `https://deine-domain.ch/tools/password_hash.php` öffnen, Passwort eingeben, Hash kopieren.
2. In `config.php` unter `auth`: `'enabled' => true` und `'password_hash' => '…'` eintragen.
3. `tools/password_hash.php` löschen.
4. Der ESP-Endpunkt `api/insert.php` bleibt davon unberührt (er nutzt den API-Key).

### 10. Optional: alte Daten automatisch löschen

1. In `config.php` unter `retention`: `'enabled' => true`, `'years' => 5`.
2. hPanel → **Erweitert → Cronjobs** → neuer Cronjob, z. B. wöchentlich:
   ```
   /usr/bin/php /home/u123456789/domains/deine-domain.ch/public_html/maintenance/cleanup.php
   ```
   Den genauen Pfad zeigt der Dateimanager oben an.

---

## ESP32 – Beispiel (Arduino)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

const char* WIFI_SSID = "…";
const char* WIFI_PASS = "…";
const char* URL       = "https://deine-domain.ch/api/insert.php";
const char* API_KEY   = "DEIN-API-KEY";

float readTemperature();   // eigene Sensorfunktion (z. B. MAX31865 mit PT1000)

void sendTemperature(float temp) {
  WiFiClientSecure client;
  client.setInsecure();    // einfach; sicherer: client.setCACert(rootCA)
  HTTPClient http;
  http.begin(client, URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);
  int code = http.POST(String("{\"temp\":") + String(temp, 2) + "}");
  Serial.printf("HTTP %d\n", code);   // 201 = gespeichert
  http.end();
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  sendTemperature(readTemperature());
  delay(60000);
}
```

---

## Bedienung

- **Tag / Monat / Jahr** über den Umschalter; Ansicht und Datum stehen in der URL
  (`?view=day&date=2026-11-03`, `?view=month&date=2026-11`, `?view=year&date=2026`).
- **Tastatur:** ← → blättern, **T** springt zu heute, **Esc** schliesst den Datumswähler.
- **Datumswähler:** Klick auf den Titel; Tage und Monate mit Saunadaten sind markiert.
- **Diagramm:** Mausrad bzw. zwei Finger zoomen, Regler unten verschiebt,
  «Auf Session zoomen» springt direkt zur Saunazeit; ein Klick auf eine Session in der Liste
  zoomt auf genau diese.
- **Darstellung:** Knopf oben rechts wechselt System → Hell → Dunkel (wird gespeichert).

## Fehlersuche

| Problem | Lösung |
| --- | --- |
| «Die Datenbank ist nicht erreichbar» | Zugangsdaten in `config.php` prüfen, `host` = `localhost` |
| «config.php fehlt» | `config.sample.php` kopieren und in `config.php` umbenennen |
| Weisse Seite / 500 | Vorübergehend `'debug' => true` in `config.php`, Seite neu laden |
| Diagramme fehlen | Internetverbindung zum CDN (cdn.jsdelivr.net) prüfen |
| Werte nach Datenänderung falsch | In phpMyAdmin `TRUNCATE daily_summary;` ausführen |
| ESP bekommt 401 | API-Key in ESP und `config.php` vergleichen (Gross-/Kleinschreibung) |
