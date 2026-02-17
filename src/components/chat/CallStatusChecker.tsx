'use client';

/**
 * Vérifie l'état d'appel au chargement et quand l'app redevient visible.
 * - Appel en attente (pending) : redirige vers la conversation pour répondre
 * - Appel actif (active) : géré par ActiveCallBanner (pas de redirection auto)
 */

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/src/lib/auth-client';

export function CallStatusChecker() {
    const pathname = usePathname();
    const router = useRouter();
    const pathnameRef = useRef(pathname);
    pathnameRef.current = pathname;

    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetchWithAuth('/api/call/status');
                if (!res.ok) return;
                const { pendingCall } = await res.json();
                const current = pathnameRef.current || '';

                // Seulement rediriger pour un appel EN ATTENTE (entrant)
                if (!pendingCall?.conversationId) return;
                if (current.includes(`/chat/discussion/${pendingCall.conversationId}`)) return;

                router.push(`/chat/discussion/${pendingCall.conversationId}`);
            } catch {
                // Silencieux
            }
        };

        check();

        const onVisible = () => {
            if (document.visibilityState === 'visible') check();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [router]);

    return null;
}
