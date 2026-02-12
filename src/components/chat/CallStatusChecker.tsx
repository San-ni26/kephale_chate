'use client';

/**
 * Vérifie l'état d'appel au chargement et quand l'app redevient visible.
 * Redirige vers la conversation si un appel est en attente ou actif ailleurs.
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
                const { activeCall, pendingCall } = await res.json();
                const current = pathnameRef.current || '';

                const target = pendingCall?.conversationId || activeCall?.conversationId;
                if (!target) return;

                if (current.includes(`/chat/discussion/${target}`)) return;

                router.push(`/chat/discussion/${target}`);
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
