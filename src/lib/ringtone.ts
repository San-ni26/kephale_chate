/**
 * Sonnerie d'appel entrant - style moderne (type smartphone)
 * Arpège doux et mélodique
 */

let audioContext: AudioContext | null = null;
let isPlaying = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let vibrationIntervalId: ReturnType<typeof setInterval> | null = null;

// Mélodie moderne : arpège majeur doux (Do - Mi - Sol - Do aigu)
const MELODY = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
const NOTE_DURATION = 120;
const NOTE_GAP = 80;
const CYCLE_PAUSE = 1800;
const VOLUME = 0.25;

function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContext;
}

function playNote(freq: number, startTime: number, duration: number, ctx: AudioContext): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(VOLUME, startTime + 0.01);
    gain.gain.setValueAtTime(VOLUME, startTime + duration / 1000 - 0.03);
    gain.gain.linearRampToValueAtTime(0, startTime + duration / 1000);
    osc.start(startTime);
    osc.stop(startTime + duration / 1000);
}

async function playRingCycle(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    MELODY.forEach((freq, i) => {
        const startTime = now + i * (NOTE_DURATION + NOTE_GAP) / 1000;
        playNote(freq, startTime, NOTE_DURATION, ctx);
    });

    const totalDuration = MELODY.length * (NOTE_DURATION + NOTE_GAP);
    await new Promise((r) => setTimeout(r, totalDuration));
}

export function startRingtone(): void {
    if (isPlaying) return;
    if (typeof window === 'undefined') return;

    const ctx = getAudioContext();
    if (ctx?.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    isPlaying = true;

    const ring = async () => {
        if (!isPlaying) return;
        await playRingCycle();
        if (!isPlaying) return;
        intervalId = setTimeout(ring, CYCLE_PAUSE);
    };

    ring();

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        const vibratePattern = [200, 80, 200, 80, 200];
        const doVibrate = () => {
            if (isPlaying) navigator.vibrate(vibratePattern);
        };
        doVibrate();
        vibrationIntervalId = setInterval(doVibrate, 1800);
    }
}

export function stopRingtone(): void {
    isPlaying = false;
    if (intervalId) {
        clearTimeout(intervalId);
        intervalId = null;
    }
    if (vibrationIntervalId) {
        clearInterval(vibrationIntervalId);
        vibrationIntervalId = null;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(0);
    }
}

export function isRingtonePlaying(): boolean {
    return isPlaying;
}
