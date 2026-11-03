/**
 * Monatsansicht: Zusammenfassung, Kalenderraster und Balken der Saunadauer.
 */

import { api } from '../api.js';
import { baseStyle, createChart, disposeChart, echartsReady, ECHARTS_MISSING, isNarrow } from '../charts/base.js';
import { palette, tempColor } from '../colors.js';
import * as D from '../dates.js';
import { WEEKDAYS_SHORT, fmtDayMedium, fmtDayTitle, fmtDuration, fmtDurationHtml, fmtMonthTitle, fmtNumber, fmtTemp } from '../format.js';
import { icons } from '../icons.js';
import { errorCard, esc, statCard, valueWithUnit } from '../ui.js';

export class MonthView {
    constructor(container, { navigate }) {
        this.container = container;
        this.navigate = navigate;
        this.chart = null;
        this.data = null;
        this.month = null;
        this.token = 0;
        this.onClick = (e) => {
            if (e.target.closest('[data-action="retry"]')) {
                this.show({ view: 'month', date: `${this.month}-01` });
            }
        };
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
        this.month = D.monthKey(state.date);
        const timer = setTimeout(() => token === this.token && this.renderSkeleton(), 120);
        try {
            const data = await api.month(this.month);
            if (token !== this.token) {
                return;
            }
            this.data = data;
            this.render(meta);
        } catch (err) {
            if (token !== this.token) {
                return;
            }
            disposeChart(this.chart);
            this.chart = null;
            this.container.innerHTML = `<div class="view-content is-entering">${errorCard(err.message)}</div>`;
        } finally {
            clearTimeout(timer);
            this.container.setAttribute('aria-busy', 'false');
        }
    }

    async refresh() {
        if (!this.data || this.month !== D.monthKey(D.today())) {
            return;
        }
        const token = this.token;
        try {
            const data = await api.month(this.month, { force: true });
            if (token === this.token) {
                this.data = data;
                this.render({ silent: true });
            }
        } catch {
            /* still */
        }
    }

    themeChanged() {
        if (this.data) {
            this.render({ silent: true });
        }
    }

    renderSkeleton() {
        this.container.setAttribute('aria-busy', 'true');
        disposeChart(this.chart);
        this.chart = null;
        this.container.innerHTML = `
            <div class="view-content" aria-hidden="true">
                <div class="stats-grid">${'<div class="skeleton skeleton-stat"></div>'.repeat(4)}</div>
                <div class="card"><div class="skeleton-calendar">${'<div class="skeleton"></div>'.repeat(35)}</div></div>
            </div>`;
    }

    render(meta = {}) {
        const data = this.data;
        disposeChart(this.chart);
        this.chart = null;

        const enter = meta.silent ? '' : ` is-entering${meta.direction > 0 ? ' from-right' : meta.direction < 0 ? ' from-left' : ''}`;
        const t = data.totals;
        const anySauna = t.sauna_days > 0;

        this.container.innerHTML = `
            <div class="view-content${enter}">
                <div class="stats-grid">${this.statsHtml(data)}</div>
                <section class="card" aria-labelledby="calendar-title">
                    <div class="card-head">
                        <div>
                            <h3 class="card-title" id="calendar-title">${esc(fmtMonthTitle(data.month))}</h3>
                            <p class="card-sub">${anySauna ? 'Tag antippen für den Temperaturverlauf' : 'In diesem Monat wurde (noch) nicht sauniert'}</p>
                        </div>
                    </div>
                    <div class="calendar-weekdays" aria-hidden="true">${WEEKDAYS_SHORT.map((w) => `<span>${w}</span>`).join('')}</div>
                    <ol class="calendar-grid" aria-label="Tage im ${esc(fmtMonthTitle(data.month))}">${this.tilesHtml(data)}</ol>
                    <div class="calendar-foot legend" aria-hidden="true">
                        <span class="legend-item"><span class="legend-scale"></span>Farbe = Höchsttemperatur</span>
                        <span class="legend-item"><span class="legend-swatch" style="--swatch:transparent;border-style:dashed"></span>keine Messwerte</span>
                    </div>
                </section>
                ${anySauna ? `
                <section class="card" aria-labelledby="bars-title">
                    <div class="card-head">
                        <div>
                            <h3 class="card-title" id="bars-title">Saunadauer pro Tag</h3>
                            <p class="card-sub">Balkenfarbe nach Höchsttemperatur</p>
                        </div>
                    </div>
                    <div class="chart chart--bars js-bars" role="img" aria-label="Saunadauer pro Tag im ${esc(fmtMonthTitle(data.month))}"></div>
                </section>` : ''}
            </div>`;

        if (anySauna) {
            this.initChart();
        }
    }

