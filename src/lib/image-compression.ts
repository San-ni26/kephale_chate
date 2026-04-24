/**
 * Compression et optimisation des images côté client
 * Utilise browser-image-compression
 */

import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  maxSizeMB?: number;           // Taille max en MB
  maxWidthOrHeight?: number;    // Dimension max
  useWebWorker?: boolean;       // Utiliser Web Worker
  fileType?: string;            // Type de sortie
  initialQuality?: number;      // Qualité initiale (0-1)
}

// Options par défaut optimisées pour le chat
const DEFAULT_OPTIONS: CompressionOptions = {
  maxSizeMB: 2,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/webp',
  initialQuality: 0.8,
};

// Options pour les miniatures
const THUMBNAIL_OPTIONS: CompressionOptions = {
  maxSizeMB: 0.1,
  maxWidthOrHeight: 300,
  useWebWorker: true,
  fileType: 'image/webp',
  initialQuality: 0.6,
};

/**
 * Compresse une image
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  
  // Ne pas compresser si le fichier est déjà petit
  if (file.size < 100 * 1024 && !options.maxWidthOrHeight) {
    return file;
  }

  try {
    const compressedFile = await imageCompression(file, {
      maxSizeMB: mergedOptions.maxSizeMB,
      maxWidthOrHeight: mergedOptions.maxWidthOrHeight,
      useWebWorker: mergedOptions.useWebWorker,
      fileType: mergedOptions.fileType,
      initialQuality: mergedOptions.initialQuality,
      preserveExif: false, // Retirer les métadonnées pour réduire la taille
    });

    // Créer un nouveau fichier avec le bon nom et type
    return new File(
      [compressedFile],
      getCompressedFilename(file.name),
      { type: mergedOptions.fileType || file.type }
    );
  } catch (error) {
    console.error('Image compression failed:', error);
    // Retourner le fichier original en cas d'erreur
    return file;
  }
}

/**
 * Crée une miniature d'image
 */
export async function createThumbnail(file: File): Promise<File> {
  return compressImage(file, THUMBNAIL_OPTIONS);
}

/**
 * Génère un nom de fichier compressé
 */
function getCompressedFilename(originalName: string): string {
  const ext = originalName.split('.').pop() || 'webp';
  const name = originalName.replace(/\.[^/.]+$/, '');
  return `${name}_compressed.${ext}`;
}

/**
 * Vérifie si un fichier est une image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Vérifie si une image nécessite une compression
 */
export function needsCompression(file: File, maxSizeMB: number = 2): boolean {
  if (!isImageFile(file)) return false;
  return file.size > maxSizeMB * 1024 * 1024;
}

/**
 * Obtient les dimensions d'une image
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Convertit une image en base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compresse plusieurs images en parallèle
 */
export async function compressImages(
  files: File[],
  options?: CompressionOptions,
  onProgress?: (index: number, total: number) => void
): Promise<File[]> {
  const results: File[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    if (!isImageFile(file)) {
      results.push(file);
      continue;
    }
    
    onProgress?.(i, files.length);
    
    const compressed = needsCompression(file, options?.maxSizeMB || 2)
      ? await compressImage(file, options)
      : file;
    
    results.push(compressed);
  }
  
  onProgress?.(files.length, files.length);
  return results;
}

/**
 * Hook React pour la compression
 */
export function useImageCompression() {
  return {
    compress: compressImage,
    compressMultiple: compressImages,
    createThumbnail,
    isImageFile,
    needsCompression,
    getDimensions: getImageDimensions,
    toBase64: fileToBase64,
  };
}
