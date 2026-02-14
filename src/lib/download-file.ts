/**
 * Téléchargement et partage de fichiers compatibles iOS et Android.
 * - Télécharger : utilise un Blob + URL pour que le téléchargement fonctionne sur mobile.
 * - Partager : utilise l’API Web Share pour "Enregistrer dans Fichiers" sur iOS / partage sur Android.
 */

export function dataUrlToBlob(dataUrl: string): Blob | null {
    try {
        const [header, base64] = dataUrl.split(',');
        if (!base64) return null;
        const mimeMatch = header.match(/data:([^;]+);/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    } catch {
        return null;
    }
}

export function blobToFile(blob: Blob, filename: string): File {
    return new File([blob], filename, { type: blob.type });
}

/**
 * Déclenche le téléchargement du fichier (Blob URL pour meilleur support mobile).
 */
export function downloadFromDataUrl(dataUrl: string, filename: string): boolean {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return false;
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 200);
        return true;
    } catch {
        return false;
    }
}

/**
 * Retourne true si le partage de fichiers est possible (iOS/Android).
 */
export function canShareFile(): boolean {
    if (typeof navigator === 'undefined' || !navigator.share) return false;
    try {
        const f = new File([''], 'x.pdf', { type: 'application/pdf' });
        return navigator.canShare?.({ files: [f] }) ?? true;
    } catch {
        return true;
    }
}

/**
 * Ouvre la feuille de partage (ex. "Enregistrer dans Fichiers" sur iOS).
 */
export async function shareFileFromDataUrl(dataUrl: string, filename: string): Promise<boolean> {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return false;
    const file = blobToFile(blob, filename);
    if (!navigator.share) return false;
    try {
        const canShare = navigator.canShare?.({ files: [file] }) ?? true;
        if (!canShare) return false;
        await navigator.share({
            files: [file],
            title: filename,
        });
        return true;
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') return true; // user cancelled
        return false;
    }
}
