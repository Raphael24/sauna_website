/*
 * Setzt das Farbschema, bevor die Seite gezeichnet wird (kein Aufblitzen).
 * Bewusst ein klassisches Skript ohne Module, damit es sofort läuft.
 * Gespeicherte Wahl: "light", "dark" oder "system" (Standard).
 */
(function () {
    var pref = 'system';
    try {
        pref = localStorage.getItem('sauna-theme') || 'system';
    } catch (e) {
        /* localStorage gesperrt (z. B. privater Modus) – Systemeinstellung nutzen */
    }
    if (pref !== 'light' && pref !== 'dark') {
        pref = 'system';
    }
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    var resolved = pref === 'system' ? (prefersLight ? 'light' : 'dark') : pref;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-pref', pref);
})();
