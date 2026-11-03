/**
 * Inline-SVG-Icons (24 × 24, Strichstärke einheitlich, Farbe = currentColor).
 */

const svg = (body, { size = 20, stroke = 1.8, cls = '' } = {}) =>
    `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
    arrowRight: (o) => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', o),
    chevronLeft: (o) => svg('<path d="m15 18-6-6 6-6"/>', o),
    chevronRight: (o) => svg('<path d="m9 18 6-6-6-6"/>', o),
    flame: (o) => svg('<path d="M12 3c.4 3.2-1.2 4.9-2.8 6.6C7.5 11.4 6 13.1 6 15.9A6 6 0 0 0 12 21.9a6 6 0 0 0 6-6c0-2.6-1.2-4.3-2.3-5.7.1 1.6-.5 2.8-1.5 3.4.4-3.6-.3-7.9-2.2-10.6Z"/>', o),
    thermometer: (o) => svg('<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 17.5v-6"/>', o),
    up: (o) => svg('<path d="M12 19V5M6 11l6-6 6 6"/>', o),
    down: (o) => svg('<path d="M12 5v14M6 13l6 6 6-6"/>', o),
    average: (o) => svg('<path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>', o),
    timer: (o) => svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>', o),
    layers: (o) => svg('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>', o),
    calendar: (o) => svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>', o),
    trophy: (o) => svg('<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4l.5 3.5h-5L10 17Z"/>', o),
    hourglass: (o) => svg('<path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 9 5 9 9s-9 4-9 9M16.5 3c0 5-9 5-9 9s9 4 9 9"/>', o),
    zoom: (o) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>', o),
    expand: (o) => svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', o),
    sun: (o) => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>', o),
    moon: (o) => svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>', o),
    system: (o) => svg('<rect x="3" y="4" width="18" height="12.5" rx="2.5"/><path d="M8.5 20.5h7M12 16.5v4"/>', o),
    alert: (o) => svg('<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.5v.01"/>', o),
    offline: (o) => svg('<path d="M2 8.5a15 15 0 0 1 4.2-2.7M9.5 5.1A15 15 0 0 1 22 8.5M5.5 12.2a10 10 0 0 1 3.4-2M13.8 10a10 10 0 0 1 4.7 2.2M9 15.8a5 5 0 0 1 6 0M12 19.5v.01M3 3l18 18"/>', o),
    refresh: (o) => svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>', o),
    clock: (o) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', o),
    sparkle: (o) => svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>', o),
};

/** Illustration für leere Tage: Saunakübel mit Kelle, ohne Dampf. */
export const emptyIllustration = `
<svg class="empty-illustration" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="ei-wood" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="currentColor" stop-opacity=".28"/>
      <stop offset="1" stop-color="currentColor" stop-opacity=".14"/>
    </linearGradient>
  </defs>
  <ellipse cx="80" cy="138" rx="54" ry="7" fill="currentColor" opacity=".08"/>
  <path d="M38 66h84l-8 66a6 6 0 0 1-6 5H52a6 6 0 0 1-6-5l-8-66Z" fill="url(#ei-wood)" stroke="currentColor" stroke-opacity=".5" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M41 88h78M44 112h72" stroke="currentColor" stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/>
  <path d="M60 67v68M80 67v70M100 67v68" stroke="currentColor" stroke-opacity=".14" stroke-width="2"/>
  <ellipse cx="80" cy="66" rx="42" ry="6" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-opacity=".5" stroke-width="2.5"/>
  <path d="M96 62 132 22" stroke="currentColor" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>
  <path d="M88 70a9 6 0 1 0 14-8" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-opacity=".55" stroke-width="2.5"/>
  <path d="M58 46c-4-6 4-10 0-16M76 42c-4-6 4-10 0-16" stroke="currentColor" stroke-opacity=".18" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="2 6"/>
</svg>`;
