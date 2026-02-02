/**
 * Client-side authentication utilities
 */

const TOKEN_KEY = 'auth-token';
const USER_KEY = 'auth-user';

export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
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

    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    // Also set as cookie for middleware
    document.cookie = `auth-token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Strict`;
}

/**
 * Get stored authentication token
 */
export function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get stored user data
 */
export function getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;

    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;

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
