'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { formatDuration } from '@/src/lib/audio-utils';
import { cn } from '@/src/lib/utils';

interface AudioBubbleWhatsAppProps {
    src: string;
    /** Affichage à droite (moi) ou à gauche (interlocuteur) */
    isOwn?: boolean;
    className?: string;
}

/** Bulle audio style WhatsApp : compacte, barre de progression, durée, vitesses */
export function AudioBubbleWhatsApp({ src, isOwn = true, className }: AudioBubbleWhatsAppProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateProgress = () => {
            if (audio.duration && !Number.isNaN(audio.duration)) {
                setProgress((audio.currentTime / audio.duration) * 100);
            }
        };

        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
        };

        const onLoadedMetadata = () => {
            setDuration(audio.duration * 1000);
        };

        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);

        return () => {
            audio.removeEventListener('timeupdate', updateProgress);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }, []);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const cycleSpeed = () => {
        const audio = audioRef.current;
        if (!audio) return;
        const rates = [1, 1.5, 2];
        const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
        audio.playbackRate = next;
        setPlaybackRate(next);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio || !audio.duration) return;
        const value = Number(e.target.value);
        const time = (value / 100) * audio.duration;
        audio.currentTime = time;
        setProgress(value);
    };

    return (
        <div
            className={cn(
                'flex items-center gap-2 rounded-2xl px-3 py-2.5 min-w-[200px] max-w-[280px] border shadow-sm',
                isOwn
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-foreground border-border',
                className
            )}
        >
            <audio ref={audioRef} src={src} preload="metadata" />

            <button
                type="button"
                onClick={togglePlay}
                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 transition"
                aria-label={isPlaying ? 'Pause' : 'Lecture'}
            >
                {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
            </button>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress}
                    onChange={handleSeek}
                    className="w-full h-1 rounded-full appearance-none cursor-pointer bg-white/30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <div className="flex justify-between items-center">
                    <span className="text-[11px] opacity-90 font-mono">
                        {formatDuration(duration ? (progress / 100) * duration : 0)} / {formatDuration(duration)}
                    </span>
                    <button
                        type="button"
                        onClick={cycleSpeed}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/30"
                    >
                        {playbackRate}x
                    </button>
                </div>
            </div>
        </div>
    );
}
