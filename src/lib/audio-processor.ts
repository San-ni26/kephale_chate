/**
 * Traitement audio pour réduire le bruit numérique et améliorer la qualité des appels.
 * Utilise Web Audio API : high-pass (rumble), low-shelf (adoucir), dynamics (niveau).
 */

export interface AudioProcessorResult {
    stream: MediaStream;
    audioContext: AudioContext;
    disconnect: () => void;
}

/**
 * Applique un filtre audio pour masquer le bruit numérique :
 * - High-pass 80Hz : coupe le rumble
 * - High-shelf : atténue les hautes fréquences (sifflement / bruit numérique)
 * - DynamicsCompressor : stabilise les niveaux
 */
export function processAudioStream(inputStream: MediaStream): AudioProcessorResult | null {
    if (typeof window === 'undefined') return null;

    const audioTracks = inputStream.getAudioTracks();
    if (audioTracks.length === 0) return null;

    try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(inputStream);
        const destination = audioContext.createMediaStreamDestination();

        // High-pass 80Hz : coupe le rumble et les basses fréquences parasites
        const highPass = audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 80;
        highPass.Q.value = 0.7;

        // High-shelf : atténue les hautes fréquences (bruit numérique / sifflement)
        const highShelf = audioContext.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 4000;
        highShelf.gain.value = -3;

        // DynamicsCompressor : stabilise les niveaux, réduit le bruit de fond perçu
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;

        source.connect(highPass);
        highPass.connect(highShelf);
        highShelf.connect(compressor);
        compressor.connect(destination);

        const processedStream = destination.stream;

        const disconnect = () => {
            try {
                source.disconnect();
                audioContext.close();
                inputStream.getAudioTracks().forEach((t) => t.stop());
            } catch {
                // Ignorer si déjà fermé
            }
        };

        return { stream: processedStream, audioContext, disconnect };
    } catch (e) {
        if (e instanceof DOMException && e.name === 'NotAllowedError') return null;
        if (process.env.NODE_ENV === 'development') {
            console.warn('[Audio] Processing failed, using raw stream:', e);
        }
        return null;
    }
}

/**
 * Combine le flux audio traité avec la piste vidéo (pour appels vidéo).
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
