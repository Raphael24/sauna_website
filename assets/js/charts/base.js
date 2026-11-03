/**
 * Gemeinsame Basis für alle ECharts-Diagramme: Erzeugen, Grösse anpassen,
 * Aufräumen und die Grundstile aus den CSS-Variablen.
 */

import { palette } from '../colors.js';

export function echartsReady() {
    return typeof window.echarts !== 'undefined';
}

export const ECHARTS_MISSING =
    'Die Diagramm-Bibliothek (ECharts) konnte nicht geladen werden. Bitte Internetverbindung prüfen und die Seite neu laden.';

/**
 * Erzeugt ein Diagramm, das bei jeder Grössenänderung des Containers mitwächst.
 */
export function createChart(el) {
    const chart = window.echarts.init(el, null, { renderer: 'canvas' });
    let frame = 0;
    const ro = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            if (!chart.isDisposed()) {
                chart.resize();
            }
        });
    });
    ro.observe(el);
    chart.__sauna = { ro };
    return chart;
}

export function disposeChart(chart) {
    if (!chart || chart.isDisposed()) {
        return;
    }
    chart.__sauna?.ro.disconnect();
    chart.dispose();
}

/** Grundstile für Text, Achsen und Tooltip. */
export function baseStyle() {
    const p = palette();
    const font = p.fontSans || 'Inter, system-ui, sans-serif';
    return {
        p,
        font,
        textStyle: { fontFamily: font, color: p.label },
        tooltip: {
            className: 'chart-tooltip',
            backgroundColor: p.tooltipBg,
            borderColor: p.borderStrong,
            borderWidth: 1,
            padding: [10, 14],
            textStyle: { color: p.text, fontFamily: font },
            extraCssText: `border-radius: 12px; box-shadow: ${p.isDark ? '0 18px 48px rgba(0,0,0,.45)' : '0 18px 48px rgba(74,44,20,.14)'};`,
            confine: true,
            transitionDuration: 0.12,
        },
        axisLabel: { color: p.label, fontFamily: font, fontSize: 11 },
        axisLine: { lineStyle: { color: p.axis } },
        splitLine: { lineStyle: { color: p.grid } },
    };
}

/** Ist das Diagramm schmal (Handy)? */
export function isNarrow(el) {
    return (el?.clientWidth ?? window.innerWidth) < 560;
}
