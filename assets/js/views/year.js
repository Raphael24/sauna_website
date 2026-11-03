/**
 * Jahresansicht: Kalender-Heatmap (umschaltbar Max-Temperatur / Saunadauer),
 * Saunatage pro Monat und Jahreskennzahlen.
 */

import { api } from '../api.js';
import { baseStyle, createChart, disposeChart, echartsReady, ECHARTS_MISSING } from '../charts/base.js';
import { alpha, palette, tempColor, tempRamp } from '../colors.js';
import * as D from '../dates.js';
import { MONTHS, MONTHS_SHORT, fmtDayMedium, fmtDayTitle, fmtDuration, fmtDurationHtml, fmtHours, fmtNumber, fmtTemp } from '../format.js';
import { icons } from '../icons.js';
import { errorCard, esc, statCard, valueWithUnit } from '../ui.js';

const MODE_KEY = 'sauna-heatmap-mode';
const DURATION_STEPS = [30, 60, 90, 120, 180]; // Minuten
const HEAT_MIN = 60; // untere Grenze der Farbskala (°C)

function readMode() {
    try {
        return localStorage.getItem(MODE_KEY) === 'duration' ? 'duration' : 'max';
    } catch {
        return 'max';
    }
}

function writeMode(mode) {
    try {
        localStorage.setItem(MODE_KEY, mode);
    } catch {
        /* nicht wichtig */
    }
}

