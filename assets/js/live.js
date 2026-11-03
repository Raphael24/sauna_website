/**
 * Live-Karte: aktuelle Temperatur, Trend, Status, kleine Kurve der letzten
 * drei Stunden. Aktualisiert sich alle 30 Sekunden ohne Neuladen und setzt
 * Seitentitel und Favicon passend zur Temperatur.
 */

import { api } from './api.js';
import { config } from './config.js';
import { alpha, glowIntensity, palette, tempColor } from './colors.js';
import * as D from './dates.js';
import { fmtDayMedium, fmtDuration, fmtNumber, fmtRelative, fmtSlope, fmtTemp, fmtTime, fmtDateMs } from './format.js';
import { icons } from './icons.js';
import { esc, toast } from './ui.js';

const STATUS_TEXT = {
    active: (since) => `Sauna aktiv seit ${fmtTime(since)}`,
    heating: (since) => (since ? `Heizt auf seit ${fmtTime(since)}` : 'Heizt auf'),
    off: () => 'Aus',
    offline: () => 'Sensor offline',
};

const TREND_TEXT = { rising: 'steigend', falling: 'fallend', stable: 'stabil' };

export class LiveCard {
    constructor(root, { onUpdate } = {}) {
        this.root = root;
        this.onUpdate = onUpdate;
        this.data = null;
        this.lastSessionDate = null;
        this.failures = 0;
        this.timer = null;
        this.ticker = null;
        this.first = true;
        this.clockOffset = 0; // Unterschied Server- zu Browseruhr

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.refresh();
            } else {
                this.stop();
            }
        });
    }

    start() {
        this.refresh();
        this.ticker = setInterval(() => this.tick(), 5000);
    }

    stop() {
        clearTimeout(this.timer);
        this.timer = null;
    }

    schedule() {
        clearTimeout(this.timer);
        // Bei Fehlern langsamer erneut versuchen (max. 2 Minuten).
        const base = config.refreshSeconds * 1000;
        const delay = this.failures > 0 ? Math.min(120000, base * 2 ** (this.failures - 1)) : base;
        if (document.visibilityState === 'visible') {
            this.timer = setTimeout(() => this.refresh(), delay);
        }
    }

    setLastSessionDate(date) {
        this.lastSessionDate = date;
        if (this.data) {
            this.render();
        }
    }

    now() {
        return Date.now() + this.clockOffset;
    }

    async refresh() {
        try {
            const data = await api.current();
            this.clockOffset = data.server_now ? data.server_now - Date.now() : 0;
            const hadError = this.failures > 0;
            this.failures = 0;
            this.data = data;
            this.render();
            if (hadError) {
                toast('Verbindung wiederhergestellt.');
            }
            this.onUpdate?.(data);
        } catch (err) {
            this.failures++;
            if (!this.data) {
                this.renderError(err.message);
            } else {
                this.tick();
                if (this.failures === 1) {
                    toast(`Live-Wert konnte nicht aktualisiert werden: ${err.message}`, { type: 'error' });
                }
            }
        } finally {
            this.schedule();
        }
    }

    themeChanged() {
        if (this.data) {
            this.render();
        }
    }

    /** Aktualisiert nur die relativen Zeitangaben, ohne neu zu laden. */
    tick() {
        if (!this.data || !this.data.has_data) {
            return;
        }
        const now = this.now();
        const ageEl = this.root.querySelector('[data-live-age]');
        if (ageEl) {
            ageEl.textContent = fmtRelative(this.data.ts, now);
        }
        const durEl = this.root.querySelector('[data-live-duration]');
        if (durEl && this.data.session) {
            durEl.textContent = fmtDuration((now - this.data.session.start) / 1000);
        }
        // Wird die Messung zu alt, ohne dass ein neuer Abruf klappt: offline anzeigen.
        const stale = (now - this.data.ts) / 1000 > config.offlineAfter;
        if (stale && this.data.online) {
            this.data = { ...this.data, online: false, status: { state: 'offline', since: null }, session: null };
            this.render();
        }
        const warn = this.root.querySelector('[data-live-warning]');
        if (warn) {
            warn.hidden = this.failures === 0;
        }
    }

    renderError(message) {
        this.root.dataset.state = 'error';
        this.root.innerHTML = `
            <div class="live-empty">
                <h2>Live-Wert nicht verfügbar</h2>
                <p>${esc(message)}</p>
            </div>`;
        updateDocument(null);
    }

    render() {
        const d = this.data;
        const root = this.root;

        if (!d.has_data) {
            root.dataset.state = 'empty';
            root.style.setProperty('--live-color', 'var(--temp-cool)');
            root.style.setProperty('--live-glow', 'transparent');
            root.innerHTML = `
                <div class="live-empty">
                    <span class="badge badge--offline"><span class="badge-dot"></span>Noch keine Messwerte</span>
                    <h2>Warten auf den ersten Messwert</h2>
                    <p>Sobald der ESP32 Daten an <code>api/insert.php</code> sendet, erscheint hier die aktuelle Temperatur.
                       Zum Ausprobieren lassen sich mit <code>generate_testdata.php</code> Testdaten erzeugen.</p>
                </div>`;
            updateDocument(null);
            return;
        }

        const state = d.status.state;
        const temp = d.temp;
        const color = state === 'offline' ? palette().textSubtle : tempColor(temp);
        // Im hellen Modus wirkt derselbe Schein viel kräftiger – dort abschwächen.
        const glow = state === 'offline' ? 0 : glowIntensity(temp) * (palette().isDark ? 1 : 0.5);
        root.dataset.state = state;
        root.style.setProperty('--live-color', color);
        root.style.setProperty('--live-glow', color.startsWith('#') ? alpha(color, 0.08 + glow * 0.34) : 'transparent');

        const direction = d.trend.direction;
        const trendLabel = `Trend: ${TREND_TEXT[direction]}${d.trend.slope_per_min !== null ? ` (${fmtSlope(d.trend.slope_per_min)})` : ''}`;
        const now = this.now();

        const markup = `
            <div class="live-grid${this.first ? ' is-entering' : ''}">
                <div class="live-main">
                    <span class="badge badge--${state}" role="status">
                        <span class="badge-dot" aria-hidden="true"></span>${esc(STATUS_TEXT[state](d.status.since))}
                    </span>
                    <div class="live-temp" role="group" aria-label="Aktuelle Temperatur ${esc(fmtTemp(temp))}, ${esc(TREND_TEXT[direction])}">
                        <span class="live-value" aria-hidden="true">${esc(fmtNumber(temp, 1))}</span>
                        <span class="live-unit" aria-hidden="true">°C</span>
                        <span class="trend trend--${direction}" title="${esc(trendLabel)}" aria-hidden="true">${icons.arrowRight({ size: 22, stroke: 2.2 })}</span>
                    </div>
                    <p class="live-meta">
                        <span>Letzte Messung <strong><time datetime="${new Date(d.ts).toISOString()}" data-live-age>${esc(fmtRelative(d.ts, now))}</time></strong></span>
                        <span class="sep" aria-hidden="true">·</span>
                        <span>${esc(fmtTime(d.ts))} Uhr</span>
                        ${d.trend.slope_per_min !== null && state !== 'offline' ? `<span class="sep" aria-hidden="true">·</span><span>${esc(fmtSlope(d.trend.slope_per_min))}</span>` : ''}
                        <span data-live-warning hidden>· <span style="color:var(--danger)">Aktualisierung gestört</span></span>
                    </p>
                </div>
                <div class="live-side">
                    ${this.sparkline(d)}
                    <dl class="live-facts">${this.facts(d, now)}</dl>
                </div>
            </div>`;

        root.innerHTML = markup;
        this.first = false;
        updateDocument(d);
    }

    facts(d, now) {
        const fact = (label, value, small = '') =>
            `<div class="live-fact"><dt>${esc(label)}</dt><dd>${value}${small ? ` <small>${esc(small)}</small>` : ''}</dd></div>`;
        const items = [];
        const s = d.session;

        if (d.status.state === 'active' && s) {
            items.push(fact('Session', `<span data-live-duration>${esc(fmtDuration((now - s.start) / 1000))}</span>`));
            items.push(fact('Max. Session', esc(fmtTemp(s.max))));
            if (s.heatup_80 !== null) {
                items.push(fact('Bis 80 °C', esc(fmtDuration(s.heatup_80))));
            } else if (s.heatup_60 !== null) {
                items.push(fact('Bis 60 °C', esc(fmtDuration(s.heatup_60))));
            } else {
                items.push(fact('Ø Session', esc(fmtTemp(s.avg))));
            }
        } else if (d.status.state === 'heating') {
            const slope = d.trend.slope_per_min;
            const target = d.temp < 60 ? 60 : 80;
            if (slope && slope > 0.05 && d.temp < target) {
                items.push(fact(`${target} °C in`, `ca. ${esc(fmtDuration(((target - d.temp) / slope) * 60))}`));
            }
            items.push(fact('Heute max.', esc(fmtTemp(d.today.max))));
            items.push(fact('Heute min.', esc(fmtTemp(d.today.min))));
        } else {
            items.push(fact('Heute max.', esc(fmtTemp(d.today.max))));
            items.push(fact('Heute min.', esc(fmtTemp(d.today.min))));
            if (d.last_session) {
                const date = D.dateOf(d.last_session.start);
                const when = date === D.today() ? 'heute' : fmtDayMedium(date).replace(/\.\d{4}$/, '.');
                items.push(fact('Letzte Session', esc(`${fmtTime(d.last_session.start)}–${fmtTime(d.last_session.end)}`), when));
            } else if (this.lastSessionDate) {
                const date = this.lastSessionDate;
                const label = date === D.today() ? 'Heute' : fmtDayMedium(date);
                items.push(fact('Letzte Session', `<a href="?view=day&amp;date=${esc(date)}" data-nav>${esc(label)}</a>`));
            }
        }

        if (d.status.state === 'offline') {
            items.unshift(fact('Zuletzt gesehen', esc(fmtTime(d.ts)), D.dateOf(d.ts) === D.today() ? '' : fmtDateMs(d.ts)));
        }

        return items.slice(0, 3).join('');
    }

    /** Kleine SVG-Kurve mit Farbverlauf nach Temperatur. */
    sparkline(d) {
        const pts = (d.recent?.points ?? []).filter((p) => p[1] !== null);
        if (pts.length < 2) {
            return `
                <div class="spark">
                    <div class="spark-head"><span>Letzte 3 Stunden</span></div>
                    <div class="spark-empty">Noch zu wenige Messwerte</div>
                </div>`;
        }

        const W = 300;
        const H = 72;
        const from = d.recent.from;
        const to = d.recent.to;
        const values = pts.map((p) => p[1]);
        let lo = Math.min(...values);
        let hi = Math.max(...values);
        if (hi - lo < 6) {
            const mid = (hi + lo) / 2;
            lo = mid - 3;
            hi = mid + 3;
        }
        const pad = (hi - lo) * 0.12;
        lo -= pad;
        hi += pad;
        const x = (t) => ((t - from) / (to - from)) * W;
        const y = (v) => H - ((v - lo) / (hi - lo)) * H;

        // Linie an Lücken unterbrechen.
        let path = '';
        let pen = false;
        for (const [t, v] of d.recent.points) {
            if (v === null) {
                pen = false;
                continue;
            }
            path += `${pen ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`;
            pen = true;
        }

        // Senkrechter Farbverlauf: oben heiss, unten kühl – passend zur Skala.
        const stops = [0, 0.25, 0.5, 0.75, 1]
            .map((o) => `<stop offset="${o}" stop-color="${tempColor(hi - (hi - lo) * o)}"/>`)
            .join('');
        const last = pts[pts.length - 1];
        const thr = config.threshold;
        const thrLine = thr > lo && thr < hi
            ? `<line class="spark-threshold" x1="0" x2="${W}" y1="${y(thr).toFixed(1)}" y2="${y(thr).toFixed(1)}"/>`
            : '';
        const id = `spark-grad-${Math.random().toString(36).slice(2, 8)}`;

        return `
            <div class="spark">
                <div class="spark-head">
                    <span>Letzte 3 Stunden</span>
                    <span class="spark-range">${esc(fmtNumber(Math.min(...values), 0))}–${esc(fmtNumber(Math.max(...values), 0))} °C</span>
                </div>
                <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Temperaturverlauf der letzten 3 Stunden, zwischen ${esc(fmtTemp(Math.min(...values)))} und ${esc(fmtTemp(Math.max(...values)))}">
                    <defs>
                        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>
                        <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stop-color="${tempColor(hi)}" stop-opacity=".22"/>
                            <stop offset="1" stop-color="${tempColor(hi)}" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    ${thrLine}
                    <path d="${path}" class="spark-line" stroke="url(#${id})" vector-effect="non-scaling-stroke"/>
                    <path d="M${x(last[0]).toFixed(1)},${y(last[1]).toFixed(1)}h0" stroke="var(--surface)" stroke-width="12" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                    <path d="M${x(last[0]).toFixed(1)},${y(last[1]).toFixed(1)}h0" stroke="${tempColor(last[1])}" stroke-width="8" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                </svg>
                <div class="spark-axis"><span>${esc(fmtTime(from))}</span><span>${esc(fmtTime(from + (to - from) / 2))}</span><span>jetzt</span></div>
            </div>`;
    }
}

