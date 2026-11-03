/**
 * Tagesansicht: grosses Temperaturdiagramm, Kennzahlen und Sessions.
 *
 * Die x-Achse rechnet in Millisekunden seit Mitternacht (Europe/Zurich).
 * So liegen die Stundenmarken immer auf vollen lokalen Stunden, unabhängig
 * von der Zeitzone des Browsers; beschriftet wird mit der echten Uhrzeit.
 */

import { api } from '../api.js';
import { baseStyle, createChart, disposeChart, echartsReady, ECHARTS_MISSING, isNarrow } from '../charts/base.js';
import { alpha, palette, tempColor, tempRamp } from '../colors.js';
import { config } from '../config.js';
import * as D from '../dates.js';
import { fmtDayMedium, fmtDuration, fmtDurationHtml, fmtNumber, fmtTemp, fmtTime } from '../format.js';
import { emptyIllustration, icons } from '../icons.js';
import { errorCard, esc, isTouch, skeletonStats, statCard, valueWithUnit } from '../ui.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const TICK_STEPS = [5, 10, 15, 30, 60, 120, 180, 240, 360].map((m) => m * MIN);

/** Achsenmarken in festen Schritten ab Mitternacht (volle Stunden bzw. Minuten). */
function tickValues(from, to, step) {
    const out = [];
    for (let v = Math.ceil(from / step) * step; v <= to + 1; v += step) {
        out.push(v);
    }
    return out;
}

function kindOf(data) {
    if (!data.points.some((p) => p[1] !== null)) {
        return 'empty';
    }
    return data.sessions.length > 0 ? 'full' : 'quiet';
}

export class DayView {
    constructor(container, { navigate }) {
        this.container = container;
        this.navigate = navigate;
        this.chart = null;
        this.data = null;
        this.date = null;
        this.token = 0;
        this.selected = null;
        this.zoomed = false;

        this.onClick = (e) => this.handleClick(e);
        container.addEventListener('click', this.onClick);
    }

    destroy() {
        this.token++;
        this.container.removeEventListener('click', this.onClick);
        disposeChart(this.chart);
        this.chart = null;
    }

    async show(state, meta = {}) {
        const token = ++this.token;
        const changedDate = state.date !== this.date;
        this.date = state.date;
        if (changedDate) {
            this.selected = null;
        }

        // Skelett erst nach kurzer Zeit zeigen, damit es bei Cache-Treffern nicht flackert.
        const skeletonTimer = setTimeout(() => {
            if (token === this.token) {
                this.renderSkeleton();
            }
        }, 120);

        try {
            const data = await api.day(state.date);
            if (token !== this.token) {
                return;
            }
            this.data = data;
            this.render(meta);
        } catch (err) {
            if (token !== this.token) {
                return;
            }
            this.renderError(err);
        } finally {
            clearTimeout(skeletonTimer);
            this.container.setAttribute('aria-busy', 'false');
        }
    }

    /** Stilles Nachladen für den heutigen Tag (ohne Skelett, Zoom bleibt). */
    async refresh() {
        if (!this.data || this.data.date !== D.today()) {
            return;
        }
        const token = this.token;
        try {
            const data = await api.day(this.data.date, { force: true });
            if (token !== this.token || data.date !== this.date) {
                return;
            }
            const sameKind = kindOf(data) === kindOf(this.data);
            this.data = data;
            if (sameKind && this.chart) {
                this.updateParts();
            } else {
                this.render({ silent: true });
            }
        } catch {
            /* Live-Karte meldet Verbindungsprobleme bereits */
        }
    }

    themeChanged() {
        if (this.data && this.chart) {
            this.chart.setOption(this.buildOption(this.data), { notMerge: true });
            this.afterZoom();
            if (this.selected !== null) {
                this.highlightSession(this.selected);
            }
        }
    }

    /* -------------------------------------------------------------------
       Darstellung
       ------------------------------------------------------------------- */

