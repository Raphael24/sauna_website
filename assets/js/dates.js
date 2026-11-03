/**
 * Rechnen mit Kalenderdaten als Text (YYYY-MM-DD).
 *
 * Bewusst ohne lokale Date-Objekte: Gerechnet wird in UTC, wo es keine
 * Zeitumstellung gibt. Das «Heute» kommt aus Europe/Zurich, egal in welcher
 * Zeitzone der Browser läuft.
 */

import { config } from './config.js';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parse(str) {
    const m = ISO_DAY.exec(str);
    if (!m) {
        return null;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
        return null;
    }
    return { y, m: mo, d };
}

export function isValid(str) {
    return parse(str) !== null;
}

export function toStr(y, m, d) {
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(str, n) {
    const { y, m, d } = parse(str);
    const date = new Date(Date.UTC(y, m - 1, d + n));
    return toStr(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addMonths(str, n) {
    const { y, m, d } = parse(str);
    const total = y * 12 + (m - 1) + n;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return toStr(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addYears(str, n) {
    return addMonths(str, n * 12);
}

/** Wochentag mit Montag = 0 … Sonntag = 6. */
export function weekday(str) {
    const { y, m, d } = parse(str);
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function monthKey(str) {
    return str.slice(0, 7);
}

export function yearKey(str) {
    return str.slice(0, 4);
}

export function firstOfMonth(str) {
    return `${str.slice(0, 7)}-01`;
}

export function lastOfMonth(str) {
    const { y, m } = parse(str);
    return toStr(y, m, daysInMonth(y, m));
}

export function min(a, b) {
    return a < b ? a : b;
}

export function max(a, b) {
    return a > b ? a : b;
}

export function clamp(str, lo, hi) {
    let out = str;
    if (lo && out < lo) {
        out = lo;
    }
    if (hi && out > hi) {
        out = hi;
    }
    return out;
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/** Kalenderdatum eines Zeitpunkts (ms) in der Zeitzone der Sauna. */
export function dateOf(ms) {
    const parts = {};
    for (const p of partsFormatter.formatToParts(ms)) {
        parts[p.type] = p.value;
    }
    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function today() {
    return dateOf(Date.now());
}

/** Anzahl Tage zwischen zwei Daten (b − a). */
export function diffDays(a, b) {
    const pa = parse(a);
    const pb = parse(b);
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
