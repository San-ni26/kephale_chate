'use client';

/**
 * Overlay d'appel global - optimisé pour éviter les saccades vidéo.
 * 
 * PRINCIPE CLÉ ANTI-SACCADE :
 * - Les éléments <video> sont isolés dans des sous-composants mémoïsés (RemoteVideo, LocalVideo).
 * - srcObject n'est jamais réassigné (comparaison avant assignation).
 * - Jamais de inline ref callbacks qui appellent safePlay() à chaque render.
 * - Le timer (callDuration) et les stats (connectionQuality) ne recréent PAS les vidéos.
 * - CSS `will-change: transform` + `contain: strict` pour accélération GPU.
 */

import { useRef, useEffect, memo, useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { useCallContext } from '@/src/contexts/CallContext';
import { safePlay } from '@/src/lib/safe-media-play';
import { cn } from '@/src/lib/utils';
import {
    PhoneOff,
    PhoneIncoming,
    Mic,
    MicOff,
    Volume2,
    Video,
    VideoOff,
    Clock,
    ChevronUp,
    Wifi,
    WifiOff,
    RefreshCw,
    FlipHorizontal,
    PictureInPicture,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// ─── RemoteVideo — JAMAIS re-rendu si stream identique ────────────────────────

interface RemoteVideoProps {
    stream: MediaStream;
    className?: string;
    hidden?: boolean;
    onRef?: (el: HTMLVideoElement | null) => void;
}

const RemoteVideo = memo(function RemoteVideo({ stream, className, hidden, onRef }: RemoteVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Attacher le stream via effect — jamais dans le render inline
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // NE ré-assigner srcObject QUE si le stream a changé
        if (video.srcObject !== stream) {
            video.srcObject = stream;
        }
        // Forcer play uniquement si la vidéo est en pause
        if (video.paused) {
            safePlay(video);
        }

        return () => {
            // Nettoyage : ne pas détacher srcObject ici (évite le flash noir)
        };
    }, [stream]);

    // Callback ref stable pour exposer le <video> au CallContext
    const stableRef = useCallback((el: HTMLVideoElement | null) => {
        (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
        onRef?.(el);
        if (el && stream) {
            if (el.srcObject !== stream) el.srcObject = stream;
            if (el.paused) safePlay(el);
        }
    }, [stream, onRef]);

    return (
        <video
            ref={stableRef}
            autoPlay
            playsInline
            muted={false}
            className={cn(className, hidden && 'hidden')}
            style={{ willChange: 'transform', contain: 'strict' }}
        />
    );
});

// ─── LocalVideo — Vidéo locale (PiP) mémoïsée ─────────────────────────────────

interface LocalVideoProps {
    stream: MediaStream;
    className?: string;
}

const LocalVideo = memo(function LocalVideo({ stream, className }: LocalVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.srcObject !== stream) {
            video.srcObject = stream;
            video.muted = true;
        }
        if (video.paused) safePlay(video);
    }, [stream]);

    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={className}
            style={{ willChange: 'transform', contain: 'strict' }}
        />
    );
});

// ─── Indicateur VAD (Voice Activity Detection) — mémoïsé ─────────────────────

interface VADIndicatorProps {
    isSpeaking: boolean;
    displayName: string;
}

const VADIndicator = memo(function VADIndicator({ isSpeaking, displayName }: VADIndicatorProps) {
    if (!isSpeaking) return null;

    return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/50 text-blue-100 flex items-center gap-1 animate-pulse">
            <Mic className="w-3 h-3" />
            {displayName} parle...
        </span>
    );
});

// ─── Indicateur de qualité — mémoïsé (ne contient pas de vidéo) ───────────────

interface QualityBadgeProps {
    quality: string;
    isReconnecting: boolean;
}

const QualityBadge = memo(function QualityBadge({ quality, isReconnecting }: QualityBadgeProps) {
    if (isReconnecting) {
        return (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/50 text-amber-100 animate-pulse flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Reconnexion...
            </span>
        );
    }
    if (!quality) return null;

    const config = {
        excellent: { bg: 'bg-emerald-500/40 text-emerald-100', label: 'Excellente', icon: <Wifi className="w-3 h-3" /> },
        good: { bg: 'bg-green-500/40 text-green-100', label: 'Bonne', icon: <Wifi className="w-3 h-3" /> },
        fair: { bg: 'bg-amber-500/40 text-amber-100', label: 'Moyenne', icon: <Wifi className="w-3 h-3" /> },
        poor: { bg: 'bg-red-500/40 text-red-100', label: 'Instable', icon: <WifiOff className="w-3 h-3" /> },
    }[quality];

    if (!config) return null;

    return (
        <span className={cn('text-xs px-2 py-0.5 rounded-full flex items-center gap-1', config.bg)}>
            {config.icon}
            {config.label}
        </span>
    );
});