    renderSkeleton() {
        this.container.setAttribute('aria-busy', 'true');
        disposeChart(this.chart);
        this.chart = null;
        this.container.innerHTML = `
            <div class="view-content" aria-hidden="true">
                <div class="skeleton skeleton-chart"></div>
                ${skeletonStats(5)}
                <div class="card">
                    <div class="sessions-list">
                        <div class="skeleton skeleton-row"></div>
                    </div>
                </div>
            </div>`;
    }

    renderError(err) {
        disposeChart(this.chart);
        this.chart = null;
        this.data = null;
        this.container.innerHTML = `<div class="view-content is-entering">${errorCard(err.message)}</div>`;
    }

    render(meta = {}) {
        const data = this.data;
        const kind = kindOf(data);
        disposeChart(this.chart);
        this.chart = null;
        this.zoomed = false;

        const enter = meta.silent ? '' : ` is-entering${meta.direction > 0 ? ' from-right' : meta.direction < 0 ? ' from-left' : ''}`;
        const parts = [];

        if (kind !== 'full') {
            parts.push(this.emptyCard(data, kind));
        }
        if (kind !== 'empty') {
            parts.push(this.chartCard(data));
            parts.push(`<div class="stats-grid js-stats">${this.statsHtml(data)}</div>`);
        }
        if (kind === 'full') {
            parts.push(`
                <section class="card" aria-labelledby="sessions-title">
                    <div class="card-head">
                        <div>
                            <h3 class="card-title" id="sessions-title">Sessions</h3>
                            <p class="card-sub">Antippen, um im Diagramm auf die Session zu zoomen</p>
                        </div>
                    </div>
                    <ol class="sessions-list js-sessions">${this.sessionsHtml(data)}</ol>
                </section>`);
        }

        this.container.innerHTML = `<div class="view-content${enter}">${parts.join('')}</div>`;

        if (kind !== 'empty') {
            this.initChart();
        }
    }

    emptyCard(data, kind) {
        const isToday = data.date === D.today();
        const title = isToday ? 'Heute wurde noch nicht sauniert' : 'An diesem Tag wurde nicht sauniert';
        let text;
        if (kind === 'empty') {
            text = isToday
                ? 'Für heute liegen noch keine Messwerte vor.'
                : 'Für diesen Tag liegen keine Messwerte vor – der Sensor war offline oder noch nicht installiert.';
        } else {
            text = `Die Temperatur blieb unter ${fmtTemp(data.threshold, 0)}. ${isToday ? 'Sobald die Sauna aufheizt, erscheint hier die Session.' : 'Unten siehst du den Verlauf der Raumtemperatur.'}`;
        }

        const actions = [];
        const prev = data.neighbors.prev_session_date;
        const next = data.neighbors.next_session_date;
        if (prev) {
            actions.push(`<a class="btn btn--primary" href="?view=day&amp;date=${esc(prev)}" data-nav data-direction="-1">${icons.chevronLeft({ size: 16 })} Letzter Saunatag: ${esc(fmtDayMedium(prev))}</a>`);
        }
        if (next) {
            actions.push(`<a class="btn" href="?view=day&amp;date=${esc(next)}" data-nav data-direction="1">Nächster: ${esc(fmtDayMedium(next))} ${icons.chevronRight({ size: 16 })}</a>`);
        }

        return `
            <div class="card empty-state">
                ${emptyIllustration}
                <h3 class="empty-title">${esc(title)}</h3>
                <p class="empty-text">${esc(text)}</p>
                ${actions.length ? `<div class="empty-actions">${actions.join('')}</div>` : ''}
            </div>`;
    }

