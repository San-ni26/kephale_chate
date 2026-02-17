import type { BareFetcher } from "swr";
import { fetchWithAuth } from "@/src/lib/auth-client";

/** Erreur levée quand l'utilisateur est hors ligne */
export class OfflineError extends Error {
    constructor(message = 'Hors ligne') {
        super(message);
        this.name = 'OfflineError';
    }
}

async function safeJsonParse(res: Response): Promise<unknown> {
    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return { error: text.slice(0, 100) || res.statusText };
    }
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return { error: 'Invalid JSON response' };
    }
}

const FETCH_TIMEOUT_MS = 15000;

export const fetcher: BareFetcher<any> = async (url) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new OfflineError();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetchWithAuth(url, { signal: controller.signal });
        const data = await safeJsonParse(res);
        if (!res.ok) {
            const error = new Error('An error occurred while fetching the data.');
            (error as Error & { info?: unknown; status?: number }).info = data;
            (error as Error & { info?: unknown; status?: number }).status = res.status;
            throw error;
        }
        return data;
    } finally {
        clearTimeout(timeoutId);
    }
};
