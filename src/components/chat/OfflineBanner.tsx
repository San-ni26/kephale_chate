'use client';

import { WifiOff, Signal, SignalHigh, SignalLow, SignalMedium, AlertCircle } from 'lucide-react';
import { useNetworkStatusContext } from '@/src/providers/NetworkStatusProvider';

/**
 * Bandeau affiché quand l'utilisateur est hors ligne ou en connexion lente.
 * Fixe en haut de l'écran, visible sur toutes les pages.
 * Affiche également la qualité de connexion quand disponible.
 */
export function OfflineBanner() {
    const { online, quality, effectiveType, saveData, supported } = useNetworkStatusContext();

    // Ne rien afficher si tout va bien (online + qualité bonne ou inconnue)
    if (online && (quality === 'excellent' || quality === 'good' || quality === 'unknown')) {
        return null;
    }

    // Icône selon la qualité
    const getIcon = () => {
        if (!online) return <WifiOff className="w-4 h-4 shrink-0" />;
        switch (quality) {
            case 'excellent':
                return <Signal className="w-4 h-4 shrink-0" />;
            case 'good':
                return <SignalHigh className="w-4 h-4 shrink-0" />;
            case 'fair':
                return <SignalMedium className="w-4 h-4 shrink-0" />;
            case 'poor':
                return <SignalLow className="w-4 h-4 shrink-0" />;
            default:
                return <AlertCircle className="w-4 h-4 shrink-0" />;
        }
    };

    // Message selon le statut
    const getMessage = () => {
        if (!online) {
            return 'Vous êtes hors ligne. Certaines fonctionnalités peuvent être limitées.';
        }
        if (saveData) {
            return `Mode économie de données activé. Les médias ne se chargeront pas automatiquement.`;
        }
        if (quality === 'fair') {
            return `Connexion ${effectiveType.toUpperCase()} - qualité moyenne.`;
        }
        if (quality === 'poor') {
            return `Connexion très lente (${effectiveType.toUpperCase()}) - patience recommandée.`;
        }
        return 'État de la connexion inconnu.';
    };

    // Couleurs selon le statut
    const getColors = () => {
        if (!online) {
            return 'bg-amber-500/95 text-amber-950';
        }
        if (quality === 'poor' || saveData) {
            return 'bg-red-500/90 text-white';
        }
        if (quality === 'fair') {
            return 'bg-yellow-500/90 text-yellow-950';
        }
        return 'bg-amber-500/95 text-amber-950';
    };

    return (
        <div
            className={`fixed top-0 left-0 right-0 z-[100] ${getColors()} px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2`}
            role="alert"
            aria-live="polite"
        >
            {getIcon()}
            <span>{getMessage()}</span>
            {supported && effectiveType !== 'unknown' && online && (
                <span className="hidden sm:inline text-xs opacity-75">
                    ({effectiveType.toUpperCase()})
                </span>
            )}
        </div>
    );
}
