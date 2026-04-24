import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
export { encodeBase64, decodeBase64 };

// --- Types ---
export interface KeyPair {
    publicKey: string;
    privateKey: string;
}

export interface EncryptedMessage {
    nonce: string;
    message: string; // Base64 encoded encrypted string
}

// --- Key Management ---

/**
 * Generates a new random Asymmetric Key Pair (Curve25519)
 */
export const generateKeyPair = (): KeyPair => {
    const keyPair = nacl.box.keyPair();
    return {
        publicKey: encodeBase64(keyPair.publicKey),
        privateKey: encodeBase64(keyPair.secretKey),
    };
};

// --- Encryption / Decryption ---

/**
 * Encrypts a message for a receiver.
 * Needs: Sender's Private Key, Receiver's Public Key
 */
export const encryptMessage = (
    plainText: string,
    myPrivateKey: string,
    theirPublicKey: string
): string => {
    const privKeyUint = decodeBase64(myPrivateKey);
    const pubKeyUint = decodeBase64(theirPublicKey);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const msgUint = new TextEncoder().encode(plainText);

    const encrypted = nacl.box(msgUint, nonce, pubKeyUint, privKeyUint);

    const fullMessage = new Uint8Array(nonce.length + encrypted.length);
    fullMessage.set(nonce);
    fullMessage.set(encrypted, nonce.length);

    return encodeBase64(fullMessage);
};

/**
 * Decrypts a message from a sender.
 * Needs: My Private Key, Sender's Public Key
 */
export const decryptMessage = (
    encryptedStr: string,
    myPrivateKey: string,
    theirPublicKey: string
): string | null => {
    try {
        // Vérifier que le message n'est pas vide
        if (!encryptedStr || encryptedStr.trim() === '') {
            return null;
        }

        const fullMessage = decodeBase64(encryptedStr);
        
        // Vérifier que le message a une taille suffisante pour contenir un nonce
        if (fullMessage.length < nacl.box.nonceLength) {
            console.warn('Message trop court pour contenir un nonce');
            return null;
        }
        
        const nonce = fullMessage.slice(0, nacl.box.nonceLength);
        const internalMessage = fullMessage.slice(nacl.box.nonceLength, fullMessage.length);

        const privKeyUint = decodeBase64(myPrivateKey);
        const pubKeyUint = decodeBase64(theirPublicKey);

        const decrypted = nacl.box.open(internalMessage, nonce, pubKeyUint, privKeyUint);

        if (!decrypted) return null;
        return new TextDecoder().decode(decrypted);
    } catch (err) {
        console.error('Decryption failed:', err);
        return null;
    }
};

// --- Symmetric Encryption (for safeguarding the Private Key) ---
// We use simple AES-GCM via Web Crypto API or just stick to NaCl secretbox checking password?
// For portability, let's use NaCl secretbox with a key derived from the password.

import { AES, enc } from 'crypto-js';

// --- Dérivation de clé robuste (PBKDF2 + AES-256-GCM via WebCrypto) ---
// Format du payload chiffré (v2) : "v2:<sel_b64>:<iv_b64>:<cipher_b64>"
// Format legacy (v1) : chaîne crypto-js (U2FsdGVk...)

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = 'SHA-256';
const KEY_LENGTH = 256; // bits

/**
 * Dérive une clé AES-256 depuis le mot de passe avec PBKDF2 (WebCrypto).
 * Utilise un sel aléatoire pour résister aux attaques par dictionnaire.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: PBKDF2_HASH,
        },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Chiffre la clé privée avec le mot de passe (PBKDF2 + AES-256-GCM).
 * Format de sortie : "v2:<sel_b64>:<iv_b64>:<cipher_b64>"
 */
export async function encryptPrivateKeyAsync(privateKey: string, password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);

    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(privateKey)
    );

    const saltB64 = encodeBase64(salt);
    const ivB64 = encodeBase64(iv);
    const cipherB64 = encodeBase64(new Uint8Array(encrypted));
    return `v2:${saltB64}:${ivB64}:${cipherB64}`;
}

