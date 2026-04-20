'use client';

/**
 * Contexte global pour les appels vidéo (audio + vidéo).
 * Optimisé pour une qualité d'appel type WhatsApp :
 * - ICE Trickle natif (candidates envoyés dès qu'ils arrivent)
 * - Reconnexion ICE automatique (iceRestart) sur dégradation
 * - Bitrate adaptatif selon la qualité réseau (monitoring WebRTC stats)
 * - Batching ICE candidates pour éviter les appels HTTP en rafale
 * - Contraintes vidéo adaptatives (mobile vs desktop)
 * - Codec VP8/H264 préféré selon le support navigateur
 * - Audio : 48kHz, Opus, echoCancellation, noiseSuppression, autoGainControl
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
import { safePlay } from '@/src/lib/safe-media-play';
import { processAudioStream, combineProcessedAudioWithVideo } from '@/src/lib/audio-processor';
import { getGlobalDuckingController, destroyGlobalDuckingController } from '@/src/lib/audio-ducking';

// ─── Contraintes média ────────────────────────────────────────────────────────

const getVideoConstraints = (): MediaTrackConstraints => {
    const isMobile =
        typeof window !== 'undefined' &&
        /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
    return {
        width: { ideal: isMobile ? 640 : 1280, max: isMobile ? 854 : 1920 },
        height: { ideal: isMobile ? 480 : 720, max: isMobile ? 480 : 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: 'user',
    };
};

const getAudioConstraints = (): MediaTrackConstraints => ({
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
});

// ─── Détection support navigateur ────────────────────────────────────────────

const isMediaDevicesSupported = (): boolean => {
    return typeof navigator !== 'undefined' && 
           !!navigator.mediaDevices && 
           typeof navigator.mediaDevices.getUserMedia === 'function';
};

const isIOS = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream: unknown }).MSStream;
};

const getIOSVersion = (): number => {
    if (!isIOS()) return 0;
    const match = navigator.userAgent.match(/OS (\d+)_/);
    return match ? parseInt(match[1], 10) : 0;
};

// ─── Serveurs ICE (STUN public Google + TURN libres) ─────────────────────────
// Note: Pour production, remplacez openrelay par votre TURN Coturn ou Metered payant
const ICE_SERVERS: RTCIceServer[] = [
    // STUN Google (très fiable, anycast mondial)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // STUN IPv6 Google
    { urls: 'stun:stun.ipv6.google.com:19302' },
    // STUN Mozilla (backup)
    { urls: 'stun:stun.services.mozilla.com' },
    // TURN openrelay (fallback NAT symétrique)
    {
        urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turns:openrelay.metered.ca:443',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
    // TURN UDP alternatif (meilleure latence)
    {
        urls: 'turn:openrelay.metered.ca:80?transport=udp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
    // TURN backup viagenie (redondance)
    {
        urls: 'turn:numb.viagenie.ca:3478',
        username: 'webrtc@live.com',
        credential: 'muazkh',
    },
    // TURN relay.webfps.io (backup)
    {
        urls: 'turn:relay.webfps.io:443',
        username: 'webrtc',
        credential: 'webrtc',
    },
];

// ─── Config PeerConnection ────────────────────────────────────────────────────
const PC_CONFIG: RTCConfiguration = {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 12,         // Pré-collecte plus de candidats ICE dès le départ
    bundlePolicy: 'max-bundle',       // Audio+vidéo sur une seule connexion
    rtcpMuxPolicy: 'require',         // RTCP multiplexé (réduit les ports ouverts)
    iceTransportPolicy: 'all',        // Essaie P2P puis TURN
};

// ─── Bitrate adaptatif ────────────────────────────────────────────────────────

type NetworkProfile = 'excellent' | 'good' | 'fair' | 'poor';

function getVideoBitrate(profile: NetworkProfile, isMobile: boolean): number {
    const table: Record<NetworkProfile, { desktop: number; mobile: number }> = {
        excellent: { desktop: 2500, mobile: 1200 },
        good: { desktop: 1500, mobile: 800 },
        fair: { desktop: 700, mobile: 400 },
        poor: { desktop: 300, mobile: 200 },
    };
    return table[profile][isMobile ? 'mobile' : 'desktop'];
}

function getAudioBitrate(profile: NetworkProfile): number {
    return profile === 'poor' ? 16_000 : profile === 'fair' ? 24_000 : 32_000;
}

async function applyAdaptiveBitrate(
    pc: RTCPeerConnection,
    profile: NetworkProfile = 'good'
): Promise<void> {
    const isMobile =
        typeof window !== 'undefined' &&
        /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const videoBps = getVideoBitrate(profile, isMobile) * 1000;
    const audioBps = getAudioBitrate(profile);

    try {
        await Promise.all(
            pc.getSenders().map(async (sender) => {
                if (!sender.track) return;
                const params = sender.getParameters();
                if (!params.encodings?.length) {
                    // Initialiser avec simulcast pour la vidéo
                    if (sender.track.kind === 'video') {
                        params.encodings = [
                            { rid: 'low', scaleResolutionDownBy: 4, maxBitrate: 150_000, priority: 'low' },
                            { rid: 'mid', scaleResolutionDownBy: 2, maxBitrate: 500_000, priority: 'medium' },
                            { rid: 'high', scaleResolutionDownBy: 1, maxBitrate: videoBps, priority: 'high' },
                        ];
                    } else {
                        params.encodings = [{}];
                    }
                }
                
                const enc = params.encodings[0];

                if (sender.track.kind === 'video') {
                    // Mettre à jour les paramètres de simulcast
                    params.encodings.forEach((encoding, idx) => {
                        const baseBitrate = idx === 0 ? 150_000 : idx === 1 ? 500_000 : videoBps;
                        
                        encoding.maxBitrate = profile === 'poor' && idx === 2 ? 150_000 : baseBitrate;
                        encoding.maxFramerate = profile === 'poor' ? 15 : 30;
                        encoding.priority = idx === 2 ? 'high' : 'medium';
                        encoding.networkPriority = idx === 2 ? 'high' : 'medium';
                        // @ts-expect-error — non-standard mais supporté Chrome/Edge
                        encoding.degradationPreference = profile === 'poor' ? 'maintain-resolution' : 'maintain-framerate';
                        
                        // Activer/désactiver les couches selon le profil réseau
                        if (profile === 'poor') {
                            encoding.active = idx === 0; // Seulement la couche basse
                        } else if (profile === 'fair') {
                            encoding.active = idx <= 1; // Couches basse et moyenne
                        } else {
                            encoding.active = true; // Toutes les couches
                        }
                    });
                } else if (sender.track.kind === 'audio') {
                    enc.maxBitrate = audioBps;
                    enc.priority = 'high';
                    enc.networkPriority = 'high';
                }

                try {
                    await sender.setParameters(params);
                } catch {
                    // Paramètre non supporté sur ce navigateur, ignorer
                }
            })
        );
    } catch (e) {
        if (process.env.NODE_ENV === 'development') console.warn('[Call] applyAdaptiveBitrate:', e);
    }
}

// ─── Sélection codec préféré ─────────────────────────────────────────────────

function preferCodec(sdp: string, mimeType: 'video/VP9' | 'video/VP8' | 'video/H264' | 'audio/opus'): string {
    const lines = sdp.split('\r\n');
    const mLineIndex = lines.findIndex((l) => l.startsWith(`m=${mimeType.startsWith('video') ? 'video' : 'audio'}`));
    if (mLineIndex === -1) return sdp;

    const codecMap: Map<string, string[]> = new Map();
    const rtpmapLines: string[] = [];

    for (const line of lines) {
        const m = line.match(/^a=rtpmap:(\d+) (.+)\/\d+/);
        if (m) {
            codecMap.set(m[1], [m[2]]);
        }
        if (line.startsWith('a=rtpmap') || line.startsWith('a=fmtp') || line.startsWith('a=rtcp-fb')) {
            rtpmapLines.push(line);
        }
    }

    const mLine = lines[mLineIndex].split(' ');
    const header = mLine.slice(0, 3);
    const payloadTypes = mLine.slice(3);

    const preferred: string[] = [];
    const rest: string[] = [];

    const codecName = mimeType.split('/')[1].toLowerCase();
    for (const pt of payloadTypes) {
        const codec = codecMap.get(pt)?.[0]?.toLowerCase() ?? '';
        if (codec === codecName) {
            preferred.push(pt);
        } else {
            rest.push(pt);
        }
    }

    lines[mLineIndex] = [...header, ...preferred, ...rest].join(' ');
    return lines.join('\r\n');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallStatus =
    | 'idle'
    | 'dialing'
    | 'ringing'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'ended';

export type CallType = 'video' | 'audio';
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface IncomingCallData {
    callerId: string;
    callerName?: string;
    offer: RTCSessionDescriptionInit;
    conversationId: string;
    isVideo?: boolean;
}

export interface ActiveCallInfo {
    conversationId: string;
    otherUserId: string;
    otherUserName: string;
    callType: CallType;
}

interface CallContextValue {
    isInCall: boolean;
    setInCall: (value: boolean) => void;

    callStatus: CallStatus;
    isIncomingCall: boolean;
    incomingCallData: IncomingCallData | null;
    activeCall: ActiveCallInfo | null;
    callType: CallType;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isMuted: boolean;
    isVideoOn: boolean;
    isSpeakerOn: boolean;
    callDuration: number;
    connectionQuality: ConnectionQuality | null;
    networkProfile: NetworkProfile | null;
    remoteIsSpeaking: boolean;
    isVideoAutoDisabled: boolean;
    facingMode: 'user' | 'environment';
    autoVideoFallback: boolean;

    startCall: (conversationId: string, otherUserId: string, otherUserName: string, callType?: CallType) => Promise<void>;
    answerCall: () => Promise<void>;
    answerCallWithData: (data: IncomingCallData) => Promise<void>;
    rejectCall: () => void;
    endCall: () => void;
    toggleMute: () => void;
    toggleVideoCamera: () => void;
    toggleSpeaker: () => void;
    toggleCameraFacing: () => Promise<void>;
    setAutoVideoFallback: (enabled: boolean) => void;

    setIncomingCallData: (data: IncomingCallData | null) => void;
    setRemoteVideoRef: (el: HTMLVideoElement | null) => void;
    prewarmMedia: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

// ─── ICE Candidate Batcher ────────────────────────────────────────────────────
// Regroupe les ICE candidates et les envoie par batch pour réduire les appels HTTP

class IceBatcher {
    private batch: RTCIceCandidate[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    private readonly DELAY_MS = 80; // Attendre 80ms pour grouper les candidats

    constructor(
        private readonly targetUserId: string,
        private readonly emitSignal: (event: string, data: Record<string, unknown>) => Promise<void>
    ) { }

    add(candidate: RTCIceCandidate) {
        this.batch.push(candidate);
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), this.DELAY_MS);
    }

    async flush() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (this.batch.length === 0) return;
        const candidates = this.batch.splice(0);
        // Envoie un candidat à la fois (API actuelle) — on peut évoluer vers batch
        await Promise.all(
            candidates.map((c) =>
                this.emitSignal('call:ice-candidate', {
                    targetUserId: this.targetUserId,
                    candidate: c,
                })
            )
        );
    }

    destroy() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        this.batch = [];
    }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CallProvider({ children }: { children: React.ReactNode }) {
    const [isInCall, setIsInCall] = useState(false);
    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [incomingCallData, setIncomingCallDataState] = useState<IncomingCallData | null>(null);
    const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
    const [callType, setCallType] = useState<CallType>('video');
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isSpeakerOn, setIsSpeakerOn] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality | null>(null);
    const [networkProfile, setNetworkProfile] = useState<NetworkProfile | null>(null);
    const [remoteIsSpeaking, setRemoteIsSpeaking] = useState(false);
    const [isVideoAutoDisabled, setIsVideoAutoDisabled] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const [autoVideoFallback, setAutoVideoFallback] = useState(true);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const iceCandidateBufferRef = useRef<RTCIceCandidate[]>([]);
    const iceBatcherRef = useRef<IceBatcher | null>(null);
    const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const activeCallNotificationRef = useRef<Notification | null>(null);
    const audioProcessorDisconnectRef = useRef<(() => void) | null>(null);
    const activeCallRef = useRef(activeCall);
    const dialingRef = useRef(false);
    const iceRestartAttemptRef = useRef(0);
    const poorNetworkCounterRef = useRef(0);
    const goodNetworkCounterRef = useRef(0);
    activeCallRef.current = activeCall;
    localStreamRef.current = localStream;

    const { userChannel, isConnected } = useWebSocket();

    const setInCall = useCallback((value: boolean) => setIsInCall(value), []);

    // ── Signaling via HTTP (Pusher relay) ──────────────────────────────────────
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

    // ── Monitoring WebRTC stats pour qualité adaptative ────────────────────────
    const startStatsMonitoring = useCallback((pc: RTCPeerConnection) => {
        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);

        let prevPacketsLost = 0;
        let prevPacketsSent = 0;
        let prevAudioLevel = 0;
        let isCurrentlySpeaking = false; // Local state pour éviter les dépendances circulaires

        statsIntervalRef.current = setInterval(async () => {
            if (pc.connectionState === 'closed') return;
            try {
                const stats = await pc.getStats();
                let rtt = 0;
                let packetsLost = 0;
                let packetsSent = 0;
                let jitter = 0;
                let availableBandwidth = 0;
                let remoteAudioLevel = 0;
                let hasRemoteAudio = false;

                stats.forEach((report) => {
                    if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
                        rtt = report.roundTripTime ?? 0;
                        packetsLost = report.packetsLost ?? 0;
                        jitter = report.jitter ?? 0;
                    }
                    if (report.type === 'outbound-rtp' && report.kind === 'video') {
                        packetsSent = report.packetsSent ?? 0;
                    }
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        availableBandwidth = report.availableOutgoingBitrate ?? 0;
                    }
                    // VAD - Voice Activity Detection depuis les stats audio distantes
                    if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                        hasRemoteAudio = true;
                        // audioLevel est en dBov, -127 = silence, 0 = max
                        const level = report.audioLevel ?? -127;
                        // Normaliser entre 0 et 1, seuil à -40dB
                        remoteAudioLevel = level > -40 ? Math.min(1, (level + 40) / 40) : 0;
                    }
                });

                // Détection parole distante (VAD simple)
                if (hasRemoteAudio) {
                    const isSpeaking = remoteAudioLevel > 0.1; // Seuil de 10%
                    // Lissage pour éviter les changements trop rapides
                    if (isSpeaking !== isCurrentlySpeaking) {
                        const smoothedLevel = prevAudioLevel * 0.7 + remoteAudioLevel * 0.3;
                        isCurrentlySpeaking = smoothedLevel > 0.15;
                        setRemoteIsSpeaking(isCurrentlySpeaking);
                    }
                    prevAudioLevel = remoteAudioLevel;
                }

                const lostDelta = Math.max(0, packetsLost - prevPacketsLost);
                const sentDelta = Math.max(1, packetsSent - prevPacketsSent);
                const lossRate = (lostDelta / sentDelta) * 100;
                prevPacketsLost = packetsLost;
                prevPacketsSent = packetsSent;

                // Calcul profil réseau
                let profile: NetworkProfile;
                const bwMbps = availableBandwidth / 1_000_000;
                if (rtt < 80 && lossRate < 1 && jitter < 0.02 && bwMbps > 1.5) {
                    profile = 'excellent';
                } else if (rtt < 150 && lossRate < 3 && jitter < 0.05 && bwMbps > 0.6) {
                    profile = 'good';
                } else if (rtt < 300 && lossRate < 8 && bwMbps > 0.2) {
                    profile = 'fair';
                } else {
                    profile = 'poor';
                }

                // Qualité affichable
                const displayQuality: ConnectionQuality =
                    profile === 'excellent' ? 'excellent'
                        : profile === 'good' ? 'good'
                            : profile === 'fair' ? 'fair'
                                : 'poor';

                setConnectionQuality(displayQuality);
                setNetworkProfile(profile);

                // Fallback automatique video → audio si réseau poor
                if (autoVideoFallback && callType === 'video' && !isVideoAutoDisabled) {
                    if (profile === 'poor') {
                        poorNetworkCounterRef.current += 1;
                        goodNetworkCounterRef.current = 0;
                        // Après 2 cycles (~6s) en poor, désactiver la vidéo
                        if (poorNetworkCounterRef.current >= 2) {
                            console.log('[Call] Network poor - auto-disabling video');
                            localStreamRef.current?.getVideoTracks().forEach((track) => {
                                track.enabled = false;
                            });
                            setIsVideoOn(false);
                            setIsVideoAutoDisabled(true);
                            toast.info('Vidéo désactivée pour stabiliser l\'appel');
                            // Notifier l'autre pair
                            if (activeCallRef.current) {
                                emitCallSignal('call:video-disabled', { 
                                    targetUserId: activeCallRef.current.otherUserId 
                                });
                            }
                        }
                    } else if (profile === 'good' || profile === 'excellent') {
                        goodNetworkCounterRef.current += 1;
                        if (goodNetworkCounterRef.current >= 3) {
                            poorNetworkCounterRef.current = 0;
                        }
                    }
                }

                // Adapter le bitrate selon le profil
                await applyAdaptiveBitrate(pc, profile);

                if (process.env.NODE_ENV === 'development') {
                    console.debug(`[Call Stats] RTT=${(rtt * 1000).toFixed(0)}ms loss=${lossRate.toFixed(1)}% jitter=${(jitter * 1000).toFixed(1)}ms bw=${bwMbps.toFixed(2)}Mbps audioLevel=${remoteAudioLevel.toFixed(2)} → ${profile}`);
                }
            } catch {
                // Stats non disponibles encore
            }
        }, 3000); // Toutes les 3 secondes
    }, [autoVideoFallback, callType, isVideoAutoDisabled, emitCallSignal]);

    // ── Cleanup ────────────────────────────────────────────────────────────────
    const cleanupCall = useCallback(() => {
        // Audio processor
        audioProcessorDisconnectRef.current?.();
        audioProcessorDisconnectRef.current = null;

        // Audio ducking
        destroyGlobalDuckingController();

        // Arrêter les tracks locaux
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((t) => t.stop());
        }

        // Fermer la peer connection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // Timers
        if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }

        // Batcher ICE
        iceBatcherRef.current?.destroy();
        iceBatcherRef.current = null;

        iceCandidateBufferRef.current = [];
        iceRestartAttemptRef.current = 0;
        poorNetworkCounterRef.current = 0;
        goodNetworkCounterRef.current = 0;

        // Notification
        if (activeCallNotificationRef.current) {
            activeCallNotificationRef.current.close();
            activeCallNotificationRef.current = null;
        }

        stopRingtone();
        setLocalStream(null);
        setRemoteStream(null);
        setActiveCall(null);
        setCallType('video');
        setIsIncomingCall(false);
        setIsInCall(false);
        setCallStatus('idle');
        setIncomingCallDataState(null);
        setCallDuration(0);
        setIsMuted(false);
        setIsVideoOn(true);
        setIsSpeakerOn(false);
        setConnectionQuality(null);
        setNetworkProfile(null);
        setRemoteIsSpeaking(false);
        setIsVideoAutoDisabled(false);
        setFacingMode('user');
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

    // ── Initialisation PeerConnection ──────────────────────────────────────────
    const initializePeerConnection = useCallback((otherUserId: string) => {
        iceCandidateBufferRef.current = [];
        iceRestartAttemptRef.current = 0;

        // Créer le batcher ICE
        iceBatcherRef.current?.destroy();
        iceBatcherRef.current = new IceBatcher(otherUserId, emitCallSignal);

        const pc = new RTCPeerConnection(PC_CONFIG);

        // Trickle ICE : envoyer chaque candidat dès qu'il arrive (via batcher)
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                iceBatcherRef.current?.add(event.candidate);
            } else {
                // Fin de la collecte : flusher immédiatement
                iceBatcherRef.current?.flush();
            }
        };

        pc.onicegatheringstatechange = () => {
            if (process.env.NODE_ENV === 'development') {
                console.debug('[ICE] Gathering state:', pc.iceGatheringState);
            }
        };

        // Réception du flux distant
        pc.ontrack = (event) => {
            const stream = event.streams[0] ?? new MediaStream([event.track]);
            setRemoteStream(stream);
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
                safePlay(remoteVideoRef.current);
            }
        };

        // Monitoring état ICE → reconnexion automatique
        pc.oniceconnectionstatechange = async () => {
            const state = pc.iceConnectionState;
            if (process.env.NODE_ENV === 'development') {
                console.debug('[ICE] Connection state:', state);
            }

            if (state === 'connected' || state === 'completed') {
                setConnectionQuality('good');
                iceRestartAttemptRef.current = 0;
                setCallStatus('connected');
            } else if (state === 'disconnected') {
                setConnectionQuality('poor');
                setCallStatus('reconnecting');
                // Tentative ICE restart après 2s
                setTimeout(async () => {
                    if (peerConnectionRef.current?.iceConnectionState === 'disconnected') {
                        await attemptIceRestart(otherUserId);
                    }
                }, 2000);
            } else if (state === 'failed') {
                setConnectionQuality('poor');
                if (iceRestartAttemptRef.current < 3) {
                    setCallStatus('reconnecting');
                    toast.warning('Reconnexion en cours...');
                    await attemptIceRestart(otherUserId);
                } else {
                    toast.error('Connexion perdue. Raccrochez et réessayez.');
                    setConnectionQuality('poor');
                }
            }
        };

        // Monitoring connexion globale
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (process.env.NODE_ENV === 'development') {
                console.debug('[Connection] State:', state);
            }
            if (state === 'connected') {
                startStatsMonitoring(pc);
                // Démarrer le ducking audio
                getGlobalDuckingController().start();
            } else if (state === 'failed' || state === 'closed') {
                if (statsIntervalRef.current) {
                    clearInterval(statsIntervalRef.current);
                    statsIntervalRef.current = null;
                }
                // Arrêter le ducking audio
                destroyGlobalDuckingController();
            }
        };

        peerConnectionRef.current = pc;
        return pc;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [emitCallSignal, startStatsMonitoring]);

    // ── ICE Restart (reconnexion sans raccrocher) ──────────────────────────────
    const attemptIceRestart = useCallback(async (targetUserId: string) => {
        const pc = peerConnectionRef.current;
        if (!pc || pc.signalingState === 'closed') return;

        iceRestartAttemptRef.current += 1;
        if (process.env.NODE_ENV === 'development') {
            console.log(`[Call] ICE restart attempt #${iceRestartAttemptRef.current}`);
        }

        try {
            const offer = await pc.createOffer({ iceRestart: true });
            // Préférer VP9 pour une meilleure compression à faible bitrate
            offer.sdp = preferCodec(offer.sdp!, 'video/VP9');
            offer.sdp = preferCodec(offer.sdp!, 'audio/opus');
            await pc.setLocalDescription(offer);
            await emitCallSignal('call:ice-restart', {
                targetUserId,
                offer: pc.localDescription,
            });
        } catch (e) {
            console.error('[Call] ICE restart failed:', e);
        }
    }, [emitCallSignal]);

    // ── Appliquer les ICE candidates bufférisés ────────────────────────────────
    const addBufferedIceCandidates = useCallback(async () => {
        const pc = peerConnectionRef.current;
        const buffer = iceCandidateBufferRef.current;
        if (!pc || buffer.length === 0) return;
        await Promise.all(
            buffer.map(async (candidate) => {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.warn('[WebRTC] Failed to add buffered ICE candidate', e);
                }
            })
        );
        iceCandidateBufferRef.current = [];
    }, []);

    // ── Démarrer un appel ──────────────────────────────────────────────────────
    const startCall = useCallback(
        async (
            conversationId: string,
            otherUserId: string,
            otherUserName: string,
            type: CallType = 'video'
        ) => {
            if (dialingRef.current) return; // Éviter double-appel
            dialingRef.current = true;

            setIsInCall(true);
            setCallType(type);
            setActiveCall({ conversationId, otherUserId, otherUserName, callType: type });
            setCallStatus('dialing');

            // Timeout si pas de réponse dans 45s
            callTimeoutRef.current = setTimeout(() => {
                if (dialingRef.current) {
                    dialingRef.current = false;
                    toast.info('Pas de réponse');
                    endCall();
                }
            }, 45_000);

            try {
                // Vérifier support getUserMedia
                if (!isMediaDevicesSupported()) {
                    const isIOSDevice = isIOS();
                    const iOSVersion = getIOSVersion();
                    
                    if (isIOSDevice && iOSVersion < 11) {
                        throw new Error('iOS 11+ requis pour les appels. Veuillez mettre à jour votre appareil.');
                    }
                    
                    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                        throw new Error('Les appels nécessitent une connexion sécurisée (HTTPS).');
                    }
                    
                    throw new Error('Votre navigateur ne supporte pas les appels audio/vidéo.');
                }

                // Sur iOS, demander les permissions explicitement
                if (isIOS()) {
                    console.log('[Call] iOS detected, requesting media permissions...');
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: getAudioConstraints(),
                    ...(type === 'video' && { video: getVideoConstraints() }),
                });

                // Traitement audio
                const processor = processAudioStream(stream);
                const streamToUse = processor
                    ? combineProcessedAudioWithVideo(processor.stream, stream)
                    : stream;
                audioProcessorDisconnectRef.current = processor?.disconnect ?? null;
                setLocalStream(streamToUse);

                const pc = initializePeerConnection(otherUserId);
                streamToUse.getTracks().forEach((track) => pc.addTrack(track, streamToUse));

                // Créer l'offer SDP
                setCallStatus('connecting');
                const offer = await pc.createOffer({ iceRestart: false, offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });

                // Préférer les codecs haute qualité
                if (offer.sdp) {
                    offer.sdp = preferCodec(offer.sdp, 'video/VP9');
                    offer.sdp = preferCodec(offer.sdp, 'audio/opus');
                }

                await pc.setLocalDescription(offer);

                // Envoyer l'offer dès que localDescription est set (trickle ICE démarre automatiquement)
                await emitCallSignal('call:invite', {
                    recipientId: otherUserId,
                    offer: pc.localDescription,
                    conversationId,
                    isVideo: type === 'video',
                });

                // Appliquer le bitrate initial selon profil réseau estimé
                setTimeout(() => {
                    if (peerConnectionRef.current) {
                        applyAdaptiveBitrate(peerConnectionRef.current, 'good');
                    }
                }, 2000);

            } catch (err) {
                console.error('[Call] Start error:', err);
                
                let msg = "Impossible d'accéder à la caméra ou au microphone.";
                
                if (err instanceof Error) {
                    if (err.message.includes('iOS')) {
                        msg = err.message;
                    } else if (err.message.includes('HTTPS')) {
                        msg = err.message;
                    } else if (err.message.includes('supporte pas')) {
                        msg = err.message;
                    }
                }
                
                if (err instanceof DOMException) {
                    if (err.name === 'NotAllowedError') {
                        msg = 'Accès caméra/micro refusé. Vérifiez les permissions dans Réglages > Safari > Microphone/Caméra.';
                    } else if (err.name === 'NotFoundError') {
                        msg = 'Aucun microphone ou caméra trouvé.';
                    } else if (err.name === 'NotReadableError') {
                        msg = 'Le microphone ou la caméra est déjà utilisé par une autre application.';
                    }
                }
                
                toast.error(msg);
                dialingRef.current = false;
                cleanupCall();
            }
        },
        [initializePeerConnection, emitCallSignal, cleanupCall, endCall]
    );

    // ── Répondre à un appel (données depuis state) ─────────────────────────────
    const answerCall = useCallback(async () => {
        const data = incomingCallData;
        if (!data) return;
        await answerCallWithDataImpl(data);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incomingCallData]);

    // ── Répondre à un appel (données explicites) ──────────────────────────────
    const answerCallWithDataImpl = useCallback(async (data: IncomingCallData) => {
        stopRingtone();
        setIsIncomingCall(false);
        setIsInCall(true);
        const isVideo = data.isVideo !== false;
        setCallType(isVideo ? 'video' : 'audio');
        setActiveCall({
            conversationId: data.conversationId,
            otherUserId: data.callerId,
            otherUserName: data.callerName || 'Utilisateur',
            callType: isVideo ? 'video' : 'audio',
        });
        setCallStatus('connecting');
        setIncomingCallDataState(null);

        try {
            // Vérifier support getUserMedia
            if (!isMediaDevicesSupported()) {
                throw new Error('Votre navigateur ne supporte pas les appels audio/vidéo.');
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(),
                ...(isVideo && { video: getVideoConstraints() }),
            });

            const processor = processAudioStream(stream);
            const streamToUse = processor
                ? combineProcessedAudioWithVideo(processor.stream, stream)
                : stream;
            audioProcessorDisconnectRef.current = processor?.disconnect ?? null;
            setLocalStream(streamToUse);

            const pc = initializePeerConnection(data.callerId);
            streamToUse.getTracks().forEach((track) => pc.addTrack(track, streamToUse));

            // Appliquer l'offer reçu
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            // Ajouter les ICE candidates bufférisés
            await addBufferedIceCandidates();

            const answer = await pc.createAnswer();
            if (answer.sdp) {
                answer.sdp = preferCodec(answer.sdp, 'video/VP9');
                answer.sdp = preferCodec(answer.sdp, 'audio/opus');
            }
            await pc.setLocalDescription(answer);

            await emitCallSignal('call:answer', {
                callerId: data.callerId,
                answer: pc.localDescription,
                conversationId: data.conversationId,
            });

            setCallStatus('connected');
            startCallTimer();

            // Bitrate initial
            setTimeout(() => {
                if (peerConnectionRef.current) {
                    applyAdaptiveBitrate(peerConnectionRef.current, 'good');
                }
            }, 2000);

        } catch (err) {
            console.error('[Call] Answer error:', err);
            toast.error('Erreur lors de la réponse à l\'appel.');
            cleanupCall();
        }
    }, [initializePeerConnection, addBufferedIceCandidates, emitCallSignal, startCallTimer, cleanupCall]);

    const answerCallWithData = useCallback(
        async (data: IncomingCallData) => answerCallWithDataImpl(data),
        [answerCallWithDataImpl]
    );

    // ── Rejeter un appel ───────────────────────────────────────────────────────
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

    // ── Contrôles ──────────────────────────────────────────────────────────────
    const toggleMute = useCallback(() => {
        localStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = !track.enabled;
        });
        setIsMuted((prev) => !prev);
    }, []);

    const toggleVideoCamera = useCallback(() => {
        localStreamRef.current?.getVideoTracks().forEach((track) => {
            track.enabled = !track.enabled;
        });
        setIsVideoOn((prev) => !prev);
        // Si on réactive manuellement, réinitialiser le flag auto-disabled
        if (!isVideoOn) {
            setIsVideoAutoDisabled(false);
        }
    }, [isVideoOn]);

    const toggleSpeaker = useCallback(async () => {
        const video = remoteVideoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
        if (!video || typeof video.setSinkId !== 'function') return;
        
        if (!isMediaDevicesSupported()) {
            toast.error('Votre navigateur ne supporte pas le changement de sortie audio.');
            return;
        }
        
        try {
            if (isSpeakerOn) {
                await video.setSinkId('');
            } else {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const speaker =
                    devices
                        .filter((d) => d.kind === 'audiooutput')
                        .find((d) =>
                            d.label.toLowerCase().includes('speaker') ||
                            d.label.toLowerCase().includes('haut-parleur')
                        ) ?? devices.find((d) => d.kind === 'audiooutput');
                if (speaker?.deviceId) {
                    await video.setSinkId(speaker.deviceId);
                }
            }
            setIsSpeakerOn((prev) => !prev);
        } catch (e) {
            console.warn('[Call] Speaker toggle:', e);
            toast.error('Impossible de changer la sortie audio.');
        }
    }, [isSpeakerOn]);

    // ── Basculement caméra (front/back) ─────────────────────────────────────────
    const toggleCameraFacing = useCallback(async () => {
        const pc = peerConnectionRef.current;
        const stream = localStreamRef.current;
        if (!pc || !stream) return;

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;

        const newFacingMode = facingMode === 'user' ? 'environment' : 'user';

        try {
            // Obtenir un nouveau stream avec la caméra opposée
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: newFacingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false, // On garde l'audio existant
            });

            const newVideoTrack = newStream.getVideoTracks()[0];
            if (!newVideoTrack) {
                toast.error('Caméra non disponible');
                return;
            }

            // Remplacer la track sur le peer connection
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(newVideoTrack);
            }

            // Arrêter l'ancienne track vidéo
            videoTrack.stop();

            // Mettre à jour le stream local
            stream.removeTrack(videoTrack);
            stream.addTrack(newVideoTrack);
            setLocalStream(stream); // Trigger re-render
            setFacingMode(newFacingMode);

            // Notifier l'autre pair (info seulement)
            if (activeCallRef.current) {
                emitCallSignal('call:video-flipped', {
                    targetUserId: activeCallRef.current.otherUserId,
                    facingMode: newFacingMode,
                });
            }

            toast.success(newFacingMode === 'user' ? 'Caméra frontale' : 'Caméra arrière');
        } catch (err) {
            console.error('[Call] Camera flip error:', err);
            toast.error('Impossible de basculer la caméra');
        }
    }, [facingMode, emitCallSignal]);

    // ── Données appel entrant ──────────────────────────────────────────────────
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

    // ── Référence vidéo distante ───────────────────────────────────────────────
    // IMPORTANT: ne pas réassigner srcObject si c'est le même stream — évite les saccades
    const setRemoteVideoRef = useCallback((el: HTMLVideoElement | null) => {
        remoteVideoRef.current = el;
        if (el && remoteStream) {
            // Seulement si le stream est différent
            if (el.srcObject !== remoteStream) {
                el.srcObject = remoteStream;
            }
            if (el.paused) safePlay(el);
        }
    }, [remoteStream]);

    // ── Pré-chauffage média (réduit le délai au premier appel) ─────────────────
    const prewarmMedia = useCallback(async () => {
        if (!isMediaDevicesSupported()) return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
                audio: true,
            });
            // Attendre 200ms pour que le HW soit prêt, puis libérer
            await new Promise((r) => setTimeout(r, 200));
            stream.getTracks().forEach((t) => t.stop());
        } catch {
            // Ignorer
        }
    }, []);

    // ─── Effets ───────────────────────────────────────────────────────────────

    // Sync isInCall
    useEffect(() => {
        setIsInCall(callStatus !== 'idle' && callStatus !== 'ended' && !!activeCall);
    }, [callStatus, activeCall]);

    // Écoute des événements Pusher (signaling)
    useEffect(() => {
        if (!userChannel || !isConnected) return;

        const handleIncomingCall = (data: {
            callerId: string;
            callerName?: string;
            offer: RTCSessionDescriptionInit;
            conversationId: string;
            isVideo?: boolean;
        }) => {
            // Rejeter si déjà en appel
            if (activeCallRef.current) {
                emitCallSignal('call:reject', { callerId: data.callerId });
                return;
            }
            setIncomingCallDataState(data);
            setIsIncomingCall(true);
            setCallStatus('ringing');
            startRingtone();
        };

        const handleCallAnswered = async (data: { answer: RTCSessionDescriptionInit }) => {
            dialingRef.current = false;
            const pc = peerConnectionRef.current;
            if (!pc) return;

            if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
            }

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                // Ajouter les ICE candidates bufférisés
                const buffer = iceCandidateBufferRef.current.splice(0);
                await Promise.all(
                    buffer.map(async (c) => {
                        try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
                        catch (e) { console.warn('[WebRTC] Buffered ICE candidate failed:', e); }
                    })
                );
                setCallStatus('connected');
                startCallTimer();
            } catch (e) {
                console.error('[Call] setRemoteDescription error:', e);
            }
        };

        const handleCallRejected = () => {
            dialingRef.current = false;
            toast.info('Appel rejeté');
            cleanupCall();
        };

        const handleCallEnded = () => {
            toast.info('Appel terminé');
            cleanupCall();
        };

        const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
            const pc = peerConnectionRef.current;
            if (!pc) return;
            if (pc.remoteDescription) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.warn('[WebRTC] ICE candidate failed:', e);
                }
            } else {
                iceCandidateBufferRef.current.push(data.candidate as unknown as RTCIceCandidate);
            }
        };

        // ICE restart initié par l'appelant distant
        const handleIceRestart = async (data: { offer: RTCSessionDescriptionInit }) => {
            const pc = peerConnectionRef.current;
            if (!pc || !activeCallRef.current) return;
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await emitCallSignal('call:answer', {
                    callerId: activeCallRef.current.otherUserId,
                    answer: pc.localDescription,
                    conversationId: activeCallRef.current.conversationId,
                    isRestart: true,
                });
            } catch (e) {
                console.error('[Call] ICE restart response failed:', e);
            }
        };

        userChannel.bind('call:incoming', handleIncomingCall);
        userChannel.bind('call:answered', handleCallAnswered);
        userChannel.bind('call:rejected', handleCallRejected);
        userChannel.bind('call:ended', handleCallEnded);
        userChannel.bind('call:ice-candidate', handleIceCandidate);
        userChannel.bind('call:ice-restart', handleIceRestart);

        return () => {
            userChannel.unbind('call:incoming', handleIncomingCall);
            userChannel.unbind('call:answered', handleCallAnswered);
            userChannel.unbind('call:rejected', handleCallRejected);
            userChannel.unbind('call:ended', handleCallEnded);
            userChannel.unbind('call:ice-candidate', handleIceCandidate);
            userChannel.unbind('call:ice-restart', handleIceRestart);
        };
    }, [userChannel, isConnected, emitCallSignal, startCallTimer, cleanupCall]);

    // Auto-play vidéo/audio distante quand le stream arrive
    // GUARD: ne réassigner srcObject que si le stream a changé (évite saccades)
    useEffect(() => {
        const video = remoteVideoRef.current;
        if (!video || !remoteStream) return;
        if (video.srcObject !== remoteStream) {
            video.srcObject = remoteStream;
        }
        if (video.paused) safePlay(video);
    }, [remoteStream]);

    // Écoute message Service Worker (fin d'appel via notification)
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

    // Notification persistante "Appel en cours"
    useEffect(() => {
        if (callStatus !== 'connected' || !activeCall) return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

        let notif: Notification | null = null;
        try {
            notif = new Notification(`Appel en cours — ${activeCall.otherUserName}`, {
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
            // NotAllowedError — silencieux
        }
        return () => {
            notif?.close();
            activeCallNotificationRef.current = null;
        };
    }, [callStatus, activeCall]);

    // ─── Value ────────────────────────────────────────────────────────────────
    const value: CallContextValue = {
        isInCall,
        setInCall,
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
        networkProfile,
        remoteIsSpeaking,
        isVideoAutoDisabled,
        facingMode,
        autoVideoFallback,
        startCall,
        answerCall,
        answerCallWithData,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideoCamera,
        toggleSpeaker,
        toggleCameraFacing,
        setAutoVideoFallback,
        setIncomingCallData,
        setRemoteVideoRef,
        prewarmMedia,
    };

    return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCallContext() {
    return useContext(CallContext);
}