/* ---------------------------------------------------------------------------
   Seitentitel und Favicon
   --------------------------------------------------------------------------- */

function updateDocument(d) {
    if (!d || !d.has_data) {
        document.title = 'Sauna';
        setFavicon(null, false);
        return;
    }
    const offline = d.status.state === 'offline';
    const prefix = offline ? `${fmtTemp(d.temp)} (offline)` : fmtTemp(d.temp);
    const suffix = d.status.state === 'active' ? ' · aktiv' : d.status.state === 'heating' ? ' · heizt auf' : '';
    document.title = `${prefix}${suffix} · Sauna`;
    setFavicon(offline ? null : d.temp, d.status.state === 'active');
}

let lastFavicon = '';

function setFavicon(temp, glowing) {
    const color = temp === null ? '#8f7f71' : tempColor(temp);
    const key = `${color}|${glowing}`;
    if (key === lastFavicon) {
        return;
    }
    lastFavicon = key;
    const glow = glowing
        ? `<circle cx="16" cy="20" r="11" fill="${color}" opacity=".28"/>`
        : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1d1815"/>${glow}<path fill="${color}" d="M16.6 4.5c.4 3.7-1.4 5.6-3.3 7.6-2 2.1-4.1 4.3-4.1 8.2A6.9 6.9 0 0 0 16 27.3a6.9 6.9 0 0 0 6.8-7c0-3-1.4-4.9-2.6-6.5.1 1.8-.5 3.2-1.8 3.9.5-4.1-.3-9.1-1.8-13.2z"/><path fill="#ffe9c7" opacity="${temp === null ? 0.25 : 0.8}" d="M16.2 26.2a3.4 3.4 0 0 1-3.4-3.5c0-1.9 1.3-2.9 2.3-4 .3 1.2 1.1 1.8 2.1 2a3.5 3.5 0 0 1 2.4 2.4 3.4 3.4 0 0 1-3.4 3.1z"/></svg>`;
    const link = document.getElementById('favicon');
    if (link) {
        link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
}