    chartCard(data) {
        const hasSessions = data.sessions.length > 0;
        const p = palette();
        const zones = config.zones
            .map((z, i) => `<span class="legend-item"><span class="legend-swatch" style="--swatch:${esc(i % 2 ? p.zone2 : p.zone1)}"></span>${esc(z.label)} (${z.from}–${z.to} °C)</span>`)
            .join('');
        const label = data.stats.max !== null
            ? `Temperaturverlauf am ${D.parse(data.date) ? fmtDayMedium(data.date) : data.date}. Maximum ${fmtTemp(data.stats.max)} um ${fmtTime(data.stats.max_at)}, Minimum ${fmtTemp(data.stats.min)}.`
            : 'Temperaturverlauf';

        return `
            <section class="card chart-card" aria-labelledby="chart-title">
                <div class="card-head">
                    <div>
                        <h3 class="card-title" id="chart-title">Temperaturverlauf</h3>
                        <p class="card-sub zoom-hint zoom-hint--mouse">Mausrad zoomt, Ziehen verschiebt, Regler unten wählt den Ausschnitt</p>
                        <p class="card-sub zoom-hint zoom-hint--touch">Mit zwei Fingern zoomen, Regler unten verschiebt</p>
                    </div>
                    <div class="card-actions">
                        ${hasSessions ? `<button type="button" class="btn btn--sm" data-action="zoom-session">${icons.zoom()} Auf Session zoomen</button>` : ''}
                        <button type="button" class="btn btn--sm btn--ghost" data-action="zoom-reset" hidden>${icons.expand()} Ganzer Tag</button>
                    </div>
                </div>
                <div class="chart chart--day js-day-chart" role="img" aria-label="${esc(label)}"></div>
                <div class="legend" aria-hidden="true">
                    ${zones}
                    ${hasSessions ? `<span class="legend-item"><span class="legend-swatch" style="--swatch:${esc(p.session)};border-style:dashed;border-color:${esc(p.sessionBorder)}"></span>Session</span>` : ''}
                    <span class="legend-item"><span class="legend-scale"></span>Linienfarbe nach Temperatur</span>
                    <span class="legend-item">Unterbruch = keine Messung (&gt; ${config.gapMinutes} min)</span>
                </div>
            </section>`;
    }

    statsHtml(data) {
        const s = data.stats;
        const sessions = data.sessions;
        const longest = sessions.reduce((m, x) => Math.max(m, x.duration), 0);
        let span = 'keine Session';
        if (sessions.length) {
            const first = sessions[0];
            const last = sessions[sessions.length - 1];
            span = `${fmtTime(Math.max(first.start, data.day_start))}–${last.ongoing ? 'jetzt' : fmtTime(Math.min(last.end, data.day_end))}`;
        }
        const n = (v) => (v === null ? '–' : valueWithUnit(fmtNumber(v, 1), '°C'));

        return [
            statCard({
                label: 'Maximum',
                icon: 'up',
                value: n(s.max),
                sub: s.max_at ? `um ${esc(fmtTime(s.max_at))} Uhr` : '',
                color: s.max !== null ? tempColor(s.max) : undefined,
            }),
            statCard({
                label: 'Minimum',
                icon: 'down',
                value: n(s.min),
                sub: s.min_at ? `um ${esc(fmtTime(s.min_at))} Uhr` : '',
                color: s.min !== null ? tempColor(s.min) : undefined,
            }),
            statCard({
                label: 'Durchschnitt',
                icon: 'average',
                value: n(s.avg),
                sub: s.session_avg !== null ? `Ø in Sessions ${esc(fmtTemp(s.session_avg))}` : 'über den ganzen Tag',
            }),
            statCard({
                label: 'Saunadauer',
                icon: 'timer',
                value: fmtDurationHtml(s.sauna_seconds),
                sub: esc(span),
                color: s.sauna_seconds > 0 ? palette().accent : undefined,
            }),
            statCard({
                label: 'Sessions',
                icon: 'layers',
                value: esc(String(sessions.length)),
                sub: sessions.length > 1 ? `längste ${esc(fmtDuration(longest))}` : sessions.length === 1 ? esc(fmtDuration(longest)) : 'keine',
            }),
        ].join('');
    }

