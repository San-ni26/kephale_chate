'use client';

/**
 * Overlay d'appel global - affiché sur toutes les pages quand un appel est actif ou entrant.
 * Permet de continuer l'appel même en quittant la page de discussion.
 */

import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { useCallContext } from '@/src/contexts/CallContext';
import { cn } from '@/src/lib/utils';
import {
    Phone,
    PhoneOff,
    PhoneIncoming,
    Mic,
    MicOff,
    Volume2,
    Clock,
    ChevronUp,
} from 'lucide-react';

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

export function GlobalCallOverlay() {
    const pathname = usePathname();
    const router = useRouter();
    const ctx = useCallContext();

    if (!ctx) return null;

    const {
        callStatus,
        isIncomingCall,
        incomingCallData,
        activeCall,
        isMuted,
        isSpeakerOn,
        callDuration,
        connectionQuality,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleSpeaker,
    } = ctx;

    const showOverlay = callStatus !== 'idle' && (activeCall || isIncomingCall);
    if (!showOverlay) return null;

    const displayName = isIncomingCall
        ? incomingCallData?.callerName || 'Utilisateur'
        : activeCall?.otherUserName || 'Utilisateur';

    const isOnDiscussionPage =
        activeCall && pathname?.includes(`/chat/discussion/${activeCall.conversationId}`);

    // Mode compact : pas sur la page de discussion
    const compactMode = !isOnDiscussionPage && callStatus === 'connected';

    const handleRejoin = () => {
        if (activeCall) {
            router.push(`/chat/discussion/${activeCall.conversationId}`);
        }
    };

    if (compactMode) {
        return (
            <div
                className={cn(
                    'fixed bottom-20 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:max-w-sm',
                    'z-[90] flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/95 px-4 py-3 shadow-lg backdrop-blur-sm',
                    'animate-in slide-in-from-bottom-4 duration-300'
                )}
            >
                <Avatar className="h-10 w-10 shrink-0 border-2 border-white/30">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                    <AvatarFallback className="bg-white/20 text-white">{displayName[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">Appel avec {displayName}</p>
                    <p className="flex items-center gap-1 text-xs text-white/80">
                        <Clock className="h-3 w-3" />
                        {formatDuration(callDuration)}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className={cn(
                            'h-8 w-8 p-0 text-white/80 hover:bg-white/20',
                            isMuted && 'bg-white/20'
                        )}
                        onClick={toggleMute}
                        aria-label={isMuted ? 'Activer le micro' : 'Couper le micro'}
                    >
                        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className={cn(
                            'h-8 w-8 p-0 text-white/80 hover:bg-white/20',
                            isSpeakerOn && 'bg-white/20'
                        )}
                        onClick={toggleSpeaker}
                        aria-label="Haut-parleur"
                    >
                        <Volume2 className="h-4 w-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 bg-white/20 text-white hover:bg-white/30"
                        onClick={handleRejoin}
                    >
                        <ChevronUp className="h-4 w-4 mr-1" />
                        Ouvrir
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-white/80 hover:bg-red-500/30 hover:text-white"
                        onClick={endCall}
                        aria-label="Raccrocher"
                    >
                        <PhoneOff className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        );
    }

    // Mode plein écran (appel en cours ou entrant)
    return (
        <div className="fixed inset-0 z-[100] bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center flex-col">
            {/* Animated circles */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                {callStatus === 'connected' && (
                    <>
                        <div
                            className="absolute w-64 h-64 rounded-full border border-white/5 animate-ping"
                            style={{ animationDuration: '3s' }}
                        />
                        <div
                            className="absolute w-48 h-48 rounded-full border border-white/10 animate-ping"
                            style={{ animationDuration: '2s' }}
                        />
                    </>
                )}
                {(callStatus === 'dialing' || callStatus === 'ringing' || callStatus === 'connecting') && (
                    <>
                        <div className="absolute w-40 h-40 rounded-full bg-primary/10 animate-pulse" />
                        <div
                            className="absolute w-56 h-56 rounded-full bg-primary/5 animate-pulse"
                            style={{ animationDelay: '0.5s' }}
                        />
                    </>
                )}
            </div>

            <div className="relative z-10 flex flex-col items-center">
                <div
                    className={cn(
                        'relative mb-6',
                        callStatus === 'ringing' && 'animate-bounce'
                    )}
                >
                    <div
                        className={cn(
                            'bg-white/10 p-1 rounded-full',
                            callStatus === 'connected' ? 'ring-4 ring-green-500/30' : 'ring-4 ring-white/10'
                        )}
                    >
                        <Avatar className="w-28 h-28 border-2 border-white/20">
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                            <AvatarFallback className="text-3xl bg-primary/20 text-white">
                                {displayName[0]}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    {callStatus === 'connected' && (
                        <span className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-gray-800 rounded-full" />
                    )}
                </div>

                <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-lg">{displayName}</h3>

                <p className="text-white/80 mb-2 text-sm drop-shadow">
                    {isIncomingCall && 'Appel vocal entrant...'}
                    {callStatus === 'dialing' && 'Appel en cours...'}
                    {callStatus === 'connecting' && 'Connexion en cours...'}
                    {callStatus === 'connected' && 'Appel vocal'}
                </p>

                {callStatus === 'connected' && connectionQuality && (
                    <div
                        className={cn(
                            'text-xs px-2 py-0.5 rounded-full mb-2',
                            connectionQuality === 'good' && 'bg-green-500/30 text-green-200',
                            connectionQuality === 'fair' && 'bg-amber-500/30 text-amber-200',
                            connectionQuality === 'poor' && 'bg-red-500/30 text-red-200'
                        )}
                    >
                        {connectionQuality === 'good' && 'Bonne connexion'}
                        {connectionQuality === 'fair' && 'Connexion moyenne'}
                        {connectionQuality === 'poor' && 'Connexion instable'}
                    </div>
                )}

                {callStatus === 'connected' && (
                    <div className="flex items-center gap-1.5 text-white/80 mb-8">
                        <Clock className="w-4 h-4" />
                        <span className="text-lg font-mono">{formatDuration(callDuration)}</span>
                    </div>
                )}

                {callStatus !== 'connected' && <div className="mb-8" />}

                <div className="flex items-center gap-4 flex-wrap justify-center">
                    {isIncomingCall ? (
                        <>
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    size="lg"
                                    className="rounded-full w-16 h-16 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30"
                                    onClick={rejectCall}
                                >
                                    <PhoneOff className="w-7 h-7 text-white" />
                                </Button>
                                <span className="text-white/60 text-xs">Refuser</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    size="lg"
                                    className="rounded-full w-16 h-16 bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30 animate-pulse"
                                    onClick={answerCall}
                                >
                                    <PhoneIncoming className="w-7 h-7 text-white" />
                                </Button>
                                <span className="text-white/60 text-xs">Repondre</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    size="lg"
                                    className={cn(
                                        'rounded-full w-14 h-14 shadow-lg',
                                        isMuted ? 'bg-white/20 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                                    )}
                                    onClick={toggleMute}
                                >
                                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                                </Button>
                                <span className="text-white/60 text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    size="lg"
                                    className={cn(
                                        'rounded-full w-14 h-14 shadow-lg',
                                        isSpeakerOn ? 'bg-primary/40 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                                    )}
                                    onClick={toggleSpeaker}
                                >
                                    <Volume2 className="w-6 h-6" />
                                </Button>
                                <span className="text-white/60 text-xs">Haut-parleur</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    size="lg"
                                    className="rounded-full w-16 h-16 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30"
                                    onClick={endCall}
                                >
                                    <PhoneOff className="w-7 h-7 text-white" />
                                </Button>
                                <span className="text-white/60 text-xs">Raccrocher</span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
