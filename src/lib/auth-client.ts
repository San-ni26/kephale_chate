import { AES, enc } from 'crypto-js';

/**
 * Client-side authentication utilities
 */

const TOKEN_KEY = 'auth-token';
const USER_KEY = 'auth-user';
const STORAGE_ENCRYPTION_KEY = process.env.NEXT_PUBLIC_STORAGE_KEY || 'kephale-secure-storage-key-v1';

const encryptData = (data: string): string => {
    try {
        return AES.encrypt(data, STORAGE_ENCRYPTION_KEY).toString();
    } catch (e) {
        console.error("Encryption error", e);
        return data;
    }
};

const decryptData = (ciphertext: string): string | null => {
    try {
        const bytes = AES.decrypt(ciphertext, STORAGE_ENCRYPTION_KEY);
        const originalText = bytes.toString(enc.Utf8);
        return originalText || null;
    } catch (e) {
        // Fallback for backward compatibility or error: return null or ignore
        return null;
    }
};

export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    phone: string | null;
    role: string;
    publicKey: string;
    encryptedPrivateKey: string;
    canPublishNotifications: boolean;
}

/**
 * Store authentication token and user data
 */
export function setAuth(token: string, user: AuthUser): void {
    if (typeof window === 'undefined') return;

    localStorage.setItem(TOKEN_KEY, encryptData(token));
    localStorage.setItem(USER_KEY, encryptData(JSON.stringify(user)));

    // Also set as cookie for middleware (Cookie must remain plain text usually for server to read?
    // Middleware reads token. If we encrypt token in LocalStorage, that's for client usage.
    // The cookie is sent to server. The server expects a JWT usually.
    // If 'token' is the JWT, we can store it encrypted in LS for safety against XSS reading it easily?
    // But XSS can just read the key if it's in the bundle...
    // Client-side encryption mainly protects against dumping LS. 
    // Cookie `auth-token` is httpOnly? No, accessed via `document.cookie` here.
    // Ideally cookie should be HttpOnly. But here we set it in JS.
    // We will leave cookie 'auth-token' as is because Middleware/Server needs to read it.
    // Unless we update Middleware to decrypt? No, that requires key sharing.
    // The 'token' itself (JWT) is signed.

    document.cookie = `auth-token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Strict`;
}

/**
 * Update stored user data without changing token
 */
export function updateAuthUser(updates: Partial<AuthUser>): void {
    if (typeof window === 'undefined') return;

    const currentUser = getUser();
    if (!currentUser) return;

    const updatedUser = { ...currentUser, ...updates };
    localStorage.setItem(USER_KEY, encryptData(JSON.stringify(updatedUser)));
}

/**
 * Get stored authentication token
 */
export function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    const encrypted = localStorage.getItem(TOKEN_KEY);
    if (!encrypted) return null;

    const decrypted = decryptData(encrypted);
    // If decryption fails (e.g. old plain token), try to return as is?
    // Existing tokens are JWTs (ey...).
    // AES ciphertext is Base64 (U2F...).
    // If decryption returns null, it might be old token.
    if (!decrypted) {
        // Validation: JWT starts with ey...
        if (encrypted.startsWith('ey')) return encrypted;
        // Else invalid
        return null;
    }
    return decrypted;
}

/**
 * Get stored user data
 */
export function getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;

    const encryptedUser = localStorage.getItem(USER_KEY);
    if (!encryptedUser) return null;

    let userStr = decryptData(encryptedUser);

    // Backward compatibility: if decryption failed, it might be plain JSON
    if (!userStr) {
        if (encryptedUser.startsWith('{')) {
            userStr = encryptedUser;
        } else {
            return null;
        }
    }

    try {
        return JSON.parse(userStr);
    } catch {
        return null;
    }
}

/**
 * Clear authentication data (logout)
 */
export function clearAuth(): void {
    if (typeof window === 'undefined') return;

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    // Clear cookie
    document.cookie = 'auth-token=; path=/; max-age=0';
}

const LOGIN_PATH = '/login';

/** Routes qui nécessitent auth (si pas de token/user au refresh => clear tout et redirect login) */
const PROTECTED_PATH_PREFIXES = ['/chat', '/admin'];

/**
 * Vérifie si la page courante est une route protégée (nécessite auth).
 */
export function isProtectedPath(pathname: string): boolean {
    return PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

/**
 * Nettoie tout (auth, localStorage, sessionStorage, caches, service workers)
 * puis redirige vers la page de connexion.
 * À utiliser : au rafraîchissement sans auth sur une route protégée, ou à la déconnexion.
 */
export function clearAuthAndAllCacheRedirectToLogin(): void {
    if (typeof window === 'undefined') return;

    // 1. Auth
    clearAuth();

    // 2. Tout le stockage local/session pour éviter données résiduelles
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch {}

    // 3. Cache API (cache du SW, etc.)
    if ('caches' in window && typeof caches.keys === 'function') {
        caches.keys().then((names) => {
            names.forEach((name) => caches.delete(name).catch(() => {}));
        }).catch(() => {});
    }

    // 4. Désenregistrer tous les service workers
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((reg) => reg.unregister().catch(() => {}));
        }).catch(() => {});
    }

    // 5. Redirection immédiate (full load pour repartir à zéro)
    window.location.href = LOGIN_PATH;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
    return getToken() !== null;
}

/**
 * Get authorization header for API requests
 */
export function getAuthHeader(): Record<string, string> {
    const token = getToken();
    if (!token) return {};

    return {
        'Authorization': `Bearer ${token}`,
    };
}

/**
 * Make authenticated API request
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
        ...options.headers,
        ...getAuthHeader(),
    };

    return fetch(url, {
        ...options,
        headers,
    });
}
