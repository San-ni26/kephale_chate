'use client';

/**
 * Contexte global pour les appels vocaux.
 * La logique WebRTC vit ici pour que l'appel continue même quand on quitte la page de discussion.
 */

import {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    useEffect,
} from 'react';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import { startRingtone, stopRingtone } from '@/src/lib/ringtone';

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
    {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
    {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
];

export type CallStatus =
    | 'idle'
    | 'dialing'
    | 'ringing'
    | 'connecting'
    | 'connected'
    | 'ended';

export interface IncomingCallData {
    callerId: string;
    callerName?: string;
    offer: RTCSessionDescriptionInit;
    conversationId: string;
}

export interface ActiveCallInfo {
    conversationId: string;
    otherUserId: string;
    otherUserName: string;
}

interface CallContextValue {
    isInCall: boolean;
    setInCall: (value: boolean) => void;

    // État de l'appel
    callStatus: CallStatus;
    isIncomingCall: boolean;
    incomingCallData: IncomingCallData | null;
    activeCall: ActiveCallInfo | null;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isMuted: boolean;
    isSpeakerOn: boolean;
    callDuration: number;
    connectionQuality: 'good' | 'fair' | 'poor' | null;

    // Actions
    startCall: (conversationId: string, otherUserId: string, otherUserName: string) => Promise<void>;
    answerCall: () => Promise<void>;
    answerCallWithData: (data: IncomingCallData) => Promise<void>;
    rejectCall: () => void;
    endCall: () => void;
    toggleMute: () => void;
    toggleSpeaker: () => void;

    // Pour les appels entrants (sessionStorage, etc.)
    setIncomingCallData: (data: IncomingCallData | null) => void;

    // Pré-chauffage micro
    prewarmMedia: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
    const [isInCall, setIsInCall] = useState(false);
    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [incomingCallData, setIncomingCallDataState] = useState<IncomingCallData | null>(null);
    const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | null>(null);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const iceCandidateBufferRef = useRef<RTCIceCandidate[]>([]);
    const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const activeCallNotificationRef = useRef<Notification | null>(null);
    const activeCallRef = useRef(activeCall);
    activeCallRef.current = activeCall;

    const setInCall = useCallback((value: boolean) => setIsInCall(value), []);

    const { userChannel, isConnected } = useWebSocket();

    localStreamRef.current = localStream;

    const emitCallSignal = useCallback(async (event: string, data: Record<string, unknown>) => {
        try {
            await fetchWithAuth('/api/call/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event, ...data }),
            });
        } catch (err) {
            console.error(`[Call] Signal ${event} error:`, err);
        }
    }, []);

    const cleanupCall = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((t) => t.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (callTimerRef.current) {
            clearInterval(callTimerRef.current);
            callTimerRef.current = null;
        }
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }
        iceCandidateBufferRef.current = [];
        if (activeCallNotificationRef.current) {
            activeCallNotificationRef.current.close();
            activeCallNotificationRef.current = null;
        }
        stopRingtone();
        setLocalStream(null);
        setActiveCall(null);
        setIsIncomingCall(false);
        setIsInCall(false);
        setCallStatus('idle');
        setIncomingCallDataState(null);
        setRemoteStream(null);
        setCallDuration(0);
        setIsMuted(false);
        setIsSpeakerOn(false);
        setConnectionQuality(null);
    }, []);

    const startCallTimer = useCallback(() => {
        setCallDuration(0);
        callTimerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
        }, 1000);
    }, []);

    const endCall = useCallback(() => {
        const info = activeCall;
        if (info) {
            emitCallSignal('call:end', { targetUserId: info.otherUserId });
        }
        cleanupCall();
    }, [activeCall, emitCallSignal, cleanupCall]);

    const initializePeerConnection = useCallback(
        (otherUserId: string) => {
            iceCandidateBufferRef.current = [];
            const pc = new RTCPeerConnection({
                iceServers: ICE_SERVERS,
                iceCandidatePoolSize: 10,
                bundlePolicy: 'max-bundle',
            });

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    emitCallSignal('call:ice-candidate', {
                        targetUserId: otherUserId,
                        candidate: event.candidate,
                    });
                }
            };

            pc.ontrack = (event) => {
                const stream = event.streams[0];
                setRemoteStream(stream);
                if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
            };

            pc.oniceconnectionstatechange = () => {
                const state = pc.iceConnectionState;
                if (state === 'connected' || state === 'completed') {
                    setConnectionQuality('good');
                } else if (state === 'failed' || state === 'disconnected') {
                    setConnectionQuality('poor');
                    if (state === 'failed') toast.error('Connexion instable...');
                }
            };

            peerConnectionRef.current = pc;
            return pc;
        },
        [emitCallSignal]
    );

    const addBufferedIceCandidates = useCallback(async () => {
        const pc = peerConnectionRef.current;
        const buffer = iceCandidateBufferRef.current;
        if (!pc || buffer.length === 0) return;
        for (const candidate of buffer) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('[WebRTC] Failed to add buffered ICE candidate', e);
            }
        }
        iceCandidateBufferRef.current = [];
    }, []);

    const dialingRef = useRef(false);

    const startCall = useCallback(
        async (conversationId: string, otherUserId: string, otherUserName: string) => {
            setIsInCall(true);
            setActiveCall({ conversationId, otherUserId, otherUserName });
            setCallStatus('dialing');
            dialingRef.current = true;

            callTimeoutRef.current = setTimeout(() => {
                if (dialingRef.current) {
                    dialingRef.current = false;
                    toast.info('Pas de reponse');
                    endCall();
                }
            }, 45000);

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                setLocalStream(stream);

                const pc = initializePeerConnection(otherUserId);
                stream.getTracks().forEach((track) => pc.addTrack(track, stream));

                setCallStatus('connecting');
                const offer = await pc.createOffer({ iceRestart: false });
                await pc.setLocalDescription(offer);

                await emitCallSignal('call:invite', {
                    recipientId: otherUserId,
                    offer,
                    conversationId,
                });
            } catch (err) {
                console.error('[Call] Start error:', err);
                toast.error("Impossible d'acceder au microphone");
                cleanupCall();
            }
        },
        [initializePeerConnection, emitCallSignal, cleanupCall, endCall]
    );

    const answerCall = useCallback(async () => {
        const data = incomingCallData;
        if (!data) return;

        stopRingtone();
        setIsIncomingCall(false);
        setIsInCall(true);
        setActiveCall({
            conversationId: data.conversationId,
            otherUserId: data.callerId,
            otherUserName: data.callerName || 'Utilisateur',
        });
        setCallStatus('connecting');
        setIncomingCallDataState(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            setLocalStream(stream);

            const pc = initializePeerConnection(data.callerId);
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer as RTCSessionDescriptionInit));
            await addBufferedIceCandidates();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await emitCallSignal('call:answer', {
                callerId: data.callerId,
                answer,
                conversationId: data.conversationId,
            });

            setCallStatus('connected');
            startCallTimer();
        } catch (err) {
            console.error('[Call] Answer error:', err);
            toast.error('Erreur lors de la reponse');
            cleanupCall();
        }
    }, [
        incomingCallData,
        initializePeerConnection,
        addBufferedIceCandidates,
        emitCallSignal,
        startCallTimer,
        cleanupCall,
    ]);

    const answerCallWithData = useCallback(
        async (data: IncomingCallData) => {
            stopRingtone();
            setIsIncomingCall(false);
            setIsInCall(true);
            setActiveCall({
                conversationId: data.conversationId,
                otherUserId: data.callerId,
                otherUserName: data.callerName || 'Utilisateur',
            });
            setCallStatus('connecting');
            setIncomingCallDataState(null);

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                setLocalStream(stream);

                const pc = initializePeerConnection(data.callerId);
                stream.getTracks().forEach((track) => pc.addTrack(track, stream));

                await pc.setRemoteDescription(new RTCSessionDescription(data.offer as RTCSessionDescriptionInit));
                await addBufferedIceCandidates();

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                await emitCallSignal('call:answer', {
                    callerId: data.callerId,
                    answer,
                    conversationId: data.conversationId,
                });

                setCallStatus('connected');
                startCallTimer();
            } catch (err) {
                console.error('[Call] Answer error:', err);
                toast.error('Erreur lors de la reponse');
                cleanupCall();
            }
        },
        [initializePeerConnection, addBufferedIceCandidates, emitCallSignal, startCallTimer, cleanupCall]
    );

    const rejectCall = useCallback(() => {
        stopRingtone();
        const data = incomingCallData;
        if (data) {
            emitCallSignal('call:reject', { callerId: data.callerId });
        }
        setIncomingCallDataState(null);
        setIsIncomingCall(false);
        setCallStatus('idle');
    }, [incomingCallData, emitCallSignal]);

    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((track) => {
                track.enabled = !track.enabled;
            });
            setIsMuted((prev) => !prev);
        }
    }, []);

    const toggleSpeaker = useCallback(async () => {
        const audio = remoteAudioRef.current;
        if (!audio || typeof (audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId !== 'function') return;
        try {
            if (isSpeakerOn) {
                await (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId('');
            } else {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const outputs = devices.filter((d) => d.kind === 'audiooutput');
                const speaker =
                    outputs.find(
                        (d) =>
                            d.label.toLowerCase().includes('speaker') ||
                            d.label.toLowerCase().includes('haut-parleur')
                    ) || outputs[0];
                if (speaker?.deviceId) {
                    await (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(speaker.deviceId);
                }
            }
            setIsSpeakerOn((prev) => !prev);
        } catch (e) {
            console.warn('[Call] Speaker toggle:', e);
        }
    }, [isSpeakerOn]);

    const setIncomingCallData = useCallback((data: IncomingCallData | null) => {
        setIncomingCallDataState(data);
        if (data) {
            setIsIncomingCall(true);
            setCallStatus('ringing');
            startRingtone();
        } else {
            stopRingtone();
        }
    }, []);

    const prewarmMedia = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
        } catch {
            // Ignore
        }
    }, []);

    // Sync isInCall
    useEffect(() => {
        setIsInCall(callStatus !== 'idle' && callStatus !== 'ended' && !!activeCall);
    }, [callStatus, activeCall]);

    // Écoute des événements Pusher
    useEffect(() => {
        if (!userChannel || !isConnected) return;

        const handleIncomingCall = (data: { callerId: string; callerName?: string; offer: any; conversationId: string }) => {
            if (activeCallRef.current) {
                emitCallSignal('call:reject', { callerId: data.callerId });
                return;
            }
            setIncomingCallDataState(data);
            setIsIncomingCall(true);
            setCallStatus('ringing');
            startRingtone();
        };

        const handleCallAnswered = async (data: { answer: any }) => {
            dialingRef.current = false;
            const pc = peerConnectionRef.current;
            if (!pc) return;
            if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
            }
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                const buffer = iceCandidateBufferRef.current;
                for (const candidate of buffer) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) {
                        console.warn('[WebRTC] Failed to add buffered ICE candidate', e);
                    }
                }
                iceCandidateBufferRef.current = [];
                setCallStatus('connected');
                startCallTimer();
            } catch (e) {
                console.error('[Call] setRemoteDescription error:', e);
            }
        };

        const handleCallRejected = () => {
            toast.info('Appel rejete');
            cleanupCall();
        };

        const handleCallEnded = () => {
            toast.info('Appel termine');
            cleanupCall();
        };

        const handleIceCandidate = async (data: { candidate: any }) => {
            const pc = peerConnectionRef.current;
            if (!pc) return;
            if (pc.remoteDescription) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.warn('[WebRTC] Failed to add ICE candidate', e);
                }
            } else {
                iceCandidateBufferRef.current.push(data.candidate);
            }
        };

        userChannel.bind('call:incoming', handleIncomingCall);
        userChannel.bind('call:answered', handleCallAnswered);
        userChannel.bind('call:rejected', handleCallRejected);
        userChannel.bind('call:ended', handleCallEnded);
        userChannel.bind('call:ice-candidate', handleIceCandidate);

        return () => {
            userChannel.unbind('call:incoming', handleIncomingCall);
            userChannel.unbind('call:answered', handleCallAnswered);
            userChannel.unbind('call:rejected', handleCallRejected);
            userChannel.unbind('call:ended', handleCallEnded);
            userChannel.unbind('call:ice-candidate', handleIceCandidate);
        };
    }, [userChannel, isConnected, emitCallSignal, startCallTimer, cleanupCall]);

    // Auto-play remote audio
    useEffect(() => {
        const audio = remoteAudioRef.current;
        if (!audio || !remoteStream) return;
        audio.srcObject = remoteStream;
        audio.play().catch(() => {});
    }, [remoteStream]);

    // Sync SW / visibility
    useEffect(() => {
        const onSwMessage = (e: MessageEvent) => {
            if (e.data?.type === 'CALL_ENDED_BY_NOTIFICATION') cleanupCall();
        };
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', onSwMessage);
        }
        return () => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.removeEventListener('message', onSwMessage);
            }
        };
    }, [cleanupCall]);

    // Notification persistante "Appel en cours" (Raccrocher / Ouvrir)
    useEffect(() => {
        if (callStatus !== 'connected' || !activeCall) return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

        let notif: Notification | null = null;
        try {
            notif = new Notification(`Appel en cours - ${activeCall.otherUserName}`, {
                body: 'Appuyez pour revenir ou raccrocher',
                icon: '/icons/icon-192x192.png',
                tag: `active-call-${activeCall.conversationId}`,
                requireInteraction: true,
                silent: true,
                data: {
                    type: 'active_call',
                    conversationId: activeCall.conversationId,
                    targetUserId: activeCall.otherUserId,
                    url: `/chat/discussion/${activeCall.conversationId}`,
                },
                actions: [
                    { action: 'hangup', title: 'Raccrocher' },
                    { action: 'open', title: 'Ouvrir' },
                ],
            } as NotificationOptions);
            activeCallNotificationRef.current = notif;
            notif.onclick = () => {
                window.focus();
                notif?.close();
                activeCallNotificationRef.current = null;
            };
        } catch {
            // NotAllowedError
        }
        return () => {
            notif?.close();
            activeCallNotificationRef.current = null;
        };
    }, [callStatus, activeCall]);

    const value: CallContextValue = {
        isInCall,
        setInCall,
        callStatus,
        isIncomingCall,
        incomingCallData,
        activeCall,
        localStream,
        remoteStream,
        isMuted,
        isSpeakerOn,
        callDuration,
        connectionQuality,
        startCall,
        answerCall,
        answerCallWithData,
        rejectCall,
        endCall,
        toggleMute,
        toggleSpeaker,
        setIncomingCallData,
        prewarmMedia,
    };

    return (
        <CallContext.Provider value={value}>
            {children}
            {/* Référence audio pour le flux distant - doit rester montée */}
            {(activeCall || remoteStream) && (
                <audio
                    ref={(el) => {
                        remoteAudioRef.current = el;
                        if (el && remoteStream) el.srcObject = remoteStream;
                    }}
                    autoPlay
                    playsInline
                    className="hidden"
                />
            )}
        </CallContext.Provider>
    );
}

export function useCallContext() {
    return useContext(CallContext);
}
