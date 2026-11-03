/**
 * Formatierung für die Schweiz: 85.4 °C, 03.11.2026, 18:42, 2 h 15 min.
 * Alle Uhrzeiten werden in Europe/Zurich angezeigt.
 */

import { config } from './config.js';
import { parse, weekday } from './dates.js';

const LOCALE = 'de-CH';
const TZ = config.timezone;
const NBSP = ' ';

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const numberFormats = new Map();

function numberFormat(digits) {
    if (!numberFormats.has(digits)) {
        numberFormats.set(digits, new Intl.NumberFormat(LOCALE, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }));
    }
    return numberFormats.get(digits);
}

export function fmtNumber(value, digits = 0) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return '–';
    }
    return numberFormat(digits).format(Number(value));
}

/** «85.4 °C» */
export function fmtTemp(value, digits = 1) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return '–';
    }
    return `${fmtNumber(value, digits)}${NBSP}°C`;
}

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

const timeSecFormat = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});

/** «18:42» */
export function fmtTime(ms) {
    return ms === null || ms === undefined ? '–' : timeFormat.format(ms);
}

/** «18:42:07» */
export function fmtTimeSec(ms) {
    return ms === null || ms === undefined ? '–' : timeSecFormat.format(ms);
}

/** «03.11.2026» aus einem Zeitpunkt in ms */
export function fmtDateMs(ms) {
    return dateTimeFormat.format(ms);
}

/** «03.11.2026» aus YYYY-MM-DD */
export function fmtDate(str) {
    const p = parse(str);
    if (!p) {
        return str;
    }
    return `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}`;
}

/** «03.11.» */
export function fmtDateShort(str) {
    const p = parse(str);
    return p ? `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.` : str;
}

/** «Montag, 03.11.2026» */
export function fmtDayTitle(str) {
    return `${WEEKDAYS[weekday(str)]}, ${fmtDate(str)}`;
}

/** «Mo, 03.11.2026» */
export function fmtDayMedium(str) {
    return `${WEEKDAYS_SHORT[weekday(str)]}, ${fmtDate(str)}`;
}

/** «November 2026» */
export function fmtMonthTitle(str) {
    const p = parse(str.length === 7 ? `${str}-01` : str);
    return `${MONTHS[p.m - 1]} ${p.y}`;
}

/**
 * Dauer als Text: «2 h 15 min», «45 min», «0 min».
 */
export function fmtDuration(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
        return '–';
    }
    const totalMin = Math.round(seconds / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) {
        return `${m}${NBSP}min`;
    }
    if (m === 0) {
        return `${h}${NBSP}h`;
    }
    return `${h}${NBSP}h ${m}${NBSP}min`;
}

/**
 * Dauer als HTML mit kleinen Einheiten für die Kennzahlen-Karten.
 */
export function fmtDurationHtml(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
        return '–';
    }
    const totalMin = Math.round(seconds / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const unit = (u) => `<span class="unit">${u}</span>`;
    if (h === 0) {
        return `${m}${unit('min')}`;
    }
    if (m === 0) {
        return `${h}${unit('h')}`;
    }
    return `${h}${unit('h')} ${m}${unit('min')}`;
}

/** Gesamtstunden «48.5 h» */
export function fmtHours(seconds, digits = 1) {
    return `${fmtNumber(seconds / 3600, digits)}${NBSP}h`;
}

/**
 * Relative Zeit: «gerade eben», «vor 30 Sekunden», «vor 5 Minuten».
 */
export function fmtRelative(ms, now = Date.now()) {
    const sec = Math.max(0, Math.round((now - ms) / 1000));
    if (sec < 10) {
        return 'gerade eben';
    }
    if (sec < 60) {
        return `vor ${Math.floor(sec / 5) * 5} Sekunden`;
    }
    const min = Math.floor(sec / 60);
    if (min === 1) {
        return 'vor 1 Minute';
    }
    if (min < 60) {
        return `vor ${min} Minuten`;
    }
    const h = Math.floor(min / 60);
    if (h === 1) {
        return 'vor 1 Stunde';
    }
    if (h < 24) {
        return `vor ${h} Stunden`;
    }
    const d = Math.floor(h / 24);
    return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}

/** «+0.8 °C/min» */
export function fmtSlope(slope) {
    if (slope === null || slope === undefined) {
        return '';
    }
    const sign = slope > 0.05 ? '+' : slope < -0.05 ? '−' : '±';
    return `${sign}${fmtNumber(Math.abs(slope), 1)}${NBSP}°C/min`;
}
