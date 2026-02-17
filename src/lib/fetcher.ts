import type { BareFetcher } from "swr";
import { fetchWithAuth } from "@/src/lib/auth-client";

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

export const fetcher: BareFetcher<any> = async (url) => {
    const res = await fetchWithAuth(url);
    const data = await safeJsonParse(res);
    if (!res.ok) {
        const error = new Error('An error occurred while fetching the data.');
        (error as Error & { info?: unknown; status?: number }).info = data;
        (error as Error & { info?: unknown; status?: number }).status = res.status;
        throw error;
    }
    return data;
};
