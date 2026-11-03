/**
 * Zugriff auf die JSON-API mit verständlichen Fehlermeldungen und einem
 * kleinen Zwischenspeicher (vergangene Zeiträume ändern sich nicht mehr).
 */

import { today } from './dates.js';

export class ApiError extends Error {
    constructor(message, status = 0, code = 'error') {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

const cache = new Map();
const inflight = new Map();
const TIMEOUT_MS = 20000;

/** Kurz für laufende Zeiträume, lang für abgeschlossene. */
const TTL_LIVE = 25 * 1000;
const TTL_PAST = 10 * 60 * 1000;

async function request(path, params = {}, { ttl = 0, force = false } = {}) {
    const url = new URL(path, document.baseURI);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const key = url.href;

    if (!force && ttl > 0) {
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < ttl) {
            return hit.data;
        }
    }
    if (inflight.has(key)) {
        return inflight.get(key);
    }

    const promise = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let res;
        try {
            res = await fetch(url, {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
                cache: 'no-store',
                signal: controller.signal,
            });
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new ApiError('Der Server antwortet nicht. Bitte später erneut versuchen.', 0, 'timeout');
            }
            throw new ApiError('Keine Verbindung zum Server. Bitte die Internetverbindung prüfen.', 0, 'network');
        } finally {
            clearTimeout(timer);
        }

        if (res.status === 401) {
            window.location.href = 'login.php';
            throw new ApiError('Bitte zuerst anmelden.', 401, 'unauthorized');
        }

        let data = null;
        try {
            data = await res.json();
        } catch {
            throw new ApiError(
                `Unerwartete Antwort vom Server (HTTP ${res.status}). Ist PHP aktiv und config.php vorhanden?`,
                res.status,
                'bad_response',
            );
        }

        if (!res.ok) {
            throw new ApiError(data?.error?.message || `Fehler beim Laden (HTTP ${res.status}).`, res.status, data?.error?.code);
        }

        cache.set(key, { at: Date.now(), data });
        return data;
    })();

    inflight.set(key, promise);
    try {
        return await promise;
    } finally {
        inflight.delete(key);
    }
}

export const api = {
    current() {
        return request('api/current.php', {}, { force: true });
    },

    range({ force = false } = {}) {
        return request('api/range.php', {}, { ttl: TTL_LIVE, force });
    },

    day(date, { force = false } = {}) {
        const ttl = date < today() ? TTL_PAST : TTL_LIVE;
        return request('api/day.php', { date }, { ttl, force });
    },

    month(month, { force = false } = {}) {
        const ttl = month < today().slice(0, 7) ? TTL_PAST : TTL_LIVE;
        return request('api/month.php', { month }, { ttl, force });
    },

    year(year, { force = false } = {}) {
        const ttl = String(year) < today().slice(0, 4) ? TTL_PAST : TTL_LIVE;
        return request('api/year.php', { year: String(year) }, { ttl, force });
    },
};
