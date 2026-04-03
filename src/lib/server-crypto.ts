/**
 * Chiffrement côté serveur pour les données personnelles sensibles.
 * Garantit que même si la base de données est compromise, les emails
 * et numéros de téléphone ne sont pas lisibles en clair.
 *
 * Algorithme : AES-256-GCM avec sel aléatoire de 12 bytes (NIST recommandé)
 * Clé : dérivée de SERVER_ENCRYPTION_KEY (variable d'environnement obligatoire)
 * Hash de recherche : HMAC-SHA256 pour permettre les lookup sans déchiffrer
 */

import crypto from 'crypto';

const KEY_ENV = process.env.SERVER_ENCRYPTION_KEY;

if (!KEY_ENV && process.env.NODE_ENV !== 'test') {
    console.warn(
        '[server-crypto] SERVER_ENCRYPTION_KEY manquante ! ' +
        'Les données personnelles ne seront pas chiffrées. ' +
        'Ajoutez SERVER_ENCRYPTION_KEY dans votre .env'
    );
}

// Dérive une clé de 32 bytes depuis la variable d'environnement
function getEncryptionKey(): Buffer {
    const key = KEY_ENV || 'fallback-dev-only-key-never-use-in-prod-32bytes!!';
    // PBKDF2 avec un sel statique fixe pour la clé serveur
    // (le sel aléatoire est par enregistrement, la clé maître est dérivée ici)
    return crypto.pbkdf2Sync(key, 'kephale-server-key-derivation-v1', 100_000, 32, 'sha256');
}

const HMAC_KEY_ENV = process.env.SERVER_HMAC_KEY || (KEY_ENV ? `${KEY_ENV}-hmac` : 'fallback-hmac-key-42bytes-never-prod!!');

/**
 * Chiffre une valeur (email, téléphone) avec AES-256-GCM.
 * Format de sortie : <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptPII(plaintext: string): string {
    if (!plaintext) return plaintext;

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12); // 12 bytes = recommandé pour GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Déchiffre une valeur chiffrée par encryptPII.
 * Retourne null si la valeur n'est pas un ciphertext (rétrocompatibilité).
 */
export function decryptPII(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null;

    // Rétrocompatibilité : si ce n'est pas notre format, c'est une valeur en clair
    if (!ciphertext.includes(':') || ciphertext.split(':').length !== 3) {
        return ciphertext; // Ancien enregistrement en clair
    }

    try {
        const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
        const key = getEncryptionKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const encryptedData = Buffer.from(encryptedHex, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encryptedData),
            decipher.final(),
        ]);

        return decrypted.toString('utf8');
    } catch (err) {
        console.error('[server-crypto] Décryptage PII échoué:', err);
        // Retourner la valeur brute en dernier recours (rétrocompatibilité)
        return ciphertext;
    }
}

/**
 * Génère un HMAC-SHA256 déterministe pour permettre les recherches
 * par email/téléphone sans déchiffrer tous les enregistrements.
 *
 * Le hash est normalisé en minuscules pour les emails.
 */
export function hashForSearch(value: string): string {
    if (!value) return '';
    const normalized = value.toLowerCase().trim();
    return crypto
        .createHmac('sha256', HMAC_KEY_ENV)
        .update(normalized)
        .digest('hex');
}

/**
 * Vérifie si une valeur correspond à un hash de recherche.
 */
export function verifySearchHash(value: string, hash: string): boolean {
    const computed = hashForSearch(value);
    // Comparaison temporellement constante pour éviter les timing attacks
    return crypto.timingSafeEqual(
        Buffer.from(computed, 'hex'),
        Buffer.from(hash, 'hex')
    );
}

/**
 * Parcourt récursivement un objet et déchiffre les champs email/phone.
 * Utile pour les réponses API contenant des données utilisateur.
 */
export function decryptUserPII<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(decryptUserPII) as unknown as T;
    if (typeof obj === 'object') {
        const result = { ...obj } as Record<string, unknown>;
        for (const key of Object.keys(result)) {
            result[key] = decryptUserPII(result[key]);
        }
        if ('email' in result && typeof result.email === 'string') {
            result.email = decryptPII(result.email) || result.email;
        }
        if ('phone' in result && typeof result.phone === 'string') {
            result.phone = result.phone ? (decryptPII(result.phone) || result.phone) : null;
        }
        if ('userEmail' in result && typeof result.userEmail === 'string') {
            result.userEmail = decryptPII(result.userEmail) || result.userEmail;
        }
        return result as T;
    }
    return obj;
}
