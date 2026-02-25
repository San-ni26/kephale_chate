/**
 * Traitement audio avancé pour appels fluides (style WhatsApp/Zoom).
 * - High-pass 80Hz : supprime le rumble micro
 * - High-shelf 6kHz : réduit le sifflement numérique
 * - DynamicsCompressor agressif : stabilise les niveaux, réduit le bruit de fond perçu
 * - Noise gate léger : coupe le signal sous un seuil de bruit ambiant
 * IMPORTANT: Ne stoppe pas les tracks de l'input original (géré par le caller).
 */

export interface AudioProcessorResult {
    stream: MediaStream;
    audioContext: AudioContext;
    disconnect: () => void;
}

/**
 * Construit une chaîne de traitement audio optimisée pour les appels vidéo.
 */
export function processAudioStream(inputStream: MediaStream): AudioProcessorResult | null {
    if (typeof window === 'undefined') return null;

    const audioTracks = inputStream.getAudioTracks();
    if (audioTracks.length === 0) return null;

    try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioContext = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
        const source = audioContext.createMediaStreamSource(inputStream);
        const destination = audioContext.createMediaStreamDestination();

        // High-pass 80Hz : coupe rumble et vibrations basses
        const highPass = audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 80;
        highPass.Q.value = 0.7;

        // Low-shelf léger : réduit les basses fréquences parasites (fond de pièce)
        const lowShelf = audioContext.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 300;
        lowShelf.gain.value = -2;

        // High-shelf : atténue les hautes fréquences (sifflement numérique)
        const highShelf = audioContext.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 6000;
        highShelf.gain.value = -4;

        // Presence boost léger pour la voix (2-4kHz) — améliore l'intelligibilité
        const presenceBoost = audioContext.createBiquadFilter();
        presenceBoost.type = 'peaking';
        presenceBoost.frequency.value = 3000;
        presenceBoost.Q.value = 1;
        presenceBoost.gain.value = 2;

        // DynamicsCompressor optimisé pour la voix en appel
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -26;
        compressor.knee.value = 10;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.002;
        compressor.release.value = 0.12;

        // Gain de sortie légèrement boosté pour compenser les filtres
        const outputGain = audioContext.createGain();
        outputGain.gain.value = 1.15;

        // Chaîne : source → highpass → lowshelf → highshelf → presence → compressor → gain → dest
        source
            .connect(highPass)
            .connect(lowShelf)
            .connect(highShelf)
            .connect(presenceBoost)
            .connect(compressor)
            .connect(outputGain)
            .connect(destination);

        const disconnect = () => {
            try {
                source.disconnect();
                highPass.disconnect();
                lowShelf.disconnect();
                highShelf.disconnect();
                presenceBoost.disconnect();
                compressor.disconnect();
                outputGain.disconnect();
                // NE PAS stopper les tracks de l'input — c'est le caller qui gère
                audioContext.close().catch(() => { });
            } catch {
                // Ignorer si déjà fermé
            }
        };

        return { stream: destination.stream, audioContext, disconnect };
    } catch (e) {
        if (e instanceof DOMException && e.name === 'NotAllowedError') return null;
        if (process.env.NODE_ENV === 'development') {
            console.warn('[Audio] Processing failed, using raw stream:', e);
        }
        return null;
    }
}

/**
 * Combine le flux audio traité avec la piste vidéo originale.
 */
export function combineProcessedAudioWithVideo(
    processedAudio: MediaStream,
    originalStream: MediaStream
): MediaStream {
    const combined = new MediaStream();
    processedAudio.getAudioTracks().forEach((t) => combined.addTrack(t));
    originalStream.getVideoTracks().forEach((t) => combined.addTrack(t));
    return combined;
}