/**
 * Déchiffre la clé privée.
 * Supporte le format v2 (PBKDF2 + AES-GCM) ET le format v1 legacy (crypto-js).
 */
export async function decryptPrivateKeyAsync(encryptedKey: string, password: string): Promise<string> {
    // Format v2 : PBKDF2 + AES-GCM
    if (encryptedKey.startsWith('v2:')) {
        const parts = encryptedKey.split(':');
        if (parts.length !== 4) throw new Error('Format de clé invalide');
        const [, saltB64, ivB64, cipherB64] = parts;
        const salt = decodeBase64(saltB64);
        const iv = decodeBase64(ivB64);
        const cipherData = decodeBase64(cipherB64);

        const key = await deriveKey(password, salt);
        try {
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
                key,
                cipherData.buffer as ArrayBuffer
            );
            return new TextDecoder().decode(decrypted);
        } catch {
            throw new Error('Mot de passe incorrect ou clé corrompue.');
        }
    }

    // Format v1 legacy (crypto-js) — rétrocompatibilité
    try {
        const bytes = AES.decrypt(encryptedKey, password);
        const decrypted = bytes.toString(enc.Utf8);
        if (!decrypted) throw new Error('Incorrect Password');
        return decrypted;
    } catch {
        throw new Error('Mot de passe incorrect ou clé corrompue.');
    }
}

/**
 * Version synchrone legacy — conservée pour la compatibilité inscription.
 * @deprecated Utiliser encryptPrivateKeyAsync à la place
 */
export const encryptPrivateKey = (privateKey: string, password: string): string => {
    // Garde pour le register côté serveur (Node.js, pas WebCrypto disponible dans ce contexte)
    return AES.encrypt(privateKey, password).toString();
};

/**
 * Version synchrone legacy — conservée pour rétrocompatibilité.
 * @deprecated Utiliser decryptPrivateKeyAsync à la place
 */
export const decryptPrivateKey = (encryptedKey: string, password: string): string => {
    try {
        const bytes = AES.decrypt(encryptedKey, password);
        const decrypted = bytes.toString(enc.Utf8);
        if (!decrypted) throw new Error('Incorrect Password');
        return decrypted;
    } catch {
        throw new Error('Decryption failed. Incorrect password or data.');
    }
};

// --- File Handling ---

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            resolve(reader.result as string);
        };
        reader.onerror = error => reject(error);
    });
};

/**
 * Encrypt file data using two public keys (sender + receiver)
 * Returns Base32 encoded encrypted data
 */
export const encryptFileData = (
    fileData: Uint8Array,
    myPrivateKey: string,
    theirPublicKey: string
): string => {
    const privKeyUint = decodeBase64(myPrivateKey);
    const pubKeyUint = decodeBase64(theirPublicKey);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

    const encrypted = nacl.box(fileData, nonce, pubKeyUint, privKeyUint);

    const fullMessage = new Uint8Array(nonce.length + encrypted.length);
    fullMessage.set(nonce);
    fullMessage.set(encrypted, nonce.length);

    return encodeBase64(fullMessage);
};

/**
 * Decrypt file data
 * Returns decrypted Uint8Array
 */
export const decryptFileData = (
    encryptedStr: string,
    myPrivateKey: string,
    theirPublicKey: string
): Uint8Array | null => {
    try {
        const fullMessage = decodeBase64(encryptedStr);
        const nonce = fullMessage.slice(0, nacl.box.nonceLength);
        const internalMessage = fullMessage.slice(nacl.box.nonceLength, fullMessage.length);

        const privKeyUint = decodeBase64(myPrivateKey);
        const pubKeyUint = decodeBase64(theirPublicKey);

        const decrypted = nacl.box.open(internalMessage, nonce, pubKeyUint, privKeyUint);

        return decrypted;
    } catch (err) {
        console.error('File decryption failed:', err);
        return null;
    }
};

/**
 * Encrypt file for group/department using symmetric key
 */
