/**
 * File encryption utilities for handling images, PDFs, Word documents, and audio
 * Uses NaCl encryption with binary data storage
 */

import { encryptFileDataBinary, decryptFileDataBinary, encryptFileWithSymmetricKeyBinary, decryptFileWithSymmetricKeyBinary } from './crypto';
import { getMimeType } from './base32';

export interface EncryptedFile {
    filename: string;
    type: 'IMAGE' | 'PDF' | 'WORD' | 'AUDIO';
    encryptedData: Uint8Array; // Binary encrypted data
    mimeType: string;
}

/**
 * Encrypt a file for direct messaging (1-to-1)
 */
export async function encryptFile(
    file: File,
    myPrivateKey: string,
    theirPublicKey: string
): Promise<EncryptedFile> {
    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);

    // Encrypt the file data (returns binary)
    const encryptedData = encryptFileDataBinary(fileData, myPrivateKey, theirPublicKey);

    // Determine file type
    const type = getFileType(file.name);

    return {
        filename: file.name,
        type,
        encryptedData,
        mimeType: file.type,
    };
}

/**
 * Decrypt a file for direct messaging
 */
export function decryptFile(
    encryptedFile: EncryptedFile,
    myPrivateKey: string,
    theirPublicKey: string
): Blob | null {
    const decryptedData = decryptFileDataBinary(
        encryptedFile.encryptedData,
        myPrivateKey,
        theirPublicKey
    );

    if (!decryptedData) return null;

    return new Blob([decryptedData.buffer as ArrayBuffer], { type: encryptedFile.mimeType });
}

/**
 * Encrypt file for group/department using symmetric key
 */
export async function encryptFileForGroup(
    file: File,
    groupKey: string
): Promise<EncryptedFile> {
    const arrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);

    const encryptedData = encryptFileWithSymmetricKeyBinary(fileData, groupKey);

    const type = getFileType(file.name);

    return {
        filename: file.name,
        type,
        encryptedData,
        mimeType: file.type,
    };
}

/**
 * Decrypt file from group/department
 */
export function decryptFileFromGroup(
    encryptedFile: EncryptedFile,
    groupKey: string
): Blob | null {
    const decryptedData = decryptFileWithSymmetricKeyBinary(
        encryptedFile.encryptedData,
        groupKey
    );

    if (!decryptedData) return null;

    return new Blob([decryptedData.buffer as ArrayBuffer], { type: encryptedFile.mimeType });
}

/**
 * Determine file type from filename
 */
function getFileType(filename: string): 'IMAGE' | 'PDF' | 'WORD' | 'AUDIO' {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
        return 'IMAGE';
    }

    if (ext === 'pdf') {
        return 'PDF';
    }

    if (['doc', 'docx'].includes(ext || '')) {
        return 'WORD';
    }

    if (['webm', 'mp3', 'ogg', 'm4a', 'wav'].includes(ext || '')) {
        return 'AUDIO';
    }

    return 'PDF'; // Default
}

/**
 * Download decrypted file
 */
export function downloadFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Check if file type is allowed
 */
export function isFileTypeAllowed(file: File): boolean {
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'webm', 'mp3', 'ogg', 'm4a', 'wav'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    return allowedExtensions.includes(ext || '');
}

/**
 * Check if file size is within limit (10MB)
 */
export function isFileSizeAllowed(file: File, maxSizeMB: number = 10): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
}

// Re-export getMimeType for convenience
export { getMimeType } from './base32';
