/**
 * Navigationsleiste: Umschalter Tag/Monat/Jahr, Pfeile, Titel mit
 * Datumswähler und «Heute».
 */

import * as D from './dates.js';
import { DatePicker } from './datepicker.js';
import { fmtDayMedium, fmtDayTitle, fmtMonthTitle } from './format.js';

const UNIT = {
    day: { prev: 'Vorheriger Tag', next: 'Nächster Tag', today: 'Zu heute springen' },
    month: { prev: 'Vorheriger Monat', next: 'Nächster Monat', today: 'Zum aktuellen Monat springen' },
    year: { prev: 'Vorheriges Jahr', next: 'Nächstes Jahr', today: 'Zum aktuellen Jahr springen' },
};

/** Datum um einen Zeitraum der Ansicht verschieben. */
export function shift(state, dir) {
    if (state.view === 'day') {
        return D.addDays(state.date, dir);
    }
    if (state.view === 'month') {
        return D.addMonths(state.date, dir);
    }
    return D.addYears(state.date, dir);
}

/** Schlüssel des angezeigten Zeitraums (Tag, Monat oder Jahr). */
export function periodKey(state) {
    if (state.view === 'month') {
        return D.monthKey(state.date);
    }
    if (state.view === 'year') {
        return D.yearKey(state.date);
    }
    return state.date;
}

const narrowScreen = window.matchMedia('(max-width: 560px)');

export function periodTitle(state, { short = false } = {}) {
    if (state.view === 'month') {
        return fmtMonthTitle(state.date);
    }
    if (state.view === 'year') {
        return D.yearKey(state.date);
    }
    // Auf dem Handy «So, 01.11.2026» statt «Sonntag, 01.11.2026».
    return short ? fmtDayMedium(state.date) : fmtDayTitle(state.date);
}

export class PeriodNav {
    constructor({ router, getBounds }) {
        this.router = router;
        this.getBounds = getBounds;

        this.switchEl = document.getElementById('view-switch');
        this.indicator = this.switchEl.querySelector('.segmented-indicator');
        this.options = [...this.switchEl.querySelectorAll('[data-view]')];
        this.prevBtn = document.getElementById('period-prev');
        this.nextBtn = document.getElementById('period-next');
        this.todayBtn = document.getElementById('period-today');
        this.titleBtn = document.getElementById('period-title');
        this.titleText = document.getElementById('period-title-text');

        this.picker = new DatePicker(this.titleBtn, {
            getBounds,
            onSelect: (date) => this.router.navigate({ date }, { source: 'picker' }),
        });

        this.bind();
        this.observeSticky();
    }

    bind() {
        this.options.forEach((btn) => {
            btn.addEventListener('click', () => this.selectView(btn.dataset.view));
        });

        // Pfeiltasten innerhalb des Umschalters (Radiogruppe).
        this.switchEl.addEventListener('keydown', (e) => {
            const i = this.options.indexOf(document.activeElement);
            if (i < 0) {
                return;
            }
            let next = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % this.options.length;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + this.options.length) % this.options.length;
            if (e.key === 'Home') next = 0;
            if (e.key === 'End') next = this.options.length - 1;
            if (next !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.options[next].focus();
                this.selectView(this.options[next].dataset.view);
            }
        });

        this.prevBtn.addEventListener('click', () => this.step(-1));
        this.nextBtn.addEventListener('click', () => this.step(1));
        this.todayBtn.addEventListener('click', () => this.goToday());
        this.titleBtn.addEventListener('click', () => this.picker.toggle(this.router.state));

        window.addEventListener('resize', () => this.moveIndicator(false));
        narrowScreen.addEventListener('change', () => this.update(this.router.state));
        document.fonts?.ready.then(() => this.moveIndicator(false));
    }

    selectView(view) {
        const state = this.router.state;
        if (view === state.view) {
            return;
        }
        let date = state.date;
        // Beim Wechsel in die Tagesansicht im laufenden Zeitraum auf heute springen.
        const today = D.today();
        if (view === 'day' && periodKey({ view: state.view, date: today }) === periodKey(state)) {
            date = today;
        }
        this.router.navigate({ view, date }, { source: 'switch' });
    }

    step(dir) {
        const state = this.router.state;
        const { min, max } = this.getBounds();
        const date = shift(state, dir);
        const candidate = { ...state, date };
        if (dir < 0 && periodKey(candidate) < periodKey({ ...state, date: min })) {
            return;
        }
        if (dir > 0 && periodKey(candidate) > periodKey({ ...state, date: max })) {
            return;
        }
        this.picker.close({ returnFocus: false });
        this.router.navigate({ date: D.clamp(date, null, max) }, { source: 'step', direction: dir });
    }

    goToday() {
        this.picker.close({ returnFocus: false });
        const state = this.router.state;
        const today = D.today();
        this.router.navigate(
            { date: today },
            { source: 'today', direction: today > state.date ? 1 : today < state.date ? -1 : 0 },
        );
    }

    /** Anzeige an den aktuellen Zustand anpassen. */
    update(state) {
        const { min, max } = this.getBounds();
        const labels = UNIT[state.view];

        this.options.forEach((btn) => {
            const active = btn.dataset.view === state.view;
            btn.setAttribute('aria-checked', String(active));
            btn.tabIndex = active ? 0 : -1;
        });
        this.moveIndicator(true);

        const title = periodTitle(state);
        this.titleText.textContent = periodTitle(state, { short: narrowScreen.matches });
        this.titleBtn.setAttribute('aria-label', `${title} – Datum wählen`);

        const key = periodKey(state);
        this.prevBtn.disabled = key <= periodKey({ ...state, date: min });
        this.nextBtn.disabled = key >= periodKey({ ...state, date: max });
        this.todayBtn.disabled = key === periodKey({ ...state, date: D.today() });
        this.prevBtn.setAttribute('aria-label', labels.prev);
        this.nextBtn.setAttribute('aria-label', labels.next);
        this.prevBtn.title = `${labels.prev} (←)`;
        this.nextBtn.title = `${labels.next} (→)`;
        this.todayBtn.title = `${labels.today} (T)`;
    }

    moveIndicator(animate) {
        const active = this.options.find((b) => b.getAttribute('aria-checked') === 'true');
        if (!active) {
            return;
        }
        if (!animate) {
            this.indicator.style.transition = 'none';
        }
        this.indicator.style.width = `${active.offsetWidth}px`;
        this.indicator.style.transform = `translateX(${active.offsetLeft}px)`;
        if (!animate) {
            // Übergang erst im nächsten Frame wieder einschalten.
            requestAnimationFrame(() => {
                this.indicator.style.transition = '';
            });
        }
    }

    /** Leiste bekommt eine Trennlinie, sobald sie oben klebt. */
    observeSticky() {
        const bar = document.querySelector('.period-bar');
        const sentinel = document.createElement('div');
        sentinel.setAttribute('aria-hidden', 'true');
        sentinel.style.height = '1px';
        sentinel.style.marginBottom = '-1px';
        bar.before(sentinel);
        new IntersectionObserver(([entry]) => {
            bar.classList.toggle('is-stuck', !entry.isIntersecting);
        }).observe(sentinel);
    }
}
