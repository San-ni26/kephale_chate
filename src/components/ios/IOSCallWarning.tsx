'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Smartphone, AlertTriangle } from 'lucide-react';

/**
 * Détecte si l'appareil est iOS et affiche un avertissement
 * concernant les limitations des appels sur Safari iOS.
 */

export function IOSCallWarning() {
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);
        
        // Vérifier si installé en PWA (standalone)
        const standalone = window.matchMedia('(display-mode: standalone)').matches 
            || (window.navigator as any).standalone === true;
        setIsStandalone(standalone);
        
        // Vérifier si déjà dismiss
        const dismissedPref = localStorage.getItem('ios-call-warning-dismissed');
        setDismissed(dismissedPref === 'true');
    }, []);

    // Sur iOS, les appels ne fonctionnent que :
    // - En PWA installée (standalone)
    // - Avec iOS 14.3+ (WebRTC support amélioré)
    // - En HTTPS

    if (!isIOS || dismissed) return null;

    const isHTTPS = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const canMakeCalls = isStandalone && isHTTPS;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 shadow-lg z-50">
            <div className="flex items-start gap-3">
                <div className="shrink-0">
                    {canMakeCalls ? (
                        <Smartphone className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-amber-900 dark:text-amber-100 text-sm">
                        Appels sur iPhone
                    </h4>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        {canMakeCalls 
                            ? "Les appels audio/vidéo sont disponibles. Assurez-vous d'autoriser l'accès au micro et caméra dans les réglages."
                            : "Pour les appels, installez l'application sur l'écran d'accueil (icône Partager → Sur l'écran d'accueil)."
                        }
                    </p>
                    {!isHTTPS && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            Connexion non sécurisée (HTTP). Les appels nécessitent HTTPS.
                        </p>
                    )}
                </div>
                <button
                    onClick={() => {
                        localStorage.setItem('ios-call-warning-dismissed', 'true');
                        setDismissed(true);
                    }}
                    className="shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200"
                >
                    ×
                </button>
            </div>
        </div>
    );
}

/**
 * Hook pour vérifier si les appels sont supportés sur ce navigateur
 */
export function useCallSupport(): {
    supported: boolean;
    isIOS: boolean;
    isStandalone: boolean;
    isHTTPS: boolean;
    reason?: string;
} {
    const [state, setState] = useState({
        supported: false,
        isIOS: false,
        isStandalone: false,
        isHTTPS: false,
        reason: 'Checking...'
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const standalone = window.matchMedia('(display-mode: standalone)').matches 
            || (window.navigator as any).standalone === true;
        const https = window.location.protocol === 'https:';
        const mediaDevicesSupported = typeof navigator !== 'undefined' && 
            !!navigator.mediaDevices && 
            typeof navigator.mediaDevices.getUserMedia === 'function';

        let supported = true;
        let reason = '';

        if (!mediaDevicesSupported) {
            supported = false;
            reason = 'Votre navigateur ne supporte pas les appels audio/vidéo.';
        } else if (isIOSDevice && !standalone) {
            supported = false;
            reason = 'Sur iPhone, installez l\'app sur l\'écran d\'accueil pour les appels.';
        } else if (!https && window.location.hostname !== 'localhost') {
            supported = false;
            reason = 'Les appels nécessitent une connexion sécurisée (HTTPS).';
        }

        setState({
            supported,
            isIOS: isIOSDevice,
            isStandalone: standalone,
            isHTTPS: https,
            reason
        });
    }, []);

    return state;
}
