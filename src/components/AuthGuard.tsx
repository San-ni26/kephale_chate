'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getToken, getUser, isProtectedPath, clearAuthAndAllCacheRedirectToLogin } from '@/src/lib/auth-client';

/**
 * Au rafraîchissement, si on est sur une route protégée (/chat, /admin)
 * et qu'il n'y a ni auth-token ni auth-user, on nettoie tout (cache, SW, stockage)
 * et on redirige vers /login.
 * 
 * EXCEPTIONS : Les routes publiques suivantes ne nécessitent pas d'authentification :
 * - /chat/jobs/[jobId] (détail d'une offre d'emploi)
 */
export function AuthGuard() {
    const pathname = usePathname();

    useEffect(() => {
        if (typeof window === 'undefined' || !pathname) return;
        
        // Vérifier si c'est une route publique (exclure de la protection)
        // Matcher /chat/jobs/[jobId] mais pas /chat/jobs/my-applications
        const isPublicJobPage = pathname.match(/^\/chat\/jobs\/[^\/]+/) !== null 
            && !pathname.includes('/my-applications')
            && pathname.split('/').length <= 4; // /chat/jobs/[id] = 4 segments max
        
        if (isPublicJobPage) {
            console.log('[AuthGuard] Page job publique détectée, pas de redirection');
            return;
        }
        
        if (!isProtectedPath(pathname)) return;

        const token = getToken();
        const user = getUser();
        if (token != null || user != null) return;

        // Route protégée mais pas d'auth au refresh => nettoyage complet et redirect
        console.log('[AuthGuard] Redirection vers login pour pathname:', pathname);
        clearAuthAndAllCacheRedirectToLogin();
    }, [pathname]);

    return null;
}