export const encryptFileWithSymmetricKey = (
    fileData: Uint8Array,
    symmetricKey: string
): string => {
    const keyUint = decodeBase64(symmetricKey);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

    const encrypted = nacl.secretbox(fileData, nonce, keyUint);

    const fullMessage = new Uint8Array(nonce.length + encrypted.length);
    fullMessage.set(nonce);
    fullMessage.set(encrypted, nonce.length);

    return encodeBase64(fullMessage);
};

/**
 * Decrypt file with symmetric key
 */
export const decryptFileWithSymmetricKey = (
    encryptedStr: string,
    symmetricKey: string
): Uint8Array | null => {
    try {
        const fullMessage = decodeBase64(encryptedStr);
        const nonce = fullMessage.slice(0, nacl.secretbox.nonceLength);
        const internalMessage = fullMessage.slice(nacl.secretbox.nonceLength, fullMessage.length);

        const keyUint = decodeBase64(symmetricKey);

        const decrypted = nacl.secretbox.open(internalMessage, nonce, keyUint);

        return decrypted;
    } catch (err) {
        console.error('Symmetric file decryption failed:', err);
        return null;
    }
};

/**
 * Generate symmetric key for groups/departments
 */
export const generateSymmetricKey = (): string => {
    const key = nacl.randomBytes(nacl.secretbox.keyLength);
    return encodeBase64(key);
};

// --- Binary File Encryption (for efficient storage) ---

/**
 * Encrypt file data using two public keys (sender + receiver)
 * Returns binary encrypted data (Uint8Array) for direct file storage
 */
export const encryptFileDataBinary = (
    fileData: Uint8Array,
    myPrivateKey: string,
    theirPublicKey: string
): Uint8Array => {
    const privKeyUint = decodeBase64(myPrivateKey);
    const pubKeyUint = decodeBase64(theirPublicKey);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

    const encrypted = nacl.box(fileData, nonce, pubKeyUint, privKeyUint);

    const fullMessage = new Uint8Array(nonce.length + encrypted.length);
    fullMessage.set(nonce);
    fullMessage.set(encrypted, nonce.length);

    return fullMessage;
};

/**
 * Decrypt binary file data
 * Returns decrypted Uint8Array
 */
export const decryptFileDataBinary = (
    encryptedData: Uint8Array,
    myPrivateKey: string,
    theirPublicKey: string
): Uint8Array | null => {
    try {
        const nonce = encryptedData.slice(0, nacl.box.nonceLength);
        const internalMessage = encryptedData.slice(nacl.box.nonceLength, encryptedData.length);

        const privKeyUint = decodeBase64(myPrivateKey);
        const pubKeyUint = decodeBase64(theirPublicKey);

        const decrypted = nacl.box.open(internalMessage, nonce, pubKeyUint, privKeyUint);

        return decrypted;
    } catch (err) {
        console.error('Binary file decryption failed:', err);
        return null;
    }
};

/**
 * Encrypt file for group/department using symmetric key
 * Returns binary encrypted data (Uint8Array)
 */
export const encryptFileWithSymmetricKeyBinary = (
    fileData: Uint8Array,
    symmetricKey: string
): Uint8Array => {
    const keyUint = decodeBase64(symmetricKey);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

    const encrypted = nacl.secretbox(fileData, nonce, keyUint);

    const fullMessage = new Uint8Array(nonce.length + encrypted.length);
    fullMessage.set(nonce);
    fullMessage.set(encrypted, nonce.length);

    return fullMessage;
};

/**
 * Decrypt file with symmetric key from binary data
 * Returns decrypted Uint8Array
 */
export const decryptFileWithSymmetricKeyBinary = (
    encryptedData: Uint8Array,
    symmetricKey: string
): Uint8Array | null => {
    try {
        const nonce = encryptedData.slice(0, nacl.secretbox.nonceLength);
        const internalMessage = encryptedData.slice(nacl.secretbox.nonceLength, encryptedData.length);

        const keyUint = decodeBase64(symmetricKey);

        const decrypted = nacl.secretbox.open(internalMessage, nonce, keyUint);

        return decrypted;
    } catch (err) {
        console.error('Symmetric binary file decryption failed:', err);
        return null;
    }
};