    statsHtml(data) {
        const t = data.totals;
        const monthDays = data.days.filter((d) => !d.future).length;
        const hottest = t.hottest;
        return [
            statCard({
                label: 'Saunatage',
                icon: 'calendar',
                value: esc(String(t.sauna_days)),
                sub: `von ${monthDays} ${monthDays === 1 ? 'Tag' : 'Tagen'}`,
                color: t.sauna_days ? palette().accent : undefined,
            }),
            statCard({
                label: 'Gesamtdauer',
                icon: 'timer',
                value: fmtDurationHtml(t.sauna_seconds),
                sub: t.sauna_days ? `Ø ${esc(fmtDuration(t.avg_seconds_per_day))} pro Saunatag` : '&nbsp;',
            }),
            statCard({
                label: 'Sessions',
                icon: 'layers',
                value: esc(String(t.sessions)),
                sub: t.longest_session_seconds ? `längste ${esc(fmtDuration(t.longest_session_seconds))}` : '&nbsp;',
            }),
            statCard({
                label: 'Heissester Tag',
                icon: 'trophy',
                value: hottest ? valueWithUnit(fmtNumber(hottest.max, 1), '°C') : '–',
                sub: hottest ? `${esc(fmtDayMedium(hottest.date))} ${icons.chevronRight({ size: 12 })}` : 'noch keiner',
                color: hottest ? tempColor(hottest.max) : undefined,
                href: hottest ? `?view=day&date=${hottest.date}` : undefined,
                ariaLabel: hottest ? `Heissester Tag: ${fmtDayTitle(hottest.date)} mit ${fmtTemp(hottest.max)}. Tagesansicht öffnen.` : undefined,
            }),
        ].join('');
    }

    tilesHtml(data) {
        const first = `${data.month}-01`;
        const offset = D.weekday(first);
        const today = D.today();
        let html = '';
        for (let i = 0; i < offset; i++) {
            html += '<li class="day-tile is-outside" aria-hidden="true"></li>';
        }
        for (const day of data.days) {
            const num = Number(day.date.slice(8, 10));
            const isToday = day.date === today;
            if (day.future) {
                html += `<li class="day-tile is-future" aria-hidden="true"><span class="day-tile-num">${num}</span></li>`;
                continue;
            }
            const classes = ['day-tile'];
            if (isToday) classes.push('is-today');
            let style = '';
            let body = `<span class="day-tile-num">${num}</span>`;
            let label = fmtDayTitle(day.date);

            if (day.sauna_day) {
                const color = tempColor(day.max);
                const strength = Math.round(28 + Math.max(0, Math.min(1, (day.max - 40) / 55)) * 58);
                classes.push('is-sauna');
                if (strength >= 62) classes.push('is-hot');
                style = ` style="--tile:${color};--tile-strength:${strength}%"`;
                body += `
                    <span class="day-tile-max">${esc(fmtNumber(day.max, 0))}<small>°C</small></span>
                    <span class="day-tile-meta">${icons.flame({ size: 12 })}${esc(fmtDuration(day.sauna_seconds))}</span>`;
                label += `: sauniert ${fmtDuration(day.sauna_seconds)}, ${day.sessions} ${day.sessions === 1 ? 'Session' : 'Sessions'}, max. ${fmtTemp(day.max)}`;
            } else if (day.has_data) {
                body += `<span class="day-tile-ambient">${esc(fmtNumber(day.max, 0))}° max</span>`;
                label += ': nicht sauniert';
            } else {
                classes.push('is-empty');
                label += ': keine Messwerte';
            }
            html += `<li><a class="${classes.join(' ')}"${style} href="?view=day&amp;date=${day.date}" data-nav aria-label="${esc(label)}"${isToday ? ' aria-current="date"' : ''}>${body}</a></li>`;
        }
        return html;
    }