export class YearView {
    constructor(container, { navigate }) {
        this.container = container;
        this.navigate = navigate;
        this.heatmap = null;
        this.bars = null;
        this.data = null;
        this.year = null;
        this.token = 0;
        this.mode = readMode();
        this.layoutKey = '';

        this.onClick = (e) => {
            if (e.target.closest('[data-action="retry"]')) {
                this.show({ view: 'year', date: `${this.year}-01-01` });
                return;
            }
            const modeBtn = e.target.closest('[data-mode]');
            if (modeBtn && modeBtn.dataset.mode !== this.mode) {
                this.mode = modeBtn.dataset.mode;
                writeMode(this.mode);
                this.container.querySelectorAll('[data-mode]').forEach((b) => {
                    b.setAttribute('aria-checked', String(b.dataset.mode === this.mode));
                    b.tabIndex = b.dataset.mode === this.mode ? 0 : -1;
                });
                this.updateModeIndicator();
                this.drawHeatmap();
            }
        };
        this.onKey = (e) => {
            const group = e.target.closest('.js-mode');
            if (!group || !['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const next = group.querySelector(`[data-mode="${this.mode === 'max' ? 'duration' : 'max'}"]`);
            next.focus();
            next.click();
        };
        this.onResize = () => {
            const key = this.heatmapLayout().key;
            if (key !== this.layoutKey) {
                this.drawHeatmap();
            }
            this.updateModeIndicator();
        };
        container.addEventListener('click', this.onClick);
        container.addEventListener('keydown', this.onKey);
        window.addEventListener('resize', this.onResize);
    }

    destroy() {
        this.token++;
        this.container.removeEventListener('click', this.onClick);
        this.container.removeEventListener('keydown', this.onKey);
        window.removeEventListener('resize', this.onResize);
        disposeChart(this.heatmap);
        disposeChart(this.bars);
        this.heatmap = null;
        this.bars = null;
    }

    async show(state, meta = {}) {
        const token = ++this.token;
        this.year = D.yearKey(state.date);
        const timer = setTimeout(() => token === this.token && this.renderSkeleton(), 120);
        try {
            const data = await api.year(this.year);
            if (token !== this.token) {
                return;
            }
            this.data = data;
            this.render(meta);
        } catch (err) {
            if (token !== this.token) {
                return;
            }
            this.disposeCharts();
            this.container.innerHTML = `<div class="view-content is-entering">${errorCard(err.message)}</div>`;
        } finally {
            clearTimeout(timer);
            this.container.setAttribute('aria-busy', 'false');
        }
    }

    async refresh() {
        /* Jahreswerte ändern sich nur langsam – kein stilles Nachladen nötig. */
    }

    themeChanged() {
        if (this.data) {
            this.render({ silent: true });
        }
    }

    disposeCharts() {
        disposeChart(this.heatmap);
        disposeChart(this.bars);
        this.heatmap = null;
        this.bars = null;
    }

    renderSkeleton() {
        this.container.setAttribute('aria-busy', 'true');
        this.disposeCharts();
        this.container.innerHTML = `
            <div class="view-content" aria-hidden="true">
                <div class="stats-grid">${'<div class="skeleton skeleton-stat"></div>'.repeat(5)}</div>
                <div class="skeleton skeleton-heatmap"></div>
                <div class="skeleton skeleton-heatmap"></div>
            </div>`;
    }

    render(meta = {}) {
        const data = this.data;
        this.disposeCharts();
        const enter = meta.silent ? '' : ` is-entering${meta.direction > 0 ? ' from-right' : meta.direction < 0 ? ' from-left' : ''}`;
        const any = data.totals.sauna_days > 0;

        this.container.innerHTML = `
            <div class="view-content${enter}">
                <div class="stats-grid">${this.statsHtml(data)}</div>

                <section class="card" aria-labelledby="heatmap-title">
                    <div class="card-head">
                        <div>
                            <h3 class="card-title" id="heatmap-title">Saunajahr ${esc(String(data.year))}</h3>
                            <p class="card-sub">${any ? 'Jedes Kästchen ist ein Tag – antippen für die Tagesansicht' : `${esc(String(data.year))} wurde (noch) nicht sauniert`}</p>
                        </div>
                        <div class="segmented segmented--small js-mode" role="radiogroup" aria-label="Färbung der Heatmap">
                            <span class="segmented-indicator" aria-hidden="true"></span>
                            <button type="button" role="radio" class="segmented-option" data-mode="max" aria-checked="${this.mode === 'max'}" tabindex="${this.mode === 'max' ? 0 : -1}">Max-Temperatur</button>
                            <button type="button" role="radio" class="segmented-option" data-mode="duration" aria-checked="${this.mode === 'duration'}" tabindex="${this.mode === 'duration' ? 0 : -1}">Saunadauer</button>
                        </div>
                    </div>
                    <div class="chart chart--heatmap js-heatmap" role="img" aria-label="Kalender-Heatmap ${esc(String(data.year))}: ${data.totals.sauna_days} Saunatage"></div>
                    <div class="heatmap-foot legend js-heatmap-legend" aria-hidden="true"></div>
                </section>

                <section class="card" aria-labelledby="months-title">
                    <div class="card-head">
                        <div>
                            <h3 class="card-title" id="months-title">Saunatage pro Monat</h3>
                            <p class="card-sub">Balken antippen für die Monatsansicht</p>
                        </div>
                    </div>
                    <div class="chart chart--months js-months" role="img" aria-label="Saunatage pro Monat"></div>
                    <ul class="month-list" aria-label="Monate">${this.monthLinks(data)}</ul>
                </section>
            </div>`;

        this.updateModeIndicator();
        if (!echartsReady()) {
            this.container.querySelectorAll('.js-heatmap, .js-months').forEach((el) => {
                el.innerHTML = `<div class="chart-fallback">${esc(ECHARTS_MISSING)}</div>`;
            });
            return;
        }
        this.drawHeatmap();
        this.drawBars();
    }

    updateModeIndicator() {
        const group = this.container.querySelector('.js-mode');
        if (!group) {
            return;
        }
        const active = group.querySelector('[aria-checked="true"]');
        const ind = group.querySelector('.segmented-indicator');
        if (active && ind) {
            ind.style.width = `${active.offsetWidth}px`;
            ind.style.transform = `translateX(${active.offsetLeft}px)`;
        }
    }

    statsHtml(data) {
        const t = data.totals;
        const avg = t.sauna_days ? t.sauna_seconds / t.sauna_days : 0;
        return [
            statCard({
                label: 'Saunatage',
                icon: 'calendar',
                value: esc(String(t.sauna_days)),
                sub: t.sessions ? `${t.sessions} ${t.sessions === 1 ? 'Session' : 'Sessions'}` : '&nbsp;',
                color: t.sauna_days ? palette().accent : undefined,
            }),
            statCard({
                label: 'Gesamtstunden',
                icon: 'timer',
                value: valueWithUnit(fmtNumber(t.sauna_seconds / 3600, 1), 'h'),
                sub: t.sauna_days ? `Ø ${esc(fmtDuration(avg))} pro Saunatag` : '&nbsp;',
            }),
            statCard({
                label: 'Rekordtemperatur',
                icon: 'trophy',
                value: t.record ? valueWithUnit(fmtNumber(t.record.max, 1), '°C') : '–',
                sub: t.record ? `${esc(fmtDayMedium(t.record.date))} ${icons.chevronRight({ size: 12 })}` : 'noch keine',
                color: t.record ? tempColor(t.record.max) : undefined,
                href: t.record ? `?view=day&date=${t.record.date}` : undefined,
                ariaLabel: t.record ? `Rekordtemperatur ${fmtTemp(t.record.max)} am ${fmtDayTitle(t.record.date)}. Tagesansicht öffnen.` : undefined,
            }),
            statCard({
                label: 'Längste Session',
                icon: 'hourglass',
                value: t.longest_session ? fmtDurationHtml(t.longest_session.seconds) : '–',
                sub: t.longest_session ? `${esc(fmtDayMedium(t.longest_session.date))} ${icons.chevronRight({ size: 12 })}` : '&nbsp;',
                href: t.longest_session ? `?view=day&date=${t.longest_session.date}` : undefined,
                ariaLabel: t.longest_session ? `Längste Session ${fmtDuration(t.longest_session.seconds)} am ${fmtDayTitle(t.longest_session.date)}. Tagesansicht öffnen.` : undefined,
            }),
        ].join('');
    }

    monthLinks(data) {
        const today = D.today();
        return data.months.map((m) => {
            const key = `${data.year}-${String(m.month).padStart(2, '0')}`;
            if (key > D.monthKey(today)) {
                return '';
            }
            const hasData = data.days.some((d) => d.date.startsWith(key));
            const text = m.sauna_days
                ? `${m.sauna_days} ${m.sauna_days === 1 ? 'Tag' : 'Tage'} · ${fmtHours(m.sauna_seconds)}`
                : hasData ? 'nicht sauniert' : 'keine Messwerte';
            return `<li><a class="month-chip" href="?view=month&amp;date=${key}" data-nav><strong>${MONTHS[m.month - 1]}</strong><span>${esc(text)}</span></a></li>`;
        }).join('');
    }

    /**
     * Aufteilung der Heatmap je nach Breite: ganzes Jahr in einer Zeile,
     * zwei Halbjahre oder vier Quartale (Handy), damit die Kästchen gross
     * genug zum Antippen bleiben.
     */
    heatmapLayout() {
        const el = this.container.querySelector('.js-heatmap');
        const width = el?.clientWidth || this.container.clientWidth || 800;
        const labelW = 34;
        const rows = width - labelW - 8;
        let parts = 1;
        if (rows / 54 < 13) parts = 2;
        if (rows / 28 < 15) parts = 4;
        const weeks = parts === 1 ? 54 : parts === 2 ? 28 : 15;
        const cell = Math.max(10, Math.min(26, Math.floor(rows / weeks)));
        return { parts, cell, labelW, key: `${parts}-${cell}` };
    }

    drawHeatmap() {
        const el = this.container.querySelector('.js-heatmap');
        if (!el || !this.data) {
            return;
        }
        const data = this.data;
        const { p, font, textStyle, tooltip } = baseStyle();
        const layout = this.heatmapLayout();
        this.layoutKey = layout.key;
        const year = data.year;
        const mode = this.mode;

        const ranges = layout.parts === 1
            ? [[`${year}-01-01`, `${year}-12-31`]]
            : layout.parts === 2
                ? [[`${year}-01-01`, `${year}-06-30`], [`${year}-07-01`, `${year}-12-31`]]
                : [[`${year}-01-01`, `${year}-03-31`], [`${year}-04-01`, `${year}-06-30`], [`${year}-07-01`, `${year}-09-30`], [`${year}-10-01`, `${year}-12-31`]];

        const blockH = layout.cell * 7 + 28;
        const height = ranges.length * blockH + 8;
        el.style.height = `${height}px`;

        const byDate = new Map(data.days.map((d) => [d.date, d]));
        const cellData = data.days
            .filter((d) => d.sauna_day)
            .map((d) => [d.date, mode === 'max' ? d.max : Math.round(d.sauna_seconds / 60)]);

        const calendars = ranges.map((range, i) => ({
            range,
            top: 22 + i * blockH,
            left: layout.labelW,
            right: 6,
            cellSize: [layout.cell, layout.cell],
            orient: 'horizontal',
            splitLine: { show: false },
            itemStyle: { color: p.emptyCell, borderColor: p.surface, borderWidth: layout.cell > 14 ? 3 : 2 },
            yearLabel: { show: false },
            monthLabel: { nameMap: MONTHS_SHORT, color: p.label, fontFamily: font, fontSize: 11, margin: 6 },
            dayLabel: {
                firstDay: 1,
                nameMap: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
                color: p.label,
                fontFamily: font,
                fontSize: 10,
                margin: 6,
            },
        }));

        const visualMap = mode === 'max'
            ? {
                show: false,
                type: 'continuous',
                // Saunatage liegen fast immer zwischen 60 und 100 °C – dort die Farben spreizen.
                min: HEAT_MIN,
                max: 100,
                inRange: { color: tempRamp(HEAT_MIN, 100, 12) },
            }
            : {
                show: false,
                type: 'piecewise',
                pieces: [
                    { lt: DURATION_STEPS[0], color: alpha(p.accent.startsWith('#') ? p.accent : '#ff7a2f', 0.35) },
                    ...DURATION_STEPS.slice(1).map((step, i) => ({
                        gte: DURATION_STEPS[i],
                        lt: step,
                        color: tempColor(55 + i * 12),
                    })),
                    { gte: DURATION_STEPS[DURATION_STEPS.length - 1], color: tempColor(100) },
                ],
            };

        if (!this.heatmap) {
            this.heatmap = createChart(el);
            this.heatmap.on('click', (params) => {
                const date = params.data?.[0];
                if (date) {
                    this.navigate({ view: 'day', date });
                }
            });
        } else {
            this.heatmap.resize();
        }

        this.heatmap.setOption({
            textStyle,
            animationDuration: 500,
            tooltip: {
                ...tooltip,
                trigger: 'item',
                formatter: (params) => {
                    const d = byDate.get(params.data[0]);
                    if (!d) {
                        return '';
                    }
                    return `
                        <div class="tt-time">${esc(fmtDayMedium(d.date))}</div>
                        <div class="tt-value"><span class="tt-dot" style="background:${tempColor(d.max)}"></span>${esc(fmtNumber(d.max, 1))}<span class="tt-unit">°C max.</span></div>
                        <div class="tt-row"><span>Saunadauer</span><strong>${esc(fmtDuration(d.sauna_seconds))}</strong></div>
                        <div class="tt-row"><span>Sessions</span><strong>${d.sessions}</strong></div>`;
                },
            },
            visualMap,
            calendar: calendars,
            series: calendars.map((c, i) => ({
                type: 'heatmap',
                coordinateSystem: 'calendar',
                calendarIndex: i,
                cursor: 'pointer',
                data: cellData.filter(([date]) => date >= c.range[0] && date <= c.range[1]),
                itemStyle: { borderColor: p.surface, borderWidth: layout.cell > 14 ? 3 : 2, borderRadius: 4 },
                emphasis: { itemStyle: { borderColor: p.text, borderWidth: 1.5 } },
            })),
        }, { notMerge: true });

        this.renderHeatmapLegend();
    }

    renderHeatmapLegend() {
        const legend = this.container.querySelector('.js-heatmap-legend');
        if (!legend) {
            return;
        }
        const p = palette();
        if (this.mode === 'max') {
            legend.innerHTML = `
                <span class="legend-item"><span class="legend-swatch" style="--swatch:${p.emptyCell}"></span>nicht sauniert</span>
                <span class="legend-item">≤ ${HEAT_MIN} °C <span class="legend-scale" style="background:linear-gradient(90deg, ${tempRamp(HEAT_MIN, 100, 6).join(',')})"></span> 100 °C</span>`;
        } else {
            const swatches = [
                ['&lt; 30 min', alpha(p.accent.startsWith('#') ? p.accent : '#ff7a2f', 0.35)],
                ['30–60', tempColor(55)],
                ['1–1½ h', tempColor(67)],
                ['1½–2 h', tempColor(79)],
                ['2–3 h', tempColor(91)],
                ['&gt; 3 h', tempColor(100)],
            ];
            legend.innerHTML = `
                <span class="legend-item"><span class="legend-swatch" style="--swatch:${p.emptyCell}"></span>nicht sauniert</span>
                ${swatches.map(([label, color]) => `<span class="legend-item"><span class="legend-swatch" style="--swatch:${color}"></span>${label}</span>`).join('')}`;
        }
    }

    drawBars() {
        const el = this.container.querySelector('.js-months');
        if (!el) {
            return;
        }
        const data = this.data;
        const { p, font, textStyle, tooltip, axisLabel, axisLine, splitLine } = baseStyle();
        const months = data.months;
        const currentMonth = D.monthKey(D.today());

        this.bars = createChart(el);
        this.bars.setOption({
            textStyle,
            animationDuration: 600,
            grid: { left: 34, right: 8, top: 18, bottom: 28 },
            tooltip: {
                ...tooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: p.grid } },
                formatter: (params) => {
                    const m = months[params[0].dataIndex];
                    return `
                        <div class="tt-time">${esc(MONTHS[m.month - 1])} ${data.year}</div>
                        <div class="tt-value">${m.sauna_days}<span class="tt-unit">${m.sauna_days === 1 ? 'Saunatag' : 'Saunatage'}</span></div>
                        <div class="tt-row"><span>Stunden</span><strong>${esc(fmtHours(m.sauna_seconds))}</strong></div>
                        <div class="tt-row"><span>Sessions</span><strong>${m.sessions}</strong></div>
                        ${m.max !== null ? `<div class="tt-row"><span>Maximum</span><strong>${esc(fmtTemp(m.max))}</strong></div>` : ''}`;
                },
            },
            xAxis: {
                type: 'category',
                data: MONTHS_SHORT,
                axisLabel: { ...axisLabel, interval: 0 },
                axisLine,
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value',
                minInterval: 1,
                axisLabel,
                splitLine,
            },
            series: [{
                type: 'bar',
                barMaxWidth: 34,
                cursor: 'pointer',
                data: months.map((m) => {
                    const key = `${data.year}-${String(m.month).padStart(2, '0')}`;
                    const color = m.max !== null ? tempColor(m.max) : p.accent;
                    return {
                        value: m.sauna_days,
                        itemStyle: {
                            borderRadius: [8, 8, 3, 3],
                            color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color },
                                { offset: 1, color: alpha(color.startsWith('#') ? color : '#ff7a2f', 0.55) },
                            ]),
                            opacity: key > currentMonth ? 0.3 : 1,
                        },
                    };
                }),
                label: {
                    show: true,
                    position: 'top',
                    color: p.label,
                    fontFamily: font,
                    fontSize: 11,
                    fontWeight: 600,
                    formatter: (x) => (x.value ? x.value : ''),
                },
                emphasis: { itemStyle: { shadowBlur: 14, shadowColor: 'rgba(0,0,0,.25)' } },
            }],
        });
        this.bars.on('click', (params) => {
            const m = months[params.dataIndex];
            const key = `${data.year}-${String(m.month).padStart(2, '0')}`;
            if (key <= currentMonth) {
                this.navigate({ view: 'month', date: key === currentMonth ? D.today() : `${key}-01` });
            }
        });
    }
}
