'use client';

/**
 * File d'attente des messages hors ligne.
 * Stocke les messages en IndexedDB et les envoie au retour en ligne.
 * Compatible avec Background Sync API (SW) pour envoi automatique.
 */

const DB_NAME = 'kephale-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

export interface QueuedMessage {
    id: string;
    url: string;
    method: string;
    body: string;
    tempId: string;
    createdAt: number;
    retryCount: number;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

/** Ajoute un message à la file d'attente */
export async function addToQueue(item: Omit<QueuedMessage, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
    const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const full: QueuedMessage = {
        ...item,
        id,
        createdAt: Date.now(),
        retryCount: 0,
    };
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.add(full);
        req.onsuccess = () => {
            db.close();
            resolve(id);
        };
        req.onerror = () => {
            db.close();
            reject(req.error);
        };
    });
}

/** Récupère tous les messages en attente */
export async function getAllQueued(): Promise<QueuedMessage[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
            db.close();
            resolve(req.result || []);
        };
        req.onerror = () => {
            db.close();
            reject(req.error);
        };
    });
}

/** Supprime un message de la file après envoi réussi */
export async function removeFromQueue(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => {
            db.close();
            resolve();
        };
        req.onerror = () => {
            db.close();
            reject(req.error);
        };
    });
}

/** Incrémente le retry et met à jour (pour éviter boucles infinies) */
export async function incrementRetry(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            const item = getReq.result;
            if (item) {
                item.retryCount = (item.retryCount || 0) + 1;
                store.put(item);
            }
            db.close();
            resolve();
        };
        getReq.onerror = () => {
            db.close();
            reject(getReq.error);
        };
    });
}

const SYNC_TAG = 'kephale-send-messages';

/** Enregistre un sync pour Background Sync API (quand supporté) */
export async function registerBackgroundSync(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    try {
        const reg = await navigator.serviceWorker.ready;
        if ('sync' in reg) {
            await (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(SYNC_TAG);
            return true;
        }
    } catch {
        // Background Sync non supporté (Chrome, Edge, Opera)
    }
    return false;
}

/** Envoie un message avec support hors ligne : tente l'envoi, sinon met en file */
export async function sendWithOfflineQueue(
    url: string,
    options: { method: string; body: string },
    tempId: string,
    fetchFn?: (url: string, opts: RequestInit) => Promise<Response>
): Promise<{ ok: boolean; response?: Response; queued?: boolean }> {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
        await addToQueue({ url, method: options.method, body: options.body, tempId });
        await registerBackgroundSync();
        return { ok: false, queued: true };
    }

    const doFetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return { ok: false, queued: true };

    try {
        const res = await doFetch(url, {
            method: options.method,
            headers: { 'Content-Type': 'application/json' },
            body: options.body,
            credentials: 'include',
        });
        if (res.ok) return { ok: true, response: res };

        // Erreur serveur (4xx, 5xx) : ne pas mettre en file
        return { ok: false, response: res };
    } catch {
        // Erreur réseau : mettre en file
        await addToQueue({ url, method: options.method, body: options.body, tempId });
        await registerBackgroundSync();
        return { ok: false, queued: true };
    }
}

/** Traite la file d'attente (appelé au retour en ligne ou par le SW) */
export async function processQueue(): Promise<{ sent: number; failed: number }> {
    const items = await getAllQueued();
    let sent = 0;
    let failed = 0;

    for (const item of items) {
        if (item.retryCount >= 5) {
            await removeFromQueue(item.id);
            failed++;
            continue;
        }

        try {
            const res = await fetch(item.url, {
                method: item.method,
                headers: { 'Content-Type': 'application/json' },
                body: item.body,
                credentials: 'include',
            });

            if (res.ok) {
                await removeFromQueue(item.id);
                sent++;
            } else {
                await incrementRetry(item.id);
                failed++;
            }
        } catch {
            await incrementRetry(item.id);
            failed++;
        }
    }

    return { sent, failed };
}

/** Vide la file et supprime la base (à appeler au logout) */
export async function clearOfflineQueue(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
        indexedDB.deleteDatabase(DB_NAME);
    } catch {
        // Ignorer
    }
}
