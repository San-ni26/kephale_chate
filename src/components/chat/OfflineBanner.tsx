'use client';

import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';

/**
 * Bandeau affiché quand l'utilisateur est hors ligne.
 * Fixe en haut de l'écran, visible sur toutes les pages.
 */
export function OfflineBanner() {
    const isOnline = useOnlineStatus();

    if (isOnline) return null;

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[100] bg-amber-500/95 text-amber-950 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2"
            role="alert"
        >
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Vous êtes hors ligne. Certaines fonctionnalités peuvent être limitées.</span>
        </div>
    );
}