    initChart() {
        const el = this.container.querySelector('.js-bars');
        if (!el) {
            return;
        }
        if (!echartsReady()) {
            el.innerHTML = `<div class="chart-fallback">${esc(ECHARTS_MISSING)}</div>`;
            return;
        }
        const data = this.data;
        const { p, font, textStyle, tooltip, axisLabel, axisLine, splitLine } = baseStyle();
        const narrow = isNarrow(el);
        const days = data.days;
        const today = D.today();
        const maxMinutes = Math.max(...days.map((d) => (d.sauna_day ? d.sauna_seconds / 60 : 0)));

        this.chart = createChart(el);
        this.chart.setOption({
            textStyle,
            animationDuration: 600,
            grid: { left: narrow ? 38 : 50, right: 10, top: 16, bottom: 30 },
            tooltip: {
                ...tooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: p.grid } },
                formatter: (params) => {
                    const d = days[params[0].dataIndex];
                    if (!d || !d.sauna_day) {
                        return `<div class="tt-time">${esc(fmtDayMedium(d.date))}</div><div class="tt-note" style="color:var(--text-muted)">${d.has_data ? 'Nicht sauniert' : 'Keine Messwerte'}</div>`;
                    }
                    return `
                        <div class="tt-time">${esc(fmtDayMedium(d.date))}</div>
                        <div class="tt-value"><span class="tt-dot" style="background:${tempColor(d.max)}"></span>${esc(fmtDuration(d.sauna_seconds))}</div>
                        <div class="tt-row"><span>Maximum</span><strong>${esc(fmtTemp(d.max))}</strong></div>
                        <div class="tt-row"><span>Sessions</span><strong>${d.sessions}</strong></div>`;
                },
            },
            xAxis: {
                type: 'category',
                data: days.map((d) => String(Number(d.date.slice(8)))),
                axisLabel: {
                    ...axisLabel,
                    interval: narrow ? 4 : 1,
                    formatter: (v, i) => (days[i]?.date === today ? `{today|${v}}` : v),
                    rich: { today: { color: p.accentText, fontWeight: 700, fontFamily: font } },
                },
                axisLine,
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value',
                // Runde Schritte: 15 min, 30 min, 1 h oder 2 h.
                interval: maxMinutes <= 60 ? 15 : maxMinutes <= 150 ? 30 : maxMinutes <= 360 ? 60 : 120,
                axisLabel: { ...axisLabel, formatter: (v) => (v >= 60 ? `${fmtNumber(v / 60, v % 60 ? 1 : 0)} h` : `${v} min`) },
                splitLine,
            },
            series: [{
                type: 'bar',
                barMaxWidth: 22,
                cursor: 'pointer',
                data: days.map((d) => ({
                    value: d.sauna_day ? Math.round(d.sauna_seconds / 60) : 0,
                    itemStyle: {
                        color: d.sauna_day ? tempColor(d.max) : p.grid,
                        borderRadius: [6, 6, 2, 2],
                    },
                })),
                emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,.25)' } },
            }],
        });
        this.chart.on('click', (params) => {
            const d = days[params.dataIndex];
            if (d && !d.future) {
                this.navigate({ view: 'day', date: d.date });
            }
        });
    }
}
