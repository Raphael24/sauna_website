/**
 * Ansicht und Datum in der URL: ?view=day&date=2026-11-03,
 * ?view=month&date=2026-11 oder ?view=year&date=2026.
 * So lassen sich Links teilen und der Zurück-Button funktioniert.
 */

import * as D from './dates.js';

export const VIEWS = ['day', 'month', 'year'];

function anchorFromParam(param, fallback) {
    if (!param) {
        return fallback;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(param) && D.isValid(param)) {
        return param;
    }
    if (/^\d{4}-\d{2}$/.test(param) && D.isValid(`${param}-01`)) {
        // Im laufenden Monat auf heute, sonst auf den Monatsersten zeigen.
        return param === fallback.slice(0, 7) ? fallback : `${param}-01`;
    }
    if (/^\d{4}$/.test(param)) {
        return param === fallback.slice(0, 4) ? fallback : `${param}-01-01`;
    }
    return fallback;
}

export function dateParam(state) {
    if (state.view === 'month') {
        return D.monthKey(state.date);
    }
    if (state.view === 'year') {
        return D.yearKey(state.date);
    }
    return state.date;
}

/**
 * Der laufende Zeitraum bekommt kein Datum in der URL. So zeigt ein Neuladen,
 * ein Lesezeichen oder ein wiederhergestellter Tab immer den aktuellen Tag.
 */
export function urlFor(state) {
    const params = new URLSearchParams();
    params.set('view', state.view);
    if (dateParam(state) !== dateParam({ ...state, date: D.today() })) {
        params.set('date', dateParam(state));
    }
    return `?${params.toString()}`;
}

export function parseUrl(search = window.location.search) {
    const params = new URLSearchParams(search);
    const today = D.today();
    const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'day';
    const date = D.clamp(anchorFromParam(params.get('date'), today), null, today);
    return { view, date };
}

export class Router {
    constructor() {
        this.state = parseUrl();
        this.listeners = new Set();

        // Startzustand sauber in die URL schreiben (ohne neuen Verlaufseintrag).
        history.replaceState(this.state, '', urlFor(this.state));

        window.addEventListener('popstate', (event) => {
            const prev = this.state;
            // Ohne Datum in der URL gilt «heute», auch wenn seither Mitternacht war.
            const hasDate = new URLSearchParams(window.location.search).has('date');
            this.state = hasDate && event.state && VIEWS.includes(event.state.view) ? event.state : parseUrl();
            this.emit(prev, { source: 'history' });
        });
    }

    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    emit(prev, meta) {
        for (const fn of this.listeners) {
            fn(this.state, prev, meta);
        }
    }

    /**
     * Neuen Zustand setzen. Unveränderte Zustände erzeugen keinen Eintrag.
     */
    navigate(next, meta = {}) {
        const today = D.today();
        const state = {
            view: VIEWS.includes(next.view) ? next.view : this.state.view,
            date: D.clamp(next.date ?? this.state.date, null, today),
        };
        const prev = this.state;
        if (state.view === prev.view && dateParam(state) === dateParam(prev) && state.date === prev.date) {
            return;
        }
        this.state = state;
        const sameUrl = urlFor(state) === urlFor(prev);
        if (meta.replace || sameUrl) {
            history.replaceState(state, '', urlFor(state));
        } else {
            history.pushState(state, '', urlFor(state));
        }
        this.emit(prev, meta);
    }

    /** Link-Ziel (href) in einen Zustand übersetzen. */
    static stateFromHref(href) {
        const url = new URL(href, document.baseURI);
        return parseUrl(url.search);
    }
}
