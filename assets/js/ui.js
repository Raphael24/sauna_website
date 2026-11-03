/**
 * Kleine UI-Helfer: Escaping, Kennzahlen-Karten, Skelette, Fehler, Toasts.
 */

import { icons } from './icons.js';

export function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** HTML-String in ein Element umwandeln. */
export function html(markup) {
    const tpl = document.createElement('template');
    tpl.innerHTML = markup.trim();
    return tpl.content.firstElementChild;
}

/**
 * Kennzahlen-Karte.
 * @param {{label: string, icon?: string, value: string, sub?: string, color?: string, href?: string, ariaLabel?: string}} o
 *   value und sub dürfen HTML enthalten (bereits escaped).
 */
export function statCard({ label, icon, value, sub = '', color, href, ariaLabel, textValue = false }) {
    const style = color ? ` style="--stat-color:${esc(color)}"` : '';
    const tag = href ? 'a' : 'div';
    const attrs = href ? ` href="${esc(href)}" data-nav` : '';
    const aria = ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : '';
    return `
        <${tag} class="stat"${attrs}${style}${aria}>
            <span class="stat-label">${icon ? icons[icon]({ size: 15 }) : ''}${esc(label)}</span>
            <span class="stat-value${textValue ? ' stat-value--text' : ''}">${value}</span>
            <span class="stat-sub">${sub || '&nbsp;'}</span>
        </${tag}>`;
}

/** Zahl mit kleiner Einheit, z. B. 92.4 °C */
export function valueWithUnit(number, unit) {
    return `${esc(number)}<span class="unit">${esc(unit)}</span>`;
}

export function skeletonStats(count = 5) {
    return `<div class="stats-grid">${'<div class="skeleton skeleton-stat"></div>'.repeat(count)}</div>`;
}

export function errorCard(message, { title = 'Daten konnten nicht geladen werden' } = {}) {
    return `
        <div class="card error-card" role="alert">
            <span class="error-icon">${icons.alert({ size: 24 })}</span>
            <h3>${esc(title)}</h3>
            <p>${esc(message)}</p>
            <button type="button" class="btn" data-action="retry">${icons.refresh({ size: 16 })} Erneut versuchen</button>
        </div>`;
}

let toastTimer = null;

/** Kurze Meldung unten am Bildschirm. */
export function toast(message, { type = 'info', duration = 5000 } = {}) {
    const region = document.getElementById('toasts');
    if (!region) {
        return;
    }
    region.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = html(`
        <div class="toast toast--${type}">
            ${type === 'error' ? icons.alert({ size: 18 }) : icons.sparkle({ size: 18 })}
            <span>${esc(message)}</span>
        </div>`);
    region.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.add('is-leaving');
        el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
}

/** Ist die Seite für Touch-Bedienung (ohne Maus) gedacht? */
export function isTouch() {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
