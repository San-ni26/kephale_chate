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
        
        // DEBUG: Log pour voir ce qui se passe
        console.log('[AuthGuard] pathname:', pathname);
        
        // Vérifier si c'est une route publique (exclure de la protection)
        // Matcher /chat/jobs/[jobId] mais pas /chat/jobs/my-applications
        const pathSegments = pathname.split('/').filter(Boolean);
        console.log('[AuthGuard] pathSegments:', pathSegments);
        
        // Détection plus robuste: /chat/jobs/[id] doit avoir exactement 3 segments
        const isPublicJobPage = pathSegments.length === 3 
            && pathSegments[0] === 'chat'
            && pathSegments[1] === 'jobs'
            && pathSegments[2] !== 'my-applications';
        
        console.log('[AuthGuard] isPublicJobPage:', isPublicJobPage);
        
        if (isPublicJobPage) {
            console.log('[AuthGuard] Page job publique détectée, pas de redirection');
            return;
        }
        
        if (!isProtectedPath(pathname)) {
            console.log('[AuthGuard] Route non protégée');
            return;
        }

        const token = getToken();
        const user = getUser();
        console.log('[AuthGuard] token:', token ? 'présent' : 'absent', 'user:', user ? 'présent' : 'absent');
        
        if (token != null || user != null) {
            console.log('[AuthGuard] Utilisateur authentifié');
            return;
        }

        // Route protégée mais pas d'auth au refresh => nettoyage complet et redirect
        console.log('[AuthGuard] Redirection vers login pour pathname:', pathname);
        clearAuthAndAllCacheRedirectToLogin();
    }, [pathname]);

    return null;
}
