/**
 * Eigener Datumswähler als Popover.
 *
 * Drei Ebenen: Tage, Monate, Jahre. Gewählt wird auf der Ebene der aktuellen
 * Ansicht (Tag → Tage, Monat → Monate, Jahr → Jahre); über die Überschrift
 * kommt man eine Ebene höher. Tage und Monate mit Saunadaten sind markiert.
 *
 * Tastatur: Pfeile bewegen den Fokus, Bild auf/ab wechselt Monat bzw. Jahr,
 * Pos1/Ende springen an den Anfang/das Ende der Woche, Enter wählt, Esc schliesst.
 */

import { api } from './api.js';
import { tempColor } from './colors.js';
import * as D from './dates.js';
import { MONTHS, MONTHS_SHORT, WEEKDAYS_SHORT, fmtDayTitle, fmtDuration, fmtMonthTitle, fmtTemp } from './format.js';
import { icons } from './icons.js';
import { esc } from './ui.js';

const LEVEL_OF_VIEW = { day: 'days', month: 'months', year: 'years' };

export class DatePicker {
    /**
     * @param {HTMLElement} trigger  Knopf, der den Wähler öffnet
     * @param {{getBounds: () => {min: string, max: string}, onSelect: (date: string) => void}} options
     */
    constructor(trigger, { getBounds, onSelect }) {
        this.trigger = trigger;
        this.getBounds = getBounds;
        this.onSelect = onSelect;
        this.el = null;
        this.backdrop = null;
        this.level = 'days';
        this.pickLevel = 'days';
        this.cursor = D.today();   // Fokus innerhalb der Tabelle
        this.selected = D.today();
        this.markers = new Map();  // Schlüssel (YYYY-MM oder YYYY) → Daten
        this.onKey = this.onKey.bind(this);
        this.onResize = () => this.position();
    }

    get isOpen() {
        return this.el !== null;
    }

    toggle(state) {
        if (this.isOpen) {
            this.close();
        } else {
            this.open(state);
        }
    }

    open(state) {
        this.pickLevel = LEVEL_OF_VIEW[state.view];
        this.level = this.pickLevel;
        this.selected = state.date;
        this.cursor = state.date;

        this.backdrop = document.createElement('div');
        this.backdrop.className = 'picker-backdrop';
        this.backdrop.addEventListener('click', () => this.close());

        this.el = document.createElement('div');
        this.el.className = 'picker';
        this.el.setAttribute('role', 'dialog');
        this.el.setAttribute('aria-modal', 'true');
        this.el.setAttribute('aria-label', 'Datum wählen');
        this.el.addEventListener('keydown', this.onKey);
        this.el.addEventListener('click', (e) => this.onClick(e));

        document.body.append(this.backdrop, this.el);
        this.trigger.setAttribute('aria-expanded', 'true');
        window.addEventListener('resize', this.onResize);
        window.addEventListener('scroll', this.onResize, { passive: true });

        this.render({ focus: true });
        this.position();
    }

