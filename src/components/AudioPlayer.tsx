'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Play, Pause, Loader2 } from 'lucide-react';
import { formatDuration } from '@/src/lib/audio-utils';

interface AudioPlayerProps {
    src: string;
    onPlay?: () => void;
}

export function AudioPlayer({ src, onPlay }: AudioPlayerProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [playbackRate, setPlaybackRate] = useState(1);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateProgress = () => {
            if (audio.duration) {
                setProgress((audio.currentTime / audio.duration) * 100);
            }
        };

        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
        };

        const onLoadedMetadata = () => {
            setDuration(audio.duration * 1000);
            setIsLoading(false);
        };

        const onCanPlay = () => {
            setIsLoading(false);
        };

        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('canplay', onCanPlay);

        return () => {
            audio.removeEventListener('timeupdate', updateProgress);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('canplay', onCanPlay);
        };
    }, []);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
            onPlay?.();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio) return;

        const value = Number(e.target.value);
        const time = (value / 100) * audio.duration;
        audio.currentTime = time;
        setProgress(value);
    };

    const toggleSpeed = () => {
        const audio = audioRef.current;
        if (!audio) return;

        const newRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
        audio.playbackRate = newRate;
        setPlaybackRate(newRate);
    };

    return (
        <div className="flex items-center gap-3 bg-slate-800/80 rounded-lg p-2 min-w-[280px] border border-slate-700">
            <audio ref={audioRef} src={src} preload="metadata" />

            <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-200"
                onClick={togglePlay}
                disabled={isLoading}
            >
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPlaying ? (
                    <Pause className="h-4 w-4 fill-current" />
                ) : (
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                )}
            </Button>

            <div className="flex-1 flex flex-col gap-1 min-w-0">
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress}
                    onChange={handleSeek}
                    className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>{formatDuration(duration ? (progress / 100) * duration : 0)}</span>
                    <span>{formatDuration(duration)}</span>
                </div>
            </div>

            <Button
                size="sm"
                variant="ghost"
                className={`h-6 px-1.5 text-[10px] font-bold rounded ${playbackRate > 1 ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                onClick={toggleSpeed}
            >
                {playbackRate}x
            </Button>
        </div>
    );
}