// ─── GlobalCallOverlay ────────────────────────────────────────────────────────

export function GlobalCallOverlay() {
    const pathname = usePathname();
    const router = useRouter();
    const ctx = useCallContext();
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    // Picture-in-Picture hooks (doivent être avant les early returns)
    const [isPiPActive, setIsPiPActive] = useState(false);
    const isPiPSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;

    const togglePiP = useCallback(async () => {
        const video = remoteVideoRef.current;
        if (!video) return;

        try {
            if (document.pictureInPictureElement === video) {
                await document.exitPictureInPicture();
                setIsPiPActive(false);
            } else {
                await video.requestPictureInPicture();
                setIsPiPActive(true);
            }
        } catch (err) {
            console.warn('[PiP] Error:', err);
        }
    }, []);

    useEffect(() => {
        const video = remoteVideoRef.current;
        if (!video) return;

        const handleEnterPiP = () => setIsPiPActive(true);
        const handleLeavePiP = () => setIsPiPActive(false);

        video.addEventListener('enterpictureinpicture', handleEnterPiP);
        video.addEventListener('leavepictureinpicture', handleLeavePiP);

        return () => {
            video.removeEventListener('enterpictureinpicture', handleEnterPiP);
            video.removeEventListener('leavepictureinpicture', handleLeavePiP);
        };
    }, [ctx?.remoteStream]);

    if (!ctx) return null;

    const {
        callStatus,
        isIncomingCall,
        incomingCallData,
        activeCall,
        callType,
        localStream,
        remoteStream,
        isMuted,
        isVideoOn,
        isSpeakerOn,
        callDuration,
        connectionQuality,
        remoteIsSpeaking,
        isVideoAutoDisabled,
        facingMode,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideoCamera,
        toggleSpeaker,
        toggleCameraFacing,
        setRemoteVideoRef,
    } = ctx;

    const isVideoCall = activeCall?.callType === 'video' || (isIncomingCall && incomingCallData?.isVideo !== false);

    const showOverlay = callStatus !== 'idle' && (activeCall || isIncomingCall);
    if (!showOverlay) return null;

    const isReconnecting = callStatus === 'reconnecting';

    const displayName = isIncomingCall
        ? incomingCallData?.callerName || 'Utilisateur'
        : activeCall?.otherUserName || 'Utilisateur';

    const isOnDiscussionPage =
        activeCall && pathname?.includes(`/chat/discussion/${activeCall.conversationId}`);

    // Mode compact : pas sur la page de discussion
    const compactMode = !isOnDiscussionPage && callStatus === 'connected';

    const handleRejoin = () => {
        if (activeCall) router.push(`/chat/discussion/${activeCall.conversationId}`);
    };

    // Détection mobile pour afficher le bouton de basculement caméra
    const isMobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // ── Mode compact ────────────────────────────────────────────────────────────
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
                    <p className="truncate font-medium text-white">
                        {callType === 'video' ? 'Appel vidéo avec' : 'Appel avec'} {displayName}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-white/80">
                        <Clock className="h-3 w-3" />
                        {formatDuration(callDuration)}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className={cn('h-8 w-8 p-0 text-white/80 hover:bg-white/20', isMuted && 'bg-white/20')}
                        onClick={toggleMute}
                        aria-label={isMuted ? 'Activer le micro' : 'Couper le micro'}
                    >
                        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className={cn('h-8 w-8 p-0 text-white/80 hover:bg-white/20', isSpeakerOn && 'bg-white/20')}
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
                {/* Audio distant en mode compact — RemoteVideo mémoïsé évite les re-renders */}
                {remoteStream && isVideoCall && (
                    <RemoteVideo 
                        stream={remoteStream} 
                        hidden 
                        onRef={(el) => {
                            setRemoteVideoRef(el);
                            (remoteVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
                        }} 
                    />
                )}
            </div>
        );
    }

    // ── Mode plein écran ────────────────────────────────────────────────────────
    const isVideoCallConnected = (callStatus === 'connected' || isReconnecting) && isVideoCall;

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden">

            {/* ── Vidéo connectée (plein écran) ────────────────────────────────── */}
            {isVideoCallConnected ? (
                <>
                    {/* Vidéo distante — plein écran, jamais interrompue par les re-renders */}
                    <div className="absolute inset-0">
                        {remoteStream ? (
                            <>
                                <RemoteVideo
                                    stream={remoteStream}
                                    onRef={(el) => {
                                        setRemoteVideoRef(el);
                                        (remoteVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
                                    }}
                                    className={cn(
                                        'w-full h-full object-cover',
                                        remoteStream.getVideoTracks().length === 0 && 'hidden'
                                    )}
                                />
                                {/* Avatar si caméra distante coupée */}
                                {remoteStream.getVideoTracks().length === 0 && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950">
                                        <Avatar className="w-32 h-32 border-4 border-white/20">
                                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                                            <AvatarFallback className="text-4xl bg-primary/30 text-white">
                                                {displayName[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                    </div>
                                )}
                            </>
                        ) : (
                            /* Pas encore de flux distant */
                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950">
                                <Avatar className="w-32 h-32 border-4 border-white/20">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                                    <AvatarFallback className="text-4xl bg-primary/30 text-white">
                                        {displayName[0]}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                        )}
                    </div>

                    {/* Vidéo locale — PiP coin bas-droit (style WhatsApp), mémoïsée */}
                    {localStream && (
                        <div className="absolute bottom-24 right-4 w-28 h-36 md:w-36 md:h-48 rounded-xl overflow-hidden border-2 border-white/30 shadow-2xl bg-black z-10">
                            {isVideoOn ? (
                                <LocalVideo
                                    stream={localStream}
                                    className="w-full h-full object-cover scale-x-[-1]"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                    <VideoOff className="w-10 h-10 text-white/50" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Barre info haut — isolée, ne touche PAS aux vidéos */}
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent z-10 pointer-events-none">
                        <div className="flex items-center gap-3 flex-wrap">
                            {isReconnecting ? (
                                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                            ) : (
                                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            )}
                            <span className="font-semibold text-white drop-shadow-lg">{displayName}</span>
                            <QualityBadge quality={connectionQuality ?? ''} isReconnecting={isReconnecting} />
                            <VADIndicator isSpeaking={remoteIsSpeaking} displayName={displayName} />
                            {isVideoAutoDisabled && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/40 text-amber-100 flex items-center gap-1">
                                    <VideoOff className="w-3 h-3" />
                                    Vidéo auto-off
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 text-white/90">
                            <Clock className="w-4 h-4" />
                            <span className="font-mono text-sm">{formatDuration(callDuration)}</span>
                        </div>
                    </div>
                </>
            ) : callStatus === 'connected' && !isVideoCall ? (
                /* ── Appel audio connecté ── */
                <>
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
                        <Avatar className="w-32 h-32 border-4 border-white/20 ring-4 ring-white/5">
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                            <AvatarFallback className="text-4xl bg-primary/30 text-white">
                                {displayName[0]}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none">
                        <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="font-semibold text-white drop-shadow-lg">{displayName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-white/90">
                            <Clock className="w-4 h-4" />
                            <span className="font-mono text-sm">{formatDuration(callDuration)}</span>
                        </div>
                    </div>
                    {/* Audio distant (élément caché, mémoïsé) */}
                    {remoteStream && (
                        <RemoteVideo stream={remoteStream} hidden onRef={setRemoteVideoRef} />
                    )}
                </>
            ) : (
                /* ── État entrant / composition / connexion ── */
                <>
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
                        {(callStatus === 'dialing' || callStatus === 'ringing' || callStatus === 'connecting') && (
                            <>
                                <div className="absolute w-44 h-44 rounded-full bg-primary/10 animate-pulse" />
                                <div
                                    className="absolute w-64 h-64 rounded-full bg-primary/5 animate-pulse"
                                    style={{ animationDelay: '0.5s' }}
                                />
                                <div
                                    className="absolute w-80 h-80 rounded-full bg-primary/3 animate-pulse"
                                    style={{ animationDelay: '1s' }}
                                />
                            </>
                        )}
                    </div>
                    <div className={cn('relative z-10 flex flex-col items-center mt-24', isIncomingCall && 'animate-bounce-gentle')}>
                        <div className="bg-white/10 p-1.5 rounded-full ring-4 ring-white/10 mb-6">
                            <Avatar className="w-28 h-28 border-2 border-white/20">
                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                                <AvatarFallback className="text-3xl bg-primary/20 text-white">
                                    {displayName[0]}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-lg">{displayName}</h3>
                        <p className="text-white/70 mb-8 text-sm drop-shadow">
                            {isIncomingCall && (isVideoCall ? '📹 Appel vidéo entrant...' : '📞 Appel audio entrant...')}
                            {callStatus === 'dialing' && 'Appel en cours...'}
                            {callStatus === 'connecting' && 'Connexion en cours...'}
                        </p>
                    </div>
                </>
            )}

            {/* ── Barre de contrôles (identique dans tous les états) ────────────── */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 sm:gap-5 pb-6 sm:pb-10 pt-4 sm:pt-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-20 overflow-x-auto">
                {isIncomingCall ? (
                    <>
                        <div className="flex flex-col items-center gap-2">
                            <Button
                                size="lg"
                                className="rounded-full w-14 h-14 sm:w-16 sm:h-16 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 transition-transform active:scale-95"
                                onClick={rejectCall}
                            >
                                <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                            </Button>
                            <span className="text-white/60 text-xs">Refuser</span>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <Button
                                size="lg"
                                className="rounded-full w-14 h-14 sm:w-16 sm:h-16 bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30 animate-pulse transition-transform active:scale-95"
                                onClick={answerCall}
                            >
                                <PhoneIncoming className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                            </Button>
                            <span className="text-white/60 text-xs">Répondre</span>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Micro */}
                        <div className="flex flex-col items-center gap-1 sm:gap-2">
                            <Button
                                size="lg"
                                className={cn(
                                    'rounded-full w-12 h-12 sm:w-14 sm:h-14 shadow-lg transition-all active:scale-95',
                                    isMuted ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                                )}
                                onClick={toggleMute}
                                aria-label={isMuted ? 'Activer le micro' : 'Couper le micro'}
                            >
                                {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
                            </Button>
                            <span className="text-white/60 text-[10px] sm:text-xs">{isMuted ? 'Micro off' : 'Micro'}</span>
                        </div>

                        {/* Caméra (appel vidéo uniquement) */}
                        {isVideoCall && (
                            <div className="flex flex-col items-center gap-1 sm:gap-2">
                                <Button
                                    size="lg"
                                    className={cn(
                                        'rounded-full w-12 h-12 sm:w-14 sm:h-14 shadow-lg transition-all active:scale-95',
                                        !isVideoOn ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                                    )}
                                    onClick={toggleVideoCamera}
                                    aria-label={isVideoOn ? 'Couper la caméra' : 'Activer la caméra'}
                                >
                                    {isVideoOn ? <Video className="w-5 h-5 sm:w-6 sm:h-6" /> : <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" />}
                                </Button>
                                <span className="text-white/60 text-[10px] sm:text-xs">{isVideoOn ? 'Caméra' : 'Cam. off'}</span>
                            </div>
                        )}

                        {/* Basculement caméra (mobile uniquement) */}
                        {isVideoCall && isMobile && callStatus === 'connected' && (
                            <div className="flex flex-col items-center gap-1 sm:gap-2">
                                <Button
                                    size="lg"
                                    className="rounded-full w-12 h-12 sm:w-14 sm:h-14 shadow-lg transition-all active:scale-95 bg-white/20 text-white hover:bg-white/30"
                                    onClick={toggleCameraFacing}
                                    aria-label="Changer de caméra"
                                >
                                    <FlipHorizontal className="w-5 h-5 sm:w-6 sm:h-6" />
                                </Button>
                                <span className="text-white/60 text-[10px] sm:text-xs">
                                    {facingMode === 'user' ? 'Face' : 'Arrière'}
                                </span>
                            </div>
                        )}

                        {/* Picture-in-Picture */}
                        {isVideoCall && isPiPSupported && callStatus === 'connected' && (
                            <div className="flex flex-col items-center gap-1 sm:gap-2">
                                <Button
                                    size="lg"
                                    className={cn(
                                        'rounded-full w-12 h-12 sm:w-14 sm:h-14 shadow-lg transition-all active:scale-95',
                                        isPiPActive ? 'bg-primary/60 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                                    )}
                                    onClick={togglePiP}
                                    aria-label="Picture-in-Picture"
                                >
                                    <PictureInPicture className="w-5 h-5 sm:w-6 sm:h-6" />
                                </Button>
                                <span className="text-white/60 text-[10px] sm:text-xs">PiP</span>
                            </div>
                        )}

                        {/* Haut-parleur */}
                        <div className="flex flex-col items-center gap-1 sm:gap-2">
                            <Button
                                size="lg"
                                className={cn(
                                    'rounded-full w-12 h-12 sm:w-14 sm:h-14 shadow-lg transition-all active:scale-95',
                                    isSpeakerOn ? 'bg-primary/60 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                                )}
                                onClick={toggleSpeaker}
                                aria-label="Haut-parleur"
                            >
                                <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
                            </Button>
                            <span className="text-white/60 text-[10px] sm:text-xs">HP</span>
                        </div>

                        {/* Raccrocher */}
                        <div className="flex flex-col items-center gap-1 sm:gap-2">
                            <Button
                                size="lg"
                                className="rounded-full w-14 h-14 sm:w-16 sm:h-16 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 transition-transform active:scale-95"
                                onClick={endCall}
                                aria-label="Raccrocher"
                            >
                                <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                            </Button>
                            <span className="text-white/60 text-[10px] sm:text-xs">Raccrocher</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
