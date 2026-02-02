/**
 * Audio recording and playback utilities
 */

export interface AudioRecorderOptions {
    onEnable?: () => void;
    onDisable?: () => void;
}

export class AudioRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private startTime: number = 0;
    private timerInterval: NodeJS.Timeout | null = null;
    private analyser: AnalyserNode | null = null;
    private audioContext: AudioContext | null = null;
    private dataArray: Uint8Array | null = null;
    private mimeType: string = 'audio/webm';

    async start(): Promise<void> {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Detect supported MIME type
            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/aac',
                'audio/ogg'
            ];

            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    this.mimeType = type;
                    break;
                }
            }

            console.log('AudioRecorder: Using MIME type', this.mimeType);

            // Setup MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start(100); // Collect 100ms chunks for finer control
            this.startTime = Date.now();

            // Setup Audio Analyser for waveform
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            throw new Error('Microphone access denied or not available');
        }
    }

    async stop(): Promise<{ blob: Blob; duration: number; mimeType: string }> {
        return new Promise((resolve) => {
            if (!this.mediaRecorder) {
                resolve({ blob: new Blob(), duration: 0, mimeType: this.mimeType });
                return;
            }

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: this.mimeType });
                const duration = Date.now() - this.startTime;

                this.cleanup();
                resolve({ blob: audioBlob, duration, mimeType: this.mimeType });
            };

            this.mediaRecorder.stop();
        });
    }

    cancel() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.cleanup();
    }

    private cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.analyser = null;
    }

    getAudioLevel(): number {
        if (!this.analyser || !this.dataArray) return 0;

        this.analyser.getByteFrequencyData(this.dataArray as any);

        // Calculate average volume level (0-255)
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;

        // Return normalized value 0-100
        return Math.min(100, (average / 128) * 100);
    }
}

/**
 * Format milliseconds to MM:SS string
 */
export function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Generate a visual waveform from audio level
 * Returns an array of heights (0-100)
 */
export function generateWaveform(level: number, samples: number = 30): number[] {
    // This is a simplified visualizer that appends new level
    // In a real app, you would maintain a buffer of levels
    return Array(samples).fill(0).map(() => Math.random() * 50 + (level / 2));
}