    close({ returnFocus = true } = {}) {
        if (!this.el) {
            return;
        }
        const el = this.el;
        const backdrop = this.backdrop;
        this.el = null;
        this.backdrop = null;
        el.classList.add('is-closing');
        el.addEventListener('animationend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 300);
        backdrop.remove();
        this.trigger.setAttribute('aria-expanded', 'false');
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('scroll', this.onResize);
        if (returnFocus) {
            this.trigger.focus();
        }
    }

    position() {
        if (!this.el) {
            return;
        }
        const r = this.trigger.getBoundingClientRect();
        const w = this.el.offsetWidth;
        const vw = document.documentElement.clientWidth;
        let left = r.left + r.width / 2 - w / 2;
        left = Math.max(12, Math.min(left, vw - w - 12));
        this.el.style.left = `${left}px`;
        this.el.style.top = `${r.bottom + 8}px`;
    }

    /* -------------------------------------------------------------------
       Darstellung
       ------------------------------------------------------------------- */

    render({ focus = false } = {}) {
        if (!this.el) {
            return;
        }
        const { min, max } = this.getBounds();
        const c = D.parse(this.cursor);
        let heading;
        let body;
        let canPrev;
        let canNext;
        let headingLabel;

        if (this.level === 'days') {
            heading = fmtMonthTitle(this.cursor);
            headingLabel = 'Monat und Jahr wählen';
            body = this.renderDays(c, min, max);
            canPrev = D.monthKey(this.cursor) > D.monthKey(min);
            canNext = D.monthKey(this.cursor) < D.monthKey(max);
            this.loadMarkers('month', D.monthKey(this.cursor));
        } else if (this.level === 'months') {
            heading = String(c.y);
            headingLabel = 'Jahr wählen';
            body = this.renderMonths(c, min, max);
            canPrev = D.yearKey(this.cursor) > D.yearKey(min);
            canNext = D.yearKey(this.cursor) < D.yearKey(max);
            this.loadMarkers('year', D.yearKey(this.cursor));
        } else {
            const start = this.yearPageStart(c.y);
            heading = `${start}–${start + 11}`;
            headingLabel = '';
            body = this.renderYears(start, min, max);
            canPrev = start > Number(D.yearKey(min));
            canNext = start + 11 < Number(D.yearKey(max));
        }

        const canUp = this.level !== 'years';
        this.el.innerHTML = `
            <div class="picker-head">
                <button type="button" class="icon-btn" data-move="-1" aria-label="Zurück" ${canPrev ? '' : 'disabled'}>${icons.chevronLeft()}</button>
                <div class="picker-heading">
                    <button type="button" class="picker-heading-btn" data-up ${canUp ? `aria-label="${esc(heading)} – ${esc(headingLabel)}"` : 'disabled'} aria-live="polite">${esc(heading)}</button>
                </div>
                <button type="button" class="icon-btn" data-move="1" aria-label="Weiter" ${canNext ? '' : 'disabled'}>${icons.chevronRight()}</button>
            </div>
            <div class="picker-body">${body}</div>
            <div class="picker-foot">
                <span class="picker-legend">Saunadaten vorhanden</span>
                <button type="button" class="btn btn--sm btn--ghost" data-today>Heute</button>
            </div>`;

        this.focusCursor(focus);
    }

    renderDays(c, min, max) {
        const first = D.toStr(c.y, c.m, 1);
        const offset = D.weekday(first);
        const start = D.addDays(first, -offset);
        const today = D.today();
        const marks = this.markers.get(D.monthKey(this.cursor));
        const loading = marks === undefined;

        let cells = '';
        for (let i = 0; i < 42; i++) {
            const date = D.addDays(start, i);
            const p = D.parse(date);
            const outside = p.m !== c.m;
            if (outside && i >= 35 && D.weekday(date) === 0) {
                break; // Keine leere sechste Woche
            }
            const disabled = date < min || date > max;
            const info = marks?.get(date);
            const classes = ['picker-cell'];
            if (outside) classes.push('is-outside');
            if (date === today) classes.push('is-today');
            if (info?.sauna_day) classes.push('has-sauna');
            const style = info?.sauna_day && info.max !== null ? ` style="--mark:${tempColor(info.max)}"` : '';
            let label = fmtDayTitle(date);
            if (info?.sauna_day) {
                label += `, sauniert: ${fmtDuration(info.sauna_seconds)}, max. ${fmtTemp(info.max)}`;
            }
            cells += `<button type="button" role="gridcell" class="${classes.join(' ')}"${style}
                data-date="${date}" tabindex="-1" aria-label="${esc(label)}"
                aria-selected="${date === this.selected}" ${disabled ? 'disabled' : ''}>${p.d}</button>`;
        }

        const head = WEEKDAYS_SHORT.map((w) => `<span>${w}</span>`).join('');
        return `
            <div class="picker-weekdays" aria-hidden="true">${head}</div>
            <div class="picker-days${loading ? ' is-loading' : ''}" role="grid" aria-label="${esc(fmtMonthTitle(this.cursor))}">${cells}</div>`;
    }

    renderMonths(c, min, max) {
        const marks = this.markers.get(D.yearKey(this.cursor));
        let cells = '';
        for (let m = 1; m <= 12; m++) {
            const key = `${c.y}-${String(m).padStart(2, '0')}`;
            const disabled = key < D.monthKey(min) || key > D.monthKey(max);
            const info = marks?.get(m);
            const classes = ['picker-cell'];
            if (key === D.monthKey(D.today())) classes.push('is-today');
            if (info && info.sauna_days > 0) classes.push('has-sauna');
            const selected = key === D.monthKey(this.selected);
            const sub = info && info.sauna_days > 0 ? `<span class="picker-cell-sub">${info.sauna_days}×</span>` : '';
            const label = `${MONTHS[m - 1]} ${c.y}${info && info.sauna_days > 0 ? `, ${info.sauna_days} Saunatage` : ''}`;
            cells += `<button type="button" class="${classes.join(' ')}" data-month="${key}" tabindex="-1"
                aria-label="${esc(label)}" aria-selected="${selected}" ${disabled ? 'disabled' : ''}>
                <span>${MONTHS_SHORT[m - 1]}${sub}</span></button>`;
        }
        return `<div class="picker-months" role="grid" aria-label="${c.y}">${cells}</div>`;
    }

    renderYears(start, min, max) {
        let cells = '';
        for (let y = start; y < start + 12; y++) {
            const key = String(y);
            const disabled = key < D.yearKey(min) || key > D.yearKey(max);
            const classes = ['picker-cell'];
            if (key === D.yearKey(D.today())) classes.push('is-today');
            if (!disabled) classes.push('has-sauna');
            cells += `<button type="button" class="${classes.join(' ')}" data-year="${key}" tabindex="-1"
                aria-selected="${key === D.yearKey(this.selected)}" ${disabled ? 'disabled' : ''}>${key}</button>`;
        }
        return `<div class="picker-years" role="grid" aria-label="Jahre">${cells}</div>`;
    }

    yearPageStart(year) {
        const maxYear = Number(D.yearKey(this.getBounds().max));
        // Seite so wählen, dass das aktuelle Jahr möglichst unten rechts steht.
        let start = maxYear - 11;
        while (year < start) {
            start -= 12;
        }
        while (year > start + 11) {
            start += 12;
        }
        return start;
    }

    /** Roving Tabindex: genau eine Zelle ist per Tab erreichbar. */
    focusCursor(focus = true) {
        const sel = this.level === 'days'
            ? `[data-date="${this.cursor}"]`
            : this.level === 'months'
                ? `[data-month="${D.monthKey(this.cursor)}"]`
                : `[data-year="${D.yearKey(this.cursor)}"]`;
        let target = this.el.querySelector(`${sel}:not(:disabled)`);
        if (!target) {
            target = this.el.querySelector('.picker-body [aria-selected="true"]:not(:disabled)')
                || this.el.querySelector('.picker-body button:not(:disabled)');
        }
        if (target) {
            target.tabIndex = 0;
            if (focus) {
                target.focus();
            }
        }
    }

    /** Markierungen nachladen (Monats- bzw. Jahresdaten aus der API). */
    async loadMarkers(kind, key) {
        if (this.markers.has(key) || this.loading === key) {
            return;
        }
        this.loading = key;
        try {
            if (kind === 'month') {
                const data = await api.month(key);
                this.markers.set(key, new Map(data.days.map((d) => [d.date, d])));
            } else {
                const data = await api.year(key);
                this.markers.set(key, new Map(data.months.map((m) => [m.month, m])));
            }
        } catch {
            this.markers.set(key, new Map());
        } finally {
            this.loading = null;
        }
        const stillVisible = kind === 'month'
            ? this.level === 'days' && D.monthKey(this.cursor) === key
            : this.level === 'months' && D.yearKey(this.cursor) === key;
        if (this.el && stillVisible) {
            const hadFocus = this.el.contains(document.activeElement);
            this.render({ focus: hadFocus });
        }
    }

    /* -------------------------------------------------------------------
       Bedienung
       ------------------------------------------------------------------- */

    onClick(e) {
        const btn = e.target.closest('button');
        if (!btn || btn.disabled) {
            return;
        }
        if (btn.dataset.move) {
            const dir = btn.dataset.move;
            this.move(Number(dir));
            const { min, max } = this.getBounds();
            this.cursor = D.clamp(this.cursor, min, max);
            this.render();
            // Fokus auf dem Pfeil lassen, damit man mehrmals blättern kann.
            const again = this.el.querySelector(`[data-move="${dir}"]`);
            (again && !again.disabled ? again : this.el.querySelector('[data-up], [data-today]'))?.focus();
            return;
        }
        if (btn.hasAttribute('data-up')) {
            this.level = this.level === 'days' ? 'months' : 'years';
            this.render({ focus: true });
            return;
        }
        if (btn.hasAttribute('data-today')) {
            this.choose(D.today());
            return;
        }
        if (btn.dataset.date) {
            this.choose(btn.dataset.date);
        } else if (btn.dataset.month) {
            this.pickMonth(btn.dataset.month);
        } else if (btn.dataset.year) {
            this.pickYear(btn.dataset.year);
        }
    }

    pickMonth(key) {
        const day = Math.min(D.parse(this.cursor).d, D.daysInMonth(Number(key.slice(0, 4)), Number(key.slice(5, 7))));
        const date = D.clamp(`${key}-${String(day).padStart(2, '0')}`, null, this.getBounds().max);
        if (this.pickLevel === 'months') {
            this.choose(key === D.monthKey(D.today()) ? D.today() : `${key}-01`);
        } else {
            this.cursor = date;
            this.level = 'days';
            this.render({ focus: true });
        }
    }

    pickYear(key) {
        if (this.pickLevel === 'years') {
            this.choose(key === D.yearKey(D.today()) ? D.today() : `${key}-01-01`);
            return;
        }
        const date = D.clamp(`${key}${this.cursor.slice(4)}`, this.getBounds().min, this.getBounds().max);
        this.cursor = D.isValid(date) ? date : `${key}-01-01`;
        this.level = 'months';
        this.render({ focus: true });
    }

    choose(date) {
        const { max } = this.getBounds();
        this.close();
        this.onSelect(D.clamp(date, null, max));
    }

    /** Seite vor/zurück (Monat, Jahr oder 12 Jahre). */
    move(dir) {
        if (this.level === 'days') {
            this.cursor = D.addMonths(this.cursor, dir);
        } else if (this.level === 'months') {
            this.cursor = D.addYears(this.cursor, dir);
        } else {
            this.cursor = D.addYears(this.cursor, dir * 12);
        }
    }

    onKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (this.level !== this.pickLevel) {
                this.level = this.pickLevel;
                this.render({ focus: true });
            } else {
                this.close();
            }
            return;
        }
        if (e.key === 'Tab') {
            // Fokus im Dialog halten.
            const items = [...this.el.querySelectorAll('button:not(:disabled)')].filter((b) => b.tabIndex >= 0 || !b.closest('.picker-body'));
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
            return;
        }

