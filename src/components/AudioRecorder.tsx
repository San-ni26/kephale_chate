'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Mic, Trash2, Send, StopCircle, X } from 'lucide-react';
import { AudioRecorder, formatDuration } from '@/src/lib/audio-utils';
import { toast } from 'sonner';

interface AudioRecorderProps {
    onAudioRecorded: (blob: Blob, duration: number) => void;
    isRecordingDisabled?: boolean;
    onRecordingStatusChange?: (isRecording: boolean) => void;
}

export function AudioRecorderComponent({ onAudioRecorded, isRecordingDisabled = false, onRecordingStatusChange }: AudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioLevel, setAudioLevel] = useState(0);
    const recorderRef = useRef<AudioRecorder | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const levelIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize recorder on mount needed? No, on start.

    useEffect(() => {
        return () => {
            stopTimer();
            stopLevelMonitor();
            if (recorderRef.current) {
                recorderRef.current.cancel();
            }
        };
    }, []);

    const startTimer = () => {
        const startTime = Date.now();
        timerRef.current = setInterval(() => {
            setDuration(Date.now() - startTime);
        }, 100);
    };

    const stopTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const startLevelMonitor = () => {
        levelIntervalRef.current = setInterval(() => {
            if (recorderRef.current) {
                setAudioLevel(recorderRef.current.getAudioLevel());
            }
        }, 50);
    };

    const stopLevelMonitor = () => {
        if (levelIntervalRef.current) {
            clearInterval(levelIntervalRef.current);
            levelIntervalRef.current = null;
        }
        setAudioLevel(0);
    };

    const handleStartRecording = async () => {
        try {
            const recorder = new AudioRecorder();
            await recorder.start();
            recorderRef.current = recorder;

            setIsRecording(true);
            onRecordingStatusChange?.(true);
            setDuration(0);
            startTimer();
            startLevelMonitor();
        } catch (error) {
            toast.error("Impossible d'accéder au microphone");
            console.error(error);
        }
    };

    const handleStopRecording = async (shouldSend: boolean) => {
        if (!recorderRef.current) return;

        stopTimer();
        stopLevelMonitor();
        const { blob, duration } = await recorderRef.current.stop();
        setIsRecording(false);
        onRecordingStatusChange?.(false);
        recorderRef.current = null;

        if (shouldSend && blob.size > 0) {
            onAudioRecorded(blob, duration);
        }
    };

    const handleCancelRecording = () => {
        if (recorderRef.current) {
            recorderRef.current.cancel();
        }
        stopTimer();
        stopLevelMonitor();
        setIsRecording(false);
        onRecordingStatusChange?.(false);
        recorderRef.current = null;
        setDuration(0);
    };

    if (isRecording) {
        return (
            <div className="flex items-center gap-2 flex-1 bg-muted rounded-full px-2 py-1 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 px-2">
                    <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                    <span className="text-foreground font-medium min-w-[50px]">
                        {formatDuration(duration)}
                    </span>
                </div>

                <div className="flex-1 h-8 flex items-center gap-[2px] overflow-hidden max-w-[200px]">
                    {/* Fake waveform visualization based on audio level */}
                    {Array.from({ length: 20 }).map((_, i) => (
                        <div
                            key={i}
                            className="w-1 bg-muted-foreground rounded-full transition-all duration-75"
                            style={{
                                height: `${Math.max(10, Math.random() * audioLevel + 10)}%`,
                                opacity: 0.5 + (audioLevel / 200)
                            }}
                        />
                    ))}
                </div>

                <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 rounded-full w-8 h-8"
                    onClick={handleCancelRecording}
                >
                    <Trash2 className="w-5 h-5" />
                </Button>

                <Button
                    size="icon"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full w-8 h-8 ml-1"
                    onClick={() => handleStopRecording(true)}
                >
                    <Send className="w-4 h-4" />
                </Button>
            </div>
        );
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleStartRecording}
            disabled={isRecordingDisabled}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-full"
        >
            <Mic className="w-6 h-6" />
        </Button>
    );
}
