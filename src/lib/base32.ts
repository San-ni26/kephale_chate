/**
 * Base32 Encoding/Decoding Utilities
 * Used for converting files to Base32 format before encryption
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode ArrayBuffer to Base32 string
 */
export function encodeBase32(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
        bits += 8;

        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    // Add padding
    while (output.length % 8 !== 0) {
        output += '=';
    }

    return output;
}

/**
 * Decode Base32 string to ArrayBuffer
 */
export function decodeBase32(base32: string): ArrayBuffer {
    // Remove padding
    base32 = base32.replace(/=/g, '');

    let bits = 0;
    let value = 0;
    let index = 0;
    const output = new Uint8Array(Math.ceil((base32.length * 5) / 8));

    for (let i = 0; i < base32.length; i++) {
        const char = base32[i].toUpperCase();
        const charValue = BASE32_ALPHABET.indexOf(char);

        if (charValue === -1) {
            throw new Error(`Invalid Base32 character: ${char}`);
        }

        value = (value << 5) | charValue;
        bits += 5;

        if (bits >= 8) {
            output[index++] = (value >>> (bits - 8)) & 255;
            bits -= 8;
        }
    }

    return output.buffer;
}

/**
 * Encode File to Base32 string
 */
export async function fileToBase32(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result instanceof ArrayBuffer) {
                resolve(encodeBase32(reader.result));
            } else {
                reject(new Error('Failed to read file as ArrayBuffer'));
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Decode Base32 string to Blob
 */
export function base32ToBlob(base32: string, mimeType: string): Blob {
    const buffer = decodeBase32(base32);
    return new Blob([buffer], { type: mimeType });
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
}
