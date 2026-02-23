'use client';

/**
 * Vérifie l'état d'appel au chargement et quand l'app redevient visible.
 * - Appel en attente (pending) : redirige vers la conversation pour répondre
 * - Ne redirige JAMAIS si l'utilisateur est déjà en appel actif (évite de couper l'appel)
 */

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { useCallContext } from '@/src/contexts/CallContext';

export function CallStatusChecker() {
    const pathname = usePathname();
    const router = useRouter();
    const callContext = useCallContext();
    const pathnameRef = useRef(pathname);
    const activeCallRef = useRef(callContext?.activeCall);
    pathnameRef.current = pathname;
    activeCallRef.current = callContext?.activeCall;

    useEffect(() => {
        const check = async () => {
            // Ne jamais rediriger si l'utilisateur est déjà en appel actif
            if (activeCallRef.current) return;

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
            if (document.visibilityState !== 'visible') return;
            if (activeCallRef.current) return; // Ne pas interrompre un appel en cours
            check();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [router]);

    return null;
}
