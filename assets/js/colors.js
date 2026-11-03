/**
 * Farben aus den CSS-Variablen lesen und Temperaturen in Farben umrechnen.
 * Nach einem Wechsel zwischen hell und dunkel wird der Zwischenspeicher
 * geleert, damit Diagramme die neuen Farben übernehmen.
 */

let cache = null;

const TEMP_STOPS = [
    [10, '--temp-cold'],
    [30, '--temp-cool'],
    [40, '--temp-warm'],
    [60, '--temp-hot'],
    [80, '--temp-hotter'],
    [100, '--temp-max'],
];

const NAMES = {
    bg: '--bg',
    surface: '--surface',
    surface2: '--surface-2',
    surface3: '--surface-3',
    surfaceRaised: '--surface-raised',
    border: '--border',
    borderStrong: '--border-strong',
    text: '--text',
    textMuted: '--text-muted',
    textSubtle: '--text-subtle',
    accent: '--accent',
    accentText: '--accent-text',
    accentSoft: '--accent-soft',
    ember: '--ember',
    grid: '--chart-grid',
    axis: '--chart-axis',
    label: '--chart-label',
    zone1: '--chart-zone-1',
    zone2: '--chart-zone-2',
    session: '--chart-session',
    sessionBorder: '--chart-session-border',
    tooltipBg: '--chart-tooltip-bg',
    emptyCell: '--chart-empty-cell',
    fontSans: '--font-sans',
};

export function palette() {
    if (cache) {
        return cache;
    }
    const style = getComputedStyle(document.documentElement);
    const out = {};
    for (const [key, name] of Object.entries(NAMES)) {
        out[key] = style.getPropertyValue(name).trim();
    }
    out.stops = TEMP_STOPS.map(([value, name]) => ({
        value,
        color: style.getPropertyValue(name).trim() || '#888888',
    }));
    out.isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    cache = out;
    return out;
}

export function invalidatePalette() {
    cache = null;
}

function hexToRgb(hex) {
    let h = hex.replace('#', '').trim();
    if (h.length === 3) {
        h = h.split('').map((c) => c + c).join('');
    }
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
    return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Farbe für eine Temperatur, stufenlos zwischen den Stützwerten. */
export function tempColor(temp) {
    const stops = palette().stops;
    if (temp === null || temp === undefined || !Number.isFinite(temp)) {
        return stops[1].color;
    }
    if (temp <= stops[0].value) {
        return stops[0].color;
    }
    for (let i = 1; i < stops.length; i++) {
        if (temp <= stops[i].value) {
            const a = stops[i - 1];
            const b = stops[i];
            const t = (temp - a.value) / (b.value - a.value);
            const ca = hexToRgb(a.color);
            const cb = hexToRgb(b.color);
            return rgbToHex(ca.map((v, k) => v + (cb[k] - v) * t));
        }
    }
    return stops[stops.length - 1].color;
}

/** Hex-Farbe mit Deckkraft als rgba(). */
export function alpha(hex, a) {
    if (!hex.startsWith('#')) {
        return hex;
    }
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Gleichmässig verteilte Farbliste für ECharts-visualMap (continuous),
 * damit die Linie exakt dieselben Farben wie der Rest der Seite zeigt.
 */
export function tempRamp(minTemp, maxTemp, steps = 24) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
        out.push(tempColor(minTemp + ((maxTemp - minTemp) * i) / steps));
    }
    return out;
}

/** Intensität 0…1 für den Glutschein: ab ~30 °C sichtbar, bei 95 °C voll. */
export function glowIntensity(temp) {
    if (temp === null || temp === undefined) {
        return 0;
    }
    return Math.max(0, Math.min(1, (temp - 28) / 67));
}
