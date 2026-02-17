'use client';

/**
 * Bandeau flottant affiché sur toute l'app quand un appel est en cours
 * et que l'utilisateur n'est pas sur la page de la conversation.
 * Permet de rejoindre l'appel depuis n'importe quelle page.
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Phone, X } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import { cn } from '@/src/lib/utils';

interface CallState {
    conversationId: string;
    withUserId: string;
    withUserName?: string;
    startedAt: number;
}

export function ActiveCallBanner() {
    const pathname = usePathname();
    const router = useRouter();
    const [activeCall, setActiveCall] = useState<CallState | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const checkStatus = async () => {
        if (!getUser()) return;
        try {
            const res = await fetchWithAuth('/api/call/status');
            if (!res.ok) return;
            const { activeCall: ac } = await res.json();
            setActiveCall(ac || null);
            if (ac) setDismissed(false);
        } catch {
            setActiveCall(null);
        }
    };

    useEffect(() => {
        checkStatus();
        const onVisible = () => {
            if (document.visibilityState === 'visible') checkStatus();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    const isOnDiscussionPage = activeCall && pathname?.includes(`/chat/discussion/${activeCall.conversationId}`);
    const showBanner = activeCall && !isOnDiscussionPage && !dismissed;

    if (!getUser() || !showBanner) return null;

    const handleRejoin = () => {
        router.push(`/chat/discussion/${activeCall!.conversationId}`);
    };

    return (
        <div
            className={cn(
                'fixed bottom-20 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:max-w-sm',
                'z-[90] flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/95 px-4 py-3 shadow-lg backdrop-blur-sm',
                'animate-in slide-in-from-bottom-4 duration-300'
            )}
        >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                <Phone className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">
                    Appel en cours{activeCall.withUserName ? ` avec ${activeCall.withUserName}` : ''}
                </p>
                <p className="text-xs text-white/80">Cliquez pour rejoindre</p>
            </div>
            <div className="flex shrink-0 gap-1">
                <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 bg-white/20 text-white hover:bg-white/30"
                    onClick={handleRejoin}
                >
                    Rejoindre
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white/80 hover:bg-white/20 hover:text-white"
                    onClick={() => setDismissed(true)}
                    aria-label="Masquer"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
