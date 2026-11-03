/**
 * Umschalter für das Farbschema: System → Hell → Dunkel → System.
 * Die Wahl wird im localStorage gespeichert.
 */

import { icons } from './icons.js';

const KEY = 'sauna-theme';
const ORDER = ['system', 'light', 'dark'];
const LABELS = {
    system: 'Darstellung: wie System',
    light: 'Darstellung: hell',
    dark: 'Darstellung: dunkel',
};

const media = window.matchMedia('(prefers-color-scheme: light)');

function readPref() {
    try {
        const v = localStorage.getItem(KEY);
        return ORDER.includes(v) ? v : 'system';
    } catch {
        return 'system';
    }
}

function writePref(pref) {
    try {
        if (pref === 'system') {
            localStorage.removeItem(KEY);
        } else {
            localStorage.setItem(KEY, pref);
        }
    } catch {
        /* Speichern nicht möglich – Wahl gilt nur für diese Sitzung */
    }
}

function resolve(pref) {
    return pref === 'system' ? (media.matches ? 'light' : 'dark') : pref;
}

export function initTheme(button, onChange) {
    let pref = readPref();

    const apply = (notify) => {
        const resolved = resolve(pref);
        const root = document.documentElement;
        const changed = root.getAttribute('data-theme') !== resolved;
        root.setAttribute('data-theme', resolved);
        root.setAttribute('data-theme-pref', pref);
        document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
            m.setAttribute('content', resolved === 'light' ? '#f6f0e9' : '#141110');
        });
        if (button) {
            const icon = pref === 'system' ? icons.system() : pref === 'light' ? icons.sun() : icons.moon();
            button.innerHTML = icon;
            button.setAttribute('aria-label', `${LABELS[pref]} – klicken zum Wechseln`);
            button.title = LABELS[pref];
        }
        if (notify && changed) {
            onChange?.(resolved);
        }
    };

    button?.addEventListener('click', () => {
        pref = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
        writePref(pref);
        apply(true);
    });

    media.addEventListener('change', () => {
        if (pref === 'system') {
            apply(true);
        }
    });

    apply(false);
}
