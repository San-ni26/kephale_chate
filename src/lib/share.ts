/**
 * Wrapper pour la Web Share API
 * Permet de partager du contenu nativement sur mobile
 */

export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

/**
 * Vérifie si la Web Share API est supportée
 */
export function isShareSupported(): boolean {
  return typeof navigator !== 'undefined' && 'share' in navigator;
}

/**
 * Vérifie si le partage de fichiers est supporté
 */
export function isFileShareSupported(): boolean {
  return isShareSupported() && 
    'canShare' in navigator && 
    typeof navigator.canShare === 'function';
}

/**
 * Partage du contenu via l'API native
 * @returns true si le partage a réussi, false sinon
 */
export async function shareContent(data: ShareData): Promise<boolean> {
  if (!isShareSupported()) {
    console.warn('Web Share API not supported');
    return false;
  }

  try {
    // Vérifier si on peut partager les fichiers
    if (data.files && data.files.length > 0) {
      if (!isFileShareSupported()) {
        console.warn('File sharing not supported');
        // Fallback: partager sans les fichiers
        const { files, ...dataWithoutFiles } = data;
        await navigator.share(dataWithoutFiles);
        return true;
      }

      // Vérifier si les fichiers spécifiques peuvent être partagés
      if (navigator.canShare && !navigator.canShare(data)) {
        console.warn('Cannot share these files');
        const { files, ...dataWithoutFiles } = data;
        await navigator.share(dataWithoutFiles);
        return true;
      }
    }

    await navigator.share(data);
    return true;
  } catch (error) {
    // L'utilisateur a annulé ou erreur
    if ((error as Error).name === 'AbortError') {
      return false;
    }
    console.error('Share failed:', error);
    return false;
  }
}

/**
 * Partage un message texte
 */
export async function shareText(text: string, title?: string): Promise<boolean> {
  return shareContent({ title, text });
}

/**
 * Partage une URL
 */
export async function shareUrl(url: string, title?: string, text?: string): Promise<boolean> {
  return shareContent({ title, text, url });
}

/**
 * Partage un fichier
 */
export async function shareFile(file: File, title?: string): Promise<boolean> {
  return shareContent({ title, files: [file] });
}

/**
 * Partage plusieurs fichiers
 */
export async function shareFiles(files: File[], title?: string): Promise<boolean> {
  return shareContent({ title, files });
}

/**
 * Copie du texte dans le presse-papiers (fallback pour desktop)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Copy failed:', error);
    return false;
  }
}

/**
 * Télécharge un fichier (fallback pour le partage)
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Hook React pour le partage
 */
export function useShare() {
  return {
    isSupported: isShareSupported(),
    isFileSupported: isFileShareSupported(),
    share: shareContent,
    shareText,
    shareUrl,
    shareFile,
    shareFiles,
    copyToClipboard,
    downloadFile,
  };
}
