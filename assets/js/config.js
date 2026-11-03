/**
 * Einstellungen, die index.php aus config.php in die Seite schreibt.
 */

const DEFAULTS = {
    threshold: 40,
    refreshSeconds: 30,
    offlineAfter: 300,
    gapMinutes: 3,
    zones: [
        { from: 60, to: 80, label: 'Finnische Sauna' },
        { from: 80, to: 100, label: 'Heiss' },
    ],
    timezone: 'Europe/Zurich',
    auth: false,
    today: null,
};

function read() {
    const el = document.getElementById('app-config');
    if (!el) {
        return {};
    }
    try {
        return JSON.parse(el.textContent || '{}');
    } catch {
        return {};
    }
}

export const config = Object.freeze({ ...DEFAULTS, ...read() });
