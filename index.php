<?php
/**
 * Sauna-Monitor – Hauptseite.
 * Die Seite selbst ist ein schlankes Gerüst; Inhalte lädt das JavaScript
 * über die API nach.
 */

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

Auth::requirePage();

/** Hängt die Änderungszeit an, damit Browser nach einem Upload neu laden. */
function asset(string $path): string
{
    $file = __DIR__ . '/' . $path;
    $version = is_file($file) ? (string) filemtime($file) : '0';
    return htmlspecialchars($path . '?v=' . $version, ENT_QUOTES, 'UTF-8');
}

$appConfig = [
    'threshold'      => Config::float('session.threshold', 40.0),
    'refreshSeconds' => max(10, Config::int('display.refresh_seconds', 30)),
    'offlineAfter'   => Config::int('display.offline_after_seconds', 300),
    'gapMinutes'     => Config::int('display.gap_minutes', 3),
    'zones'          => array_values((array) Config::get('display.zones', [])),
    'timezone'       => Config::get('timezone', 'Europe/Zurich'),
    'auth'           => Auth::enabled(),
    'today'          => Time::today(),
];
// JSON_HEX_* verhindert, dass Inhalte das <script>-Element vorzeitig beenden.
$configJson = json_encode(
    $appConfig,
    JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR,
);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
?>
<!doctype html>
<html lang="de-CH">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Sauna</title>
    <meta name="description" content="Live-Temperatur und Auswertung der Sauna.">
    <meta name="color-scheme" content="dark light">
    <meta name="theme-color" content="#161210" media="(prefers-color-scheme: dark)">
    <meta name="theme-color" content="#f7f1ea" media="(prefers-color-scheme: light)">
    <meta name="robots" content="noindex, nofollow">
    <link rel="icon" type="image/svg+xml" href="<?= asset('assets/img/favicon.svg') ?>" id="favicon">

    <script src="<?= asset('assets/js/theme-init.js') ?>"></script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..650&family=Inter:wght@300..700&display=swap">

    <link rel="stylesheet" href="<?= asset('assets/css/tokens.css') ?>">
    <link rel="stylesheet" href="<?= asset('assets/css/base.css') ?>">
    <link rel="stylesheet" href="<?= asset('assets/css/layout.css') ?>">
    <link rel="stylesheet" href="<?= asset('assets/css/components.css') ?>">
    <link rel="stylesheet" href="<?= asset('assets/css/live.css') ?>">
    <link rel="stylesheet" href="<?= asset('assets/css/datepicker.css') ?>">
    <link rel="stylesheet" href="<?= asset('assets/css/views.css') ?>">

    <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js" defer></script>
    <script type="module" src="<?= asset('assets/js/main.js') ?>"></script>
</head>
<body>
<script type="application/json" id="app-config"><?= $configJson ?></script>

<a class="skip-link" href="#main">Zum Inhalt springen</a>

<div class="app">
    <header class="topbar">
        <a class="brand" href="./" aria-label="Sauna – zur heutigen Ansicht">
            <span class="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="32" height="32"><defs><linearGradient id="brand-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e2412b"/><stop offset=".6" stop-color="#ff7a2f"/><stop offset="1" stop-color="#ffc25a"/></linearGradient></defs><path fill="url(#brand-flame)" d="M16.6 2.5c.5 4.2-1.6 6.4-3.7 8.6-2.3 2.4-4.7 4.9-4.7 9.3A7.9 7.9 0 0 0 16 28.5a7.9 7.9 0 0 0 7.8-8c0-3.4-1.6-5.6-3-7.4.1 2.1-.6 3.6-2 4.4.6-4.7-.3-10.4-2.2-15z"/><path fill="#ffe2a8" opacity=".85" d="M16.2 27.3a3.9 3.9 0 0 1-3.9-4c0-2.2 1.5-3.3 2.6-4.6.4 1.4 1.3 2 2.4 2.3a4 4 0 0 1 2.8 2.7 3.9 3.9 0 0 1-3.9 3.6z"/></svg>
            </span>
            <span class="brand-text">
                <span class="brand-name">Sauna</span>
                <span class="brand-sub">Temperatur-Monitor</span>
            </span>
        </a>

        <div class="topbar-actions">
            <button class="icon-btn" id="theme-toggle" type="button" aria-label="Darstellung wechseln" title="Darstellung wechseln"></button>
            <?php if (Auth::enabled()): ?>
                <a class="icon-btn" href="logout.php" aria-label="Abmelden" title="Abmelden">
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>
                </a>
            <?php endif; ?>
        </div>
    </header>

    <main id="main" class="main" tabindex="-1">
        <section class="live" id="live" aria-label="Aktuelle Temperatur" data-state="loading">
            <div class="live-skeleton" aria-hidden="true">
                <div class="skeleton skeleton--pill"></div>
                <div class="skeleton skeleton--hero"></div>
                <div class="skeleton skeleton--line"></div>
            </div>
        </section>

        <section class="explorer" aria-label="Auswertung">
            <div class="period-bar">
                <div class="segmented" id="view-switch" role="radiogroup" aria-label="Ansicht wählen" data-own-keys>
                    <span class="segmented-indicator" aria-hidden="true"></span>
                    <button type="button" role="radio" class="segmented-option" data-view="day" aria-checked="true">Tag</button>
                    <button type="button" role="radio" class="segmented-option" data-view="month" aria-checked="false" tabindex="-1">Monat</button>
                    <button type="button" role="radio" class="segmented-option" data-view="year" aria-checked="false" tabindex="-1">Jahr</button>
                </div>

                <div class="period-nav">
                    <button type="button" class="icon-btn" id="period-prev" aria-label="Zurück" aria-keyshortcuts="ArrowLeft">
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <button type="button" class="period-title" id="period-title" aria-haspopup="dialog" aria-expanded="false">
                        <span class="period-title-text" id="period-title-text">&nbsp;</span>
                        <svg class="period-title-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>
                    </button>
                    <button type="button" class="icon-btn" id="period-next" aria-label="Weiter" aria-keyshortcuts="ArrowRight">
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6"/></svg>
                    </button>
                    <button type="button" class="btn btn--ghost" id="period-today" aria-keyshortcuts="T">Heute</button>
                </div>
            </div>

            <div class="view" id="view" aria-live="polite" aria-busy="true"></div>
        </section>
    </main>

    <footer class="footer">
        <p class="footer-keys">
            <kbd>←</kbd> <kbd>→</kbd> blättern · <kbd>T</kbd> heute · <kbd>Esc</kbd> schliessen
        </p>
        <p class="footer-status" id="footer-status"></p>
    </footer>
</div>

<div class="toast-region" id="toasts" aria-live="assertive" aria-atomic="true"></div>

<noscript>
    <div class="noscript">Diese Seite braucht JavaScript, um die Temperaturen anzuzeigen.</div>
</noscript>
</body>
</html>
