'use client';

/**
 * Overlay d'appel global - affiché sur toutes les pages quand un appel est actif ou entrant.
 * Permet de continuer l'appel même en quittant la page de discussion.
 */

import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { useCallContext } from '@/src/contexts/CallContext';
import { safePlay } from '@/src/lib/safe-media-play';
import { cn } from '@/src/lib/utils';
import {
    Phone,
    PhoneOff,
    PhoneIncoming,
    Mic,
    MicOff,
    Volume2,
    Video,
    VideoOff,
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
        callType,
        localStream,
        remoteStream,
        isMuted,
        isVideoOn,
        isSpeakerOn,
        callDuration,
        connectionQuality,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideoCamera,
        toggleSpeaker,
        setRemoteVideoRef,
    } = ctx;

    const isVideoCall = activeCall?.callType === 'video' || (isIncomingCall && incomingCallData?.isVideo !== false);

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
                    <p className="truncate font-medium text-white">
                        {callType === 'video' ? 'Appel video avec' : 'Appel avec'} {displayName}
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
                {/* Vidéo cachée pour lecture audio en mode compact (appel vidéo uniquement) */}
                {remoteStream && isVideoCall && (
                    <video
                        ref={(el) => {
                            setRemoteVideoRef(el);
                            if (el) {
                                el.srcObject = remoteStream;
                                safePlay(el);
                            }
                        }}
                        autoPlay
                        playsInline
                        muted={false}
                        className="hidden"
                    />
                )}
            </div>
        );
    }

    // Mode plein écran : appel connecté (vidéo ou audio) ou entrant (avatar + boutons)
    const isVideoCallConnected = callStatus === 'connected' && isVideoCall;

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden">
            {/* Zone vidéo principale - appel vidéo connecté */}
            {isVideoCallConnected ? (
                <>
                    {/* Vidéo distante - plein écran (ou avatar si caméra coupée) */}
                    <div className="absolute inset-0">
                        {remoteStream && (
                            <video
                                ref={(el) => {
                                    setRemoteVideoRef(el);
                                    if (el) {
                                        el.srcObject = remoteStream;
                                        safePlay(el);
                                    }
                                }}
                                autoPlay
                                playsInline
                                muted={false}
                                className={cn(
                                    'w-full h-full',
                                    remoteStream.getVideoTracks().length > 0 ? 'object-cover' : 'hidden'
                                )}
                            />
                        )}
                        {(!remoteStream || remoteStream.getVideoTracks().length === 0) && (
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

                    {/* Vidéo locale - PiP coin bas-droit (style WhatsApp) */}
                    {localStream && (
                        <div className="absolute bottom-24 right-4 w-28 h-36 md:w-36 md:h-48 rounded-xl overflow-hidden border-2 border-white/30 shadow-2xl bg-black">
                            {isVideoOn ? (
                                <video
                                    ref={(el) => {
                                        if (el && localStream) {
                                            el.srcObject = localStream;
                                            el.muted = true;
                                            safePlay(el);
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover scale-x-[-1]"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                    <VideoOff className="w-10 h-10 text-white/50" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Barre d'info en haut */}
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
                        <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="font-medium text-white drop-shadow-lg">{displayName}</span>
                            {connectionQuality && (
                                <span
                                    className={cn(
                                        'text-xs px-2 py-0.5 rounded-full',
                                        connectionQuality === 'good' && 'bg-green-500/40 text-green-100',
                                        connectionQuality === 'fair' && 'bg-amber-500/40 text-amber-100',
                                        connectionQuality === 'poor' && 'bg-red-500/40 text-red-100'
                                    )}
                                >
                                    {connectionQuality === 'good' && 'Bonne connexion'}
                                    {connectionQuality === 'fair' && 'Moyenne'}
                                    {connectionQuality === 'poor' && 'Instable'}
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
                /* Appel audio connecté - avatar + lecture audio */
                <>
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
                        <Avatar className="w-32 h-32 border-4 border-white/20">
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                            <AvatarFallback className="text-4xl bg-primary/30 text-white">
                                {displayName[0]}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
                        <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="font-medium text-white drop-shadow-lg">{displayName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-white/90">
                            <Clock className="w-4 h-4" />
                            <span className="font-mono text-sm">{formatDuration(callDuration)}</span>
                        </div>
                    </div>
                    {/* Lecture audio distante (élément caché) */}
                    {remoteStream && (
                        <video
                            ref={(el) => {
                                setRemoteVideoRef(el);
                                if (el) {
                                    el.srcObject = remoteStream;
                                    safePlay(el);
                                }
                            }}
                            autoPlay
                            playsInline
                            muted={false}
                            className="hidden"
                        />
                    )}
                </>
            ) : (
                /* État entrant / composition / connexion - avatar + animations */
                <>
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
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
                    <div className={cn('relative z-10 flex flex-col items-center', isIncomingCall && 'animate-bounce')}>
                        <div className={cn('bg-white/10 p-1 rounded-full', 'ring-4 ring-white/10')}>
                            <Avatar className="w-28 h-28 border-2 border-white/20">
                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                                <AvatarFallback className="text-3xl bg-primary/20 text-white">
                                    {displayName[0]}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                        <h3 className="text-2xl font-bold text-white mt-6 mb-1 drop-shadow-lg">{displayName}</h3>
                        <p className="text-white/80 mb-8 text-sm drop-shadow">
                            {isIncomingCall && (isVideoCall ? 'Appel video entrant...' : 'Appel audio entrant...')}
                            {callStatus === 'dialing' && 'Appel en cours...'}
                            {callStatus === 'connecting' && 'Connexion en cours...'}
                        </p>
                    </div>
                </>
            )}

            {/* Barre de contrôles en bas */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 pb-8 pt-4 bg-gradient-to-t from-black/80 to-transparent">
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
                                    isMuted ? 'bg-red-500/50 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                                )}
                                onClick={toggleMute}
                                aria-label={isMuted ? 'Activer le micro' : 'Couper le micro'}
                            >
                                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                            </Button>
                            <span className="text-white/60 text-xs">{isMuted ? 'Micro coupé' : 'Micro'}</span>
                        </div>
                        {isVideoCall && (
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    size="lg"
                                    className={cn(
                                        'rounded-full w-14 h-14 shadow-lg',
                                        !isVideoOn ? 'bg-red-500/50 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                                    )}
                                    onClick={toggleVideoCamera}
                                    aria-label={isVideoOn ? 'Couper la camera' : 'Activer la camera'}
                                >
                                    {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                                </Button>
                                <span className="text-white/60 text-xs">{isVideoOn ? 'Camera' : 'Camera coupée'}</span>
                            </div>
                        )}
                        <div className="flex flex-col items-center gap-2">
                            <Button
                                size="lg"
                                className={cn(
                                    'rounded-full w-14 h-14 shadow-lg',
                                    isSpeakerOn ? 'bg-primary/50 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                                )}
                                onClick={toggleSpeaker}
                                aria-label="Haut-parleur"
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
                                aria-label="Raccrocher"
                            >
                                <PhoneOff className="w-7 h-7 text-white" />
                            </Button>
                            <span className="text-white/60 text-xs">Raccrocher</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
