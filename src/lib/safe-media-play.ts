/**
 * Utilitaire pour lecture audio/vidéo sans erreur NotAllowedError dans la console.
 * La politique d'autoplay des navigateurs bloque la lecture sans interaction utilisateur.
 */

function isNotAllowedError(e: unknown): boolean {
    return e instanceof DOMException && e.name === 'NotAllowedError';
}

export function safePlay(element: HTMLMediaElement | null | undefined): void {
    if (!element) return;
    element.play().catch((e: unknown) => {
        // NotAllowedError = politique autoplay : ignorer silencieusement (pas de log)
        if (isNotAllowedError(e)) return;
        if (process.env.NODE_ENV === 'development') {
            console.warn('[Media] play() failed:', e);
        }
    });
}

/** Version async pour await - rejette sauf pour NotAllowedError (ignoré). */
export async function safePlayAsync(element: HTMLMediaElement | null | undefined): Promise<void> {
    if (!element) return;
    try {
        await element.play();
    } catch (e) {
        if (isNotAllowedError(e)) return;
        throw e;
    }
}
