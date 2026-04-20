/**
 * Audio Ducking - Réduction automatique du volume des autres sources audio
 * pendant un appel vidéo/audio pour améliorer l'intelligibilité.
 */

export interface DuckingController {
    start: () => void;
    stop: () => void;
    setDuckingLevel: (level: number) => void;
    isActive: () => boolean;
}

/**
 * Crée un contrôleur de ducking audio.
 * Réduit le volume des éléments audio/vidéo de la page pendant un appel.
 * 
 * @param duckingLevel Niveau de réduction (0-1, où 0 = muet, 1 = pas de réduction)
 * @returns DuckingController
 */
export function createAudioDucking(duckingLevel = 0.3): DuckingController {
    if (typeof window === 'undefined') {
        return {
            start: () => {},
            stop: () => {},
            setDuckingLevel: () => {},
            isActive: () => false,
        };
    }

    const originalVolumes = new Map<HTMLMediaElement, number>();
    let mediaElements: HTMLMediaElement[] = [];
    let isDucking = false;
    let observer: MutationObserver | null = null;

    const findMediaElements = (): HTMLMediaElement[] => {
        return Array.from(document.querySelectorAll('audio, video'));
    };

    const start = () => {
        if (isDucking) return;
        isDucking = true;

        // Méthode 1: Réduire le volume des éléments media directement
        mediaElements = findMediaElements();
        mediaElements.forEach((el) => {
            if (el !== document.pictureInPictureElement) {
                originalVolumes.set(el, el.volume);
                el.volume = el.volume * duckingLevel;
            }
        });

        // Méthode 2: Observer les nouveaux éléments audio ajoutés
        if ('MutationObserver' in window) {
            observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node instanceof HTMLMediaElement && !originalVolumes.has(node)) {
                            originalVolumes.set(node, node.volume);
                            node.volume = node.volume * duckingLevel;
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }
    };

    const stop = () => {
        if (!isDucking) return;
        isDucking = false;

        // Restaurer les volumes originaux
        originalVolumes.forEach((volume, el) => {
            el.volume = volume;
        });
        originalVolumes.clear();

        // Arrêter l'observer
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    };

    const setDuckingLevel = (level: number) => {
        const clampedLevel = Math.max(0, Math.min(1, level));
        if (!isDucking) return;
        
        // Mettre à jour le volume des éléments en cours
        originalVolumes.forEach((originalVolume, el) => {
            el.volume = originalVolume * clampedLevel;
        });
    };

    const isActive = () => isDucking;

    return { start, stop, setDuckingLevel, isActive };
}

/**
 * Hook utilitaire pour créer un ducking controller persistant
 */
let globalDuckingController: DuckingController | null = null;

export function getGlobalDuckingController(): DuckingController {
    if (!globalDuckingController) {
        globalDuckingController = createAudioDucking(0.2); // 20% du volume pendant l'appel
    }
    return globalDuckingController;
}

export function destroyGlobalDuckingController(): void {
    globalDuckingController?.stop();
    globalDuckingController = null;
}
