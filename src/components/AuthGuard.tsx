'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getToken, getUser, isProtectedPath, clearAuthAndAllCacheRedirectToLogin } from '@/src/lib/auth-client';

/**
 * Au rafraîchissement, si on est sur une route protégée (/chat, /admin)
 * et qu'il n'y a ni auth-token ni auth-user, on nettoie tout (cache, SW, stockage)
 * et on redirige vers /login.
 */
export function AuthGuard() {
    const pathname = usePathname();

    useEffect(() => {
        if (typeof window === 'undefined' || !pathname) return;
        if (!isProtectedPath(pathname)) return;

        const token = getToken();
        const user = getUser();
        if (token != null || user != null) return;

        // Route protégée mais pas d'auth au refresh => nettoyage complet et redirect
        clearAuthAndAllCacheRedirectToLogin();
    }, [pathname]);

    return null;
}