        const inGrid = e.target.closest('.picker-body');
        if (!inGrid) {
            return;
        }
        const cols = this.level === 'days' ? 7 : 3;
        const steps = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -cols,
            ArrowDown: cols,
        };
        let handled = true;
        if (e.key in steps) {
            this.step(steps[e.key]);
        } else if (e.key === 'PageUp' || e.key === 'PageDown') {
            this.move(e.key === 'PageUp' ? (e.shiftKey ? -12 : -1) : (e.shiftKey ? 12 : 1));
        } else if (e.key === 'Home' && this.level === 'days') {
            this.cursor = D.addDays(this.cursor, -D.weekday(this.cursor));
        } else if (e.key === 'End' && this.level === 'days') {
            this.cursor = D.addDays(this.cursor, 6 - D.weekday(this.cursor));
        } else {
            handled = false;
        }
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
            const { min, max } = this.getBounds();
            this.cursor = D.clamp(this.cursor, min, max);
            this.render({ focus: true });
        }
    }

    step(n) {
        if (this.level === 'days') {
            this.cursor = D.addDays(this.cursor, n);
        } else if (this.level === 'months') {
            this.cursor = D.addMonths(this.cursor, n);
        } else {
            this.cursor = D.addYears(this.cursor, n);
        }
    }
}