    sessionsHtml(data) {
        return data.sessions.map((s, i) => {
            const color = tempColor(s.max);
            const end = s.ongoing ? 'jetzt' : fmtTime(s.end);
            const startLabel = s.starts_before ? `${fmtTime(s.start)} (Vortag)` : fmtTime(s.start);
            const endLabel = s.ends_after && !s.ongoing ? `${end} (Folgetag)` : end;
            const metrics = [
                `<span class="metric">Max <strong>${esc(fmtTemp(s.max))}</strong></span>`,
                `<span class="metric">Ø <strong>${esc(fmtTemp(s.avg))}</strong></span>`,
            ];
            if (s.heatup_60 !== null) {
                metrics.push(`<span class="metric" title="Ab Heizbeginn ${esc(fmtTime(s.heat_start))} Uhr">60 °C nach <strong>${esc(fmtDuration(s.heatup_60))}</strong></span>`);
            }
            if (s.heatup_80 !== null) {
                metrics.push(`<span class="metric" title="Ab Heizbeginn ${esc(fmtTime(s.heat_start))} Uhr">80 °C nach <strong>${esc(fmtDuration(s.heatup_80))}</strong></span>`);
            }
            const aria = `Session ${i + 1}: ${startLabel} bis ${endLabel}, Dauer ${fmtDuration(s.duration)}, Maximum ${fmtTemp(s.max)}. Im Diagramm anzeigen.`;
            return `
                <li>
                    <button type="button" class="session${this.selected === i ? ' is-selected' : ''}" data-session="${i}" style="--session-color:${color}" aria-label="${esc(aria)}" aria-pressed="${this.selected === i}">
                        <span class="session-index">${i + 1}</span>
                        <span class="session-main">
                            <span class="session-time">
                                <strong>${esc(startLabel)} – ${esc(endLabel)}</strong>
                                <span class="session-duration">${esc(fmtDuration(s.duration))}</span>
                                ${s.ongoing ? '<span class="session-live">läuft</span>' : ''}
                            </span>
                            <span class="session-metrics">${metrics.join('')}</span>
                        </span>
                        <span class="session-go" aria-hidden="true">${icons.zoom({ size: 20 })}</span>
                    </button>
                </li>`;
        }).join('');
    }

    updateParts() {
        const data = this.data;
        const stats = this.container.querySelector('.js-stats');
        if (stats) {
            stats.innerHTML = this.statsHtml(data);
        }
        const list = this.container.querySelector('.js-sessions');
        if (list) {
            list.innerHTML = this.sessionsHtml(data);
        }
        if (this.chart) {
            this.chart.setOption(this.buildOption(data));
            this.afterZoom();
        }
    }

    /* -------------------------------------------------------------------
       Diagramm
       ------------------------------------------------------------------- */

    initChart() {
        const el = this.container.querySelector('.js-day-chart');
        if (!el) {
            return;
        }
        if (!echartsReady()) {
            el.innerHTML = `<div class="chart-fallback">${esc(ECHARTS_MISSING)}</div>`;
            return;
        }
        this.chart = createChart(el);
        this.chart.setOption(this.buildOption(this.data));
        this.chart.on('datazoom', () => this.afterZoom());
        this.afterZoom();

        // Falls die Schrift erst nach dem Zeichnen geladen wurde, neu zeichnen.
        document.fonts?.ready.then(() => {
            if (this.chart && !this.chart.isDisposed()) {
                this.chart.resize();
            }
        });
    }

