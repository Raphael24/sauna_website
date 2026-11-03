/**
 * Einstieg: verbindet Live-Karte, Navigation, Router und Ansichten.
 */

import { api } from './api.js';
import { invalidatePalette } from './colors.js';
import * as D from './dates.js';
import { fmtTime } from './format.js';
import { LiveCard } from './live.js';
import { PeriodNav, periodKey } from './nav.js';
import { Router } from './router.js';
import { initTheme } from './theme.js';
import { toast } from './ui.js';
import { DayView } from './views/day.js';
import { MonthView } from './views/month.js';
import { YearView } from './views/year.js';

const VIEW_CLASSES = { day: DayView, month: MonthView, year: YearView };

const viewEl = document.getElementById('view');
const footerStatus = document.getElementById('footer-status');

let range = { first_date: null, last_date: null, last_session_date: null };
let currentView = null;
let currentKind = null;
let shownKey = null;

const router = new Router();

function getBounds() {
    const today = D.today();
    return {
        min: range.first_date && range.first_date < today ? range.first_date : today,
        max: today,
    };
}

function navigate(next, meta = {}) {
    router.navigate(next, meta);
}

const nav = new PeriodNav({ router, getBounds });

/* ---------------------------------------------------------------------------
   Ansichten
   --------------------------------------------------------------------------- */

function showView(state, meta = {}) {
    nav.update(state);
    const key = `${state.view}:${periodKey(state)}`;
    if (key === shownKey && currentKind === state.view) {
        return;
    }
    shownKey = key;

    if (currentKind !== state.view) {
        currentView?.destroy();
        currentView = new VIEW_CLASSES[state.view](viewEl, { navigate });
        currentKind = state.view;
    }
    currentView.show(state, meta);

    if (meta.source && meta.source !== 'history' && meta.source !== 'init') {
        // Nach dem Blättern Fokus nicht verlieren, aber Bildschirmleser informieren.
        viewEl.setAttribute('aria-label', document.getElementById('period-title-text').textContent);
    }
}

router.subscribe((state, prev, meta) => {
    let direction = meta.direction;
    if (direction === undefined && state.view === prev.view) {
        direction = state.date > prev.date ? 1 : state.date < prev.date ? -1 : 0;
    }
    showView(state, { ...meta, direction });
});

/* ---------------------------------------------------------------------------
   Live-Karte: aktualisiert sich selbst und stösst bei «heute» die Ansicht an
   --------------------------------------------------------------------------- */

let lastLiveTs = null;

const live = new LiveCard(document.getElementById('live'), {
    onUpdate(data) {
        if (footerStatus) {
            footerStatus.textContent = `Aktualisiert um ${fmtTime(Date.now())} Uhr`;
        }
        // Neue Messung → heutige Tages- bzw. Monatsansicht still nachladen.
        if (data.has_data && data.ts !== lastLiveTs) {
            const firstUpdate = lastLiveTs === null;
            lastLiveTs = data.ts;
            if (!firstUpdate && periodKey(router.state) === periodKey({ ...router.state, date: D.today() })) {
                currentView?.refresh();
            }
        }
        // Mitternacht überschritten: Grenzen und Navigation anpassen.
        if (data.today?.date && data.today.date !== nav.lastToday) {
            nav.lastToday = data.today.date;
            nav.update(router.state);
        }
    },
});

/* ---------------------------------------------------------------------------
   Links innerhalb der App ohne Neuladen öffnen
   --------------------------------------------------------------------------- */

document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-nav]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
    }
    e.preventDefault();
    const next = Router.stateFromHref(link.href);
    const dir = link.dataset.direction ? Number(link.dataset.direction) : undefined;
    navigate(next, { source: 'link', direction: dir });
    if (next.view !== 'day' || !link.closest('.empty-state')) {
        document.querySelector('.explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});

/* ---------------------------------------------------------------------------
   Tastatur: ← → blättern, T = heute
   --------------------------------------------------------------------------- */

document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) {
        return;
    }
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) {
        return;
    }
    if (t instanceof HTMLElement && t.closest('[data-own-keys], .picker, .js-mode')) {
        return;
    }
    if (nav.picker.isOpen) {
        return;
    }
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nav.step(-1);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nav.step(1);
    } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        nav.goToday();
    }
});

/* ---------------------------------------------------------------------------
   Farbschema
   --------------------------------------------------------------------------- */

initTheme(document.getElementById('theme-toggle'), () => {
    invalidatePalette();
    live.themeChanged();
    currentView?.themeChanged();
});

/* ---------------------------------------------------------------------------
   Start
   --------------------------------------------------------------------------- */

async function loadRange() {
    try {
        range = await api.range();
        live.setLastSessionDate(range.last_session_date);
        nav.update(router.state);
    } catch (err) {
        toast(`Zeitraum der Daten unbekannt: ${err.message}`, { type: 'error' });
    }
}

nav.lastToday = D.today();
live.start();
showView(router.state, { source: 'init' });
loadRange();

// Datenbereich gelegentlich auffrischen (z. B. nach Mitternacht).
setInterval(loadRange, 15 * 60 * 1000);

if (typeof window.echarts === 'undefined') {
    toast('Diagramme sind nicht verfügbar: ECharts konnte nicht geladen werden.', { type: 'error', duration: 8000 });
}