    buildOption(data) {
        const { p, font, textStyle, tooltip, axisLabel, axisLine, splitLine } = baseStyle();
        const el = this.container.querySelector('.js-day-chart');
        const narrow = isNarrow(el);
        const start = data.day_start;
        const span = data.day_end - data.day_start;
        const rel = (ms) => ms - start;
        const threshold = data.threshold;

        const points = data.points.map(([t, v]) => [rel(t), v]);
        const values = data.points.filter((x) => x[1] !== null).map((x) => x[1]);
        const vmin = values.length ? Math.min(...values) : 0;
        const vmax = values.length ? Math.max(...values) : threshold;
        const hasSessions = data.sessions.length > 0;
        const yMin = Math.max(-40, Math.floor((vmin - 4) / 10) * 10);
        const yMax = Math.max(Math.ceil((vmax + 4) / 10) * 10, hasSessions ? 100 : threshold + 10);
        const yInterval = narrow || yMax - yMin > 100 ? 20 : 10;

        const now = Date.now();
        const isToday = data.date === D.today();

        const sessionAreas = data.sessions.map((s, i) => [
            {
                name: `Session ${i + 1}`,
                xAxis: rel(Math.max(s.start, start)),
                itemStyle: {
                    color: p.session,
                    borderColor: p.sessionBorder,
                    borderWidth: 1,
                    borderType: 'dashed',
                },
            },
            { xAxis: rel(Math.min(s.ongoing ? now : s.end, data.day_end)) },
        ]);

        const zoneAreas = config.zones
            .filter((z) => z.to > yMin && z.from < yMax)
            .map((z, i) => [
                { name: z.label, yAxis: Math.max(z.from, yMin), itemStyle: { color: i % 2 ? p.zone2 : p.zone1 } },
                { yAxis: Math.min(z.to, yMax) },
            ]);

        const nowLine = isToday && now < data.day_end
            ? [{
                xAxis: rel(now),
                label: { formatter: 'jetzt', position: 'insideEndTop', color: p.accentText, fontSize: 11, fontWeight: 600, fontFamily: font },
                lineStyle: { color: p.accent, type: 'solid', width: 1, opacity: 0.55 },
            }]
            : [];

        const maxPoint = data.stats.max !== null && data.stats.max_at
            ? [{
                coord: [rel(data.stats.max_at), data.stats.max],
                value: data.stats.max,
                itemStyle: { color: tempColor(data.stats.max), borderColor: p.surface, borderWidth: 2.5 },
            }]
            : [];

        const timeLabel = (v) => {
            if (v >= span - 1000) {
                return '24:00';
            }
            return fmtTime(start + v);
        };

        return {
            animationDuration: 700,
            animationEasing: 'cubicOut',
            textStyle,
            grid: {
                left: narrow ? 40 : 52,
                right: narrow ? 20 : 22,
                top: 30,
                bottom: narrow ? 74 : 84,
            },
            tooltip: {
                ...tooltip,
                trigger: 'axis',
                axisPointer: {
                    type: 'cross',
                    snap: true,
                    lineStyle: { color: p.axis, type: 'dashed', width: 1 },
                    crossStyle: { color: p.axis, type: 'dashed', width: 1 },
                    label: {
                        backgroundColor: p.surface3,
                        color: p.text,
                        fontFamily: font,
                        fontWeight: 600,
                        borderRadius: 6,
                        padding: [4, 8],
                        formatter: (param) => (param.axisDimension === 'x'
                            ? timeLabel(param.value)
                            : `${fmtNumber(param.value, 1)} °C`),
                    },
                },
                formatter: (params) => this.tooltipHtml(params, data),
            },
            xAxis: {
                type: 'value',
                min: 0,
                max: span,
                // Feste Marken ab Mitternacht; afterZoom() verfeinert sie beim Zoomen.
                axisLabel: { ...axisLabel, formatter: timeLabel, hideOverlap: true, margin: 12, customValues: tickValues(0, span, HOUR * (narrow ? 3 : 1)) },
                axisLine,
                axisTick: { show: false, customValues: tickValues(0, span, HOUR * (narrow ? 3 : 1)) },
                splitLine: { show: true, lineStyle: { color: p.grid } },
            },
            yAxis: {
                type: 'value',
                min: yMin,
                max: yMax,
                interval: yInterval,
                axisLabel: { ...axisLabel, formatter: (v) => `${v}°` },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine,
            },
            visualMap: {
                show: false,
                type: 'continuous',
                seriesIndex: 0,
                dimension: 1,
                min: 10,
                max: 100,
                inRange: { color: tempRamp(10, 100) },
            },
            dataZoom: [
                {
                    id: 'inside',
                    type: 'inside',
                    xAxisIndex: 0,
                    filterMode: 'none',
                    minValueSpan: 20 * MIN,
                    zoomOnMouseWheel: true,
                    moveOnMouseWheel: false,
                    moveOnMouseMove: !isTouch(),
                },
                {
                    id: 'slider',
                    type: 'slider',
                    xAxisIndex: 0,
                    filterMode: 'none',
                    minValueSpan: 20 * MIN,
                    height: 28,
                    bottom: narrow ? 10 : 14,
                    left: narrow ? 40 : 52,
                    right: narrow ? 20 : 22,
                    brushSelect: false,
                    borderColor: 'transparent',
                    backgroundColor: p.surface2,
                    fillerColor: alpha(p.accent, 0.14),
                    handleIcon: 'path://M-3,-10h6a2,2,0,0,1,2,2v16a2,2,0,0,1-2,2h-6a2,2,0,0,1-2-2v-16a2,2,0,0,1,2-2z',
                    handleSize: '110%',
                    handleStyle: { color: p.surfaceRaised, borderColor: p.accent, borderWidth: 1.5 },
                    moveHandleSize: 0,
                    emphasis: { handleStyle: { borderColor: p.accent, color: p.surfaceRaised } },
                    dataBackground: {
                        lineStyle: { color: p.axis, width: 1 },
                        areaStyle: { color: p.grid, opacity: 1 },
                    },
                    selectedDataBackground: {
                        lineStyle: { color: p.accent, width: 1 },
                        areaStyle: { color: alpha(p.accent, 0.18), opacity: 1 },
                    },
                    textStyle: { color: p.label, fontFamily: font, fontSize: 11 },
                    labelFormatter: (v) => timeLabel(v),
                    showDetail: !narrow,
                },
            ],
            series: [
                {
                    id: 'temp',
                    name: 'Temperatur',
                    type: 'line',
                    data: points,
                    showSymbol: false,
                    symbol: 'circle',
                    symbolSize: 8,
                    smooth: 0.3,
                    connectNulls: false,
                    lineStyle: { width: 2.6, cap: 'round', join: 'round' },
                    emphasis: { disabled: true },
                    areaStyle: {
                        color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: alpha(tempColor(Math.max(vmax, 30)), p.isDark ? 0.32 : 0.24) },
                            { offset: 1, color: alpha(tempColor(Math.max(vmax, 30)), 0) },
                        ]),
                        origin: 'start',
                    },
                    markPoint: {
                        symbol: 'circle',
                        symbolSize: 11,
                        animation: true,
                        data: maxPoint,
                        label: {
                            show: true,
                            position: 'top',
                            distance: 10,
                            formatter: (m) => `max ${fmtNumber(m.value, 1)} °C`,
                            color: p.text,
                            fontFamily: font,
                            fontSize: 12,
                            fontWeight: 650,
                            backgroundColor: p.surfaceRaised,
                            borderColor: p.borderStrong,
                            borderWidth: 1,
                            borderRadius: 8,
                            padding: [5, 8],
                        },
                    },
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        animation: false,
                        data: [{ yAxis: threshold }],
                        lineStyle: { color: p.label, type: [4, 4], width: 1, opacity: 0.55 },
                        label: {
                            formatter: `Schwelle ${fmtNumber(threshold, 0)} °C`,
                            position: 'insideStartTop',
                            color: p.label,
                            fontFamily: font,
                            fontSize: 10,
                        },
                    },
                },
                {
                    id: 'zones',
                    type: 'line',
                    data: [],
                    silent: true,
                    markArea: {
                        silent: true,
                        animation: false,
                        data: zoneAreas,
                        label: {
                            position: 'insideTopRight',
                            color: p.label,
                            fontFamily: font,
                            fontSize: 10,
                            fontWeight: 600,
                            opacity: 0.85,
                        },
                    },
                },
                {
                    id: 'sessions',
                    type: 'line',
                    data: [],
                    silent: true,
                    markArea: {
                        silent: true,
                        data: sessionAreas,
                        label: {
                            // Unten, damit sich das Label nicht mit der Maximum-Markierung überlappt.
                            position: 'insideBottom',
                            distance: 8,
                            color: p.accentText,
                            fontFamily: font,
                            fontSize: 11,
                            fontWeight: 650,
                        },
                    },
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        animation: false,
                        data: nowLine,
                    },
                },
            ],
        };
    }

    tooltipHtml(params, data) {
        const item = params.find((x) => x.seriesId === 'temp') ?? params[0];
        if (!item) {
            return '';
        }
        const ms = data.day_start + item.value[0];
        const v = item.value[1];
        const time = `<div class="tt-time">${esc(fmtTime(ms))} Uhr</div>`;
        if (v === null || v === undefined) {
            return `${time}<div class="tt-note">Keine Messung</div>`;
        }
        const idx = data.sessions.findIndex((s) => ms >= s.start && ms <= (s.ongoing ? Date.now() : s.end));
        let note = '';
        if (idx >= 0) {
            const s = data.sessions[idx];
            note = `<div class="tt-note">Session ${idx + 1} · max. ${esc(fmtTemp(s.max))}</div>`;
        } else {
            const heating = data.sessions.findIndex((s) => ms >= s.heat_start && ms < s.start);
            if (heating >= 0) {
                note = `<div class="tt-note">Aufheizen · Session ${heating + 1}</div>`;
            }
        }
        return `
            ${time}
            <div class="tt-value"><span class="tt-dot" style="background:${tempColor(v)}"></span>${esc(fmtNumber(v, 1))}<span class="tt-unit">°C</span></div>
            ${note}`;
    }

    /** Nach jedem Zoomen: Achsenteilung, Reset-Knopf, Touch-Verhalten. */
    afterZoom() {
        if (!this.chart || !this.data) {
            return;
        }
        const span = this.data.day_end - this.data.day_start;
        const dz = this.chart.getOption().dataZoom?.[0];
        if (!dz) {
            return;
        }
        const from = dz.startValue ?? (dz.start / 100) * span;
        const to = dz.endValue ?? (dz.end / 100) * span;
        const visible = to - from;
        const width = this.chart.getWidth() - 70;
        const maxTicks = Math.max(3, Math.floor(width / 64));
        const interval = TICK_STEPS.find((step) => visible / step <= maxTicks) ?? 6 * HOUR;
        const ticks = tickValues(0, span, interval);

        const zoomed = visible < span * 0.98;
        const update = { xAxis: { axisLabel: { customValues: ticks }, axisTick: { customValues: ticks } } };
        // Auf Touch-Geräten verschiebt ein Finger erst, wenn hineingezoomt ist –
        // sonst bleibt die Seite mit einem Finger scrollbar.
        if (isTouch() && zoomed !== this.zoomed) {
            update.dataZoom = [{ id: 'inside', moveOnMouseMove: zoomed }];
        }
        this.zoomed = zoomed;
        this.chart.setOption(update);

        const reset = this.container.querySelector('[data-action="zoom-reset"]');
        if (reset) {
            reset.hidden = !zoomed;
        }
    }

    zoomTo(fromMs, toMs) {
        if (!this.chart) {
            return;
        }
        const start = this.data.day_start;
        const span = this.data.day_end - start;
        const a = Math.max(0, fromMs - start);
        const b = Math.min(span, toMs - start);
        this.chart.dispatchAction({ type: 'dataZoom', startValue: a, endValue: b });
    }

    zoomToSessions(indexes) {
        const list = indexes.map((i) => this.data.sessions[i]).filter(Boolean);
        if (!list.length) {
            return;
        }
        const now = Date.now();
        const from = Math.min(...list.map((s) => Math.min(s.heat_start ?? s.start, s.start)));
        const to = Math.max(...list.map((s) => (s.ongoing ? now : s.end)));
        const pad = Math.max(15 * MIN, (to - from) * 0.12);
        this.zoomTo(from - pad, to + pad * 1.5);
    }

    highlightSession(index) {
        this.selected = index;
        this.container.querySelectorAll('.session').forEach((btn) => {
            const active = Number(btn.dataset.session) === index;
            btn.classList.toggle('is-selected', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    handleClick(e) {
        const target = e.target.closest('[data-action], [data-session]');
        if (!target) {
            return;
        }
        if (target.dataset.action === 'retry') {
            this.show({ view: 'day', date: this.date });
            return;
        }
        if (target.dataset.action === 'zoom-session' && this.data) {
            this.highlightSession(null);
            this.zoomToSessions(this.data.sessions.map((_, i) => i));
            return;
        }
        if (target.dataset.action === 'zoom-reset') {
            this.highlightSession(null);
            this.chart?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
            return;
        }
        if (target.dataset.session !== undefined) {
            const index = Number(target.dataset.session);
            this.highlightSession(index);
            this.zoomToSessions([index]);
            const card = this.container.querySelector('.chart-card');
            const rect = card?.getBoundingClientRect();
            if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) {
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }
}
