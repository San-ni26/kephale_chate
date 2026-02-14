'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ArrowLeft, Send, Paperclip, Loader2, Image as ImageIcon, FileText, MoreVertical, Edit2, Trash2, ArrowUp, Phone, PhoneIncoming, PhoneOff, Mic, MicOff, Clock, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import useSWR from 'swr';

import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/src/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/src/components/ui/dialog';
import { encryptMessage, decryptMessage, decryptPrivateKey } from '@/src/lib/crypto';
import { EncryptedAttachment } from './EncryptedAttachment';
import { useWebSocket } from '@/src/hooks/useWebSocket';

const AudioRecorderComponent = dynamic(
    () => import('@/src/components/AudioRecorder').then(mod => mod.AudioRecorderComponent),
    {
        ssr: false,
        loading: () => <Button variant="ghost" size="icon" disabled className="rounded-full"><Loader2 className="w-4 h-4 animate-spin" /></Button>
    }
);

interface Message {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    updatedAt: string;
    isEdited: boolean;
    attachments?: {
        filename: string;
        type: string;
        data: string;
    }[];
    sender: {
        id: string;
        name: string;
        email: string;
        publicKey: string;
    };
}

interface Conversation {
    id: string;
    isDirect: boolean;
    name?: string;
    members: {
        user: {
            id: string;
            name: string;
            email: string;
            publicKey: string;
            isOnline: boolean;
            inCall?: boolean;
        };
    }[];
}

const fetcher = async (url: string) => {
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
};

// TURN/STUN servers for reliable WebRTC
const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    // Free TURN servers for better connectivity
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

export default function DiscussionPage() {
    const params = useParams();
    const router = useRouter();
    const conversationId = params?.id as string;

    const { data: conversationData } = useSWR(
        conversationId ? `/api/conversations/${conversationId}` : null,
        fetcher,
        { refreshInterval: 15000 } // Rafraichir la presence (en ligne) toutes les 15s
    );
    const conversation: Conversation | null = conversationData?.conversation || null;

    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);

    // Call State
    const [isCallActive, setIsCallActive] = useState(false);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [callStatus, setCallStatus] = useState<'idle' | 'dialing' | 'ringing' | 'connected' | 'ended'>('idle');
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [incomingCallData, setIncomingCallData] = useState<{ callerId: string; callerName?: string; offer: any; conversationId: string } | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const callTimerRef = useRef<NodeJS.Timeout | null>(null);
    const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localAudioRef = useRef<HTMLAudioElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    // Keep localStreamRef in sync
    useEffect(() => {
        localStreamRef.current = localStream;
    }, [localStream]);

    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }, []);

    // Real-time message handlers
    const handleNewMessage = useCallback((data: { conversationId: string; message: Message }) => {
        if (data.conversationId !== conversationId) return;
        setMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
        });
        scrollToBottom();
    }, [conversationId, scrollToBottom]);

    const handleMessageEdited = useCallback((data: { conversationId: string; message: Message }) => {
        if (data.conversationId !== conversationId) return;
        setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m));
    }, [conversationId]);

    const handleMessageDeleted = useCallback((data: { conversationId: string; messageId: string }) => {
        if (data.conversationId !== conversationId) return;
        setMessages(prev => prev.filter(m => m.id !== data.messageId));
    }, [conversationId]);

    const { socket: pusher, isConnected, joinConversation, leaveConversation, userChannel } = useWebSocket(
        handleNewMessage,
        handleMessageEdited,
        handleMessageDeleted,
    );

    const currentUser = getUser();
    const otherUser = conversation?.members.find(m => m.user.id !== currentUser?.id)?.user;

    // Refs for call state
    const isCallActiveRef = useRef(isCallActive);
    isCallActiveRef.current = isCallActive;

    // --- Check call status on mount : appel actif ou en attente quand on rentre dans l'app ---
    useEffect(() => {
        if (!conversationId) return;

        const checkCallStatus = async () => {
            try {
                const res = await fetchWithAuth('/api/call/status?claim=1');
                if (!res.ok) return;
                const { activeCall, pendingCall } = await res.json();

                if (activeCall && activeCall.conversationId !== conversationId) {
                    router.push(`/chat/discussion/${activeCall.conversationId}`);
                    return;
                }
                if (pendingCall && pendingCall.conversationId !== conversationId) {
                    router.push(`/chat/discussion/${pendingCall.conversationId}`);
                    return;
                }
                if (pendingCall && pendingCall.conversationId === conversationId) {
                    setIncomingCallData(pendingCall);
                    setIsIncomingCall(true);
                    setCallStatus('ringing');
                    return;
                }
            } catch {
                // Ignorer
            }

            const stored = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pendingIncomingCall');
            if (stored) {
                try {
                    const data = JSON.parse(stored);
                    if (data.conversationId === conversationId) {
                        sessionStorage.removeItem('pendingIncomingCall');
                        setIncomingCallData(data);
                        setIsIncomingCall(true);
                        setCallStatus('ringing');
                    }
                } catch {
                    sessionStorage.removeItem('pendingIncomingCall');
                }
            }
        };

        checkCallStatus();
    }, [conversationId, router]);

    // --- Mark as read when viewing conversation ---
    useEffect(() => {
        if (!conversationId || loading) return;

        // Mark as read on entering conversation
        fetchWithAuth(`/api/conversations/${conversationId}/read`, {
            method: 'POST',
        }).catch(() => {});
    }, [conversationId, loading]);

    // Also mark as read when new messages arrive while viewing
    useEffect(() => {
        if (!conversationId || loading || messages.length === 0) return;

        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.senderId !== currentUser?.id) {
            fetchWithAuth(`/api/conversations/${conversationId}/read`, {
                method: 'POST',
            }).catch(() => {});
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages.length]);

    // Join/leave conversation room for real-time updates
    useEffect(() => {
        if (!conversationId || !isConnected) return;

        joinConversation(conversationId);

        return () => {
            leaveConversation(conversationId);
        };
    }, [conversationId, isConnected, joinConversation, leaveConversation]);

    // Initial Fetch - load only the 30 most recent messages
    useEffect(() => {
        if (!conversationId) return;

        const loadInitialMessages = async () => {
            try {
                const res = await fetchWithAuth(`/api/conversations/${conversationId}/messages?limit=30`);
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.messages);
                    setHasMore(data.hasMore !== false);
                }
            } catch (error) {
                console.error("Failed to load messages", error);
                toast.error("Erreur de chargement des messages");
            } finally {
                setLoading(false);
            }
        };

        loadInitialMessages();
    }, [conversationId]);

    // --- Call functions ---

    const emitCallSignal = useCallback(async (event: string, data: any) => {
        try {
            await fetchWithAuth('/api/call/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event, ...data }),
            });
        } catch (err) {
            console.error(`Error sending call signal ${event}:`, err);
        }
    }, []);

    const initializePeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        pc.onicecandidate = (event) => {
            if (event.candidate && otherUser) {
                emitCallSignal('call:ice-candidate', {
                    targetUserId: otherUser.id,
                    candidate: event.candidate,
                });
            }
        };

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = event.streams[0];
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                toast.error('Connexion instable...');
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [otherUser, emitCallSignal]);

    // cleanupCall: resets local state WITHOUT emitting to server
    const cleanupCall = useCallback(() => {
        // Use ref to always get the latest localStream
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // Clear call timer
        if (callTimerRef.current) {
            clearInterval(callTimerRef.current);
            callTimerRef.current = null;
        }
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }

        setLocalStream(null);
        setIsCallActive(false);
        setIsIncomingCall(false);
        setCallStatus('idle');
        setIncomingCallData(null);
        setRemoteStream(null);
        setCallDuration(0);
        setIsMuted(false);
        setIsSpeakerOn(false);
    }, []);

    // endCall: actively ends the call and notifies the remote user
    const endCall = useCallback(() => {
        if (isCallActiveRef.current && otherUser) {
            emitCallSignal('call:end', { targetUserId: otherUser.id });
        }
        cleanupCall();
    }, [otherUser, emitCallSignal, cleanupCall]);

    // Start call duration timer
    const startCallTimer = useCallback(() => {
        setCallDuration(0);
        callTimerRef.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
        }, 1000);
    }, []);

    const startCall = useCallback(async () => {
        if (!otherUser) return;
        setIsCallActive(true);
        setCallStatus('dialing');

        // Auto-timeout after 45 seconds if no answer
        callTimeoutRef.current = setTimeout(() => {
            if (isCallActiveRef.current && callStatus === 'dialing') {
                toast.info('Pas de reponse');
                endCall();
            }
        }, 45000);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);

            const pc = initializePeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await emitCallSignal('call:invite', {
                recipientId: otherUser.id,
                offer: offer,
                conversationId: conversationId,
            });

        } catch (err) {
            console.error('Error starting call:', err);
            toast.error("Impossible d'acceder au microphone");
            cleanupCall();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otherUser, conversationId, initializePeerConnection, cleanupCall, emitCallSignal, endCall]);

    const answerCall = useCallback(async () => {
        if (!incomingCallData) return;
        setIsIncomingCall(false);
        setIsCallActive(true);
        setCallStatus('connected');
        startCallTimer();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);

            const pc = initializePeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await emitCallSignal('call:answer', {
                callerId: incomingCallData.callerId,
                answer: answer,
                conversationId: incomingCallData.conversationId,
            });

        } catch (err) {
            console.error('Error answering call:', err);
            toast.error("Erreur lors de la reponse");
            cleanupCall();
        }
    }, [incomingCallData, initializePeerConnection, cleanupCall, emitCallSignal, startCallTimer]);

    const rejectCall = useCallback(() => {
        if (incomingCallData) {
            emitCallSignal('call:reject', { callerId: incomingCallData.callerId });
        }
        setIsIncomingCall(false);
        setIncomingCallData(null);
        setCallStatus('idle');
    }, [incomingCallData, emitCallSignal]);

    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsMuted(prev => !prev);
        }
    }, []);

    const toggleSpeaker = useCallback(async () => {
        const audio = remoteAudioRef.current;
        if (!audio || typeof (audio as any).setSinkId !== 'function') return;
        try {
            if (isSpeakerOn) {
                await (audio as any).setSinkId('');
            } else {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const outputs = devices.filter((d) => d.kind === 'audiooutput');
                const speaker = outputs.find(
                    (d) =>
                        d.label.toLowerCase().includes('speaker') ||
                        d.label.toLowerCase().includes('haut-parleur')
                ) || outputs[0];
                if (speaker?.deviceId) {
                    await (audio as any).setSinkId(speaker.deviceId);
                }
            }
            setIsSpeakerOn((prev) => !prev);
        } catch (e) {
            console.warn('[Call] Speaker toggle:', e);
        }
    }, [isSpeakerOn]);

    // WebRTC Call Signaling via Pusher userChannel
    useEffect(() => {
        if (!userChannel || !isConnected) return;

        const handleIncomingCall = (data: { callerId: string; callerName?: string; offer: any; conversationId: string }) => {
            if (isCallActiveRef.current) {
                // Already in a call - auto-reject
                emitCallSignal('call:reject', { callerId: data.callerId });
                return;
            }
            setIncomingCallData(data);
            setIsIncomingCall(true);
            setCallStatus('ringing');
        };

        const handleCallAnswered = (data: { answer: any; responderId: string }) => {
            if (!peerConnectionRef.current) return;
            // Clear timeout
            if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
            }
            peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer))
                .then(() => {
                    setCallStatus('connected');
                    startCallTimer();
                })
                .catch(e => console.error('Error setting remote description:', e));
        };

        const handleCallRejected = () => {
            toast.info('Appel rejete');
            cleanupCall();
        };

        const handleCallEnded = () => {
            toast.info('Appel termine');
            cleanupCall();
        };

        const handleIceCandidate = (data: { candidate: any; senderId: string }) => {
            if (!peerConnectionRef.current) return;
            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
                .catch(e => console.error('Error adding received ice candidate', e));
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
    }, [userChannel, isConnected, cleanupCall, emitCallSignal, startCallTimer]);

    // Auto-play remote audio
    useEffect(() => {
        if (remoteAudioRef.current && remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Cleanup call on unmount
    useEffect(() => {
        return () => {
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
            }
            if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
            }
        };
    }, []);

    // Fallback polling - only fetch NEW messages after the last known one
    useEffect(() => {
        if (!conversationId || loading) return;

        const interval = setInterval(async () => {
            try {
                // Find the latest real message timestamp
                const lastMsg = [...messages].reverse().find(m => !m.id.startsWith('temp-'));
                if (!lastMsg) return;

                const res = await fetchWithAuth(
                    `/api/conversations/${conversationId}/messages?after=${lastMsg.createdAt}&limit=20`
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.messages && data.messages.length > 0) {
                        setMessages(prev => {
                            const existingIds = new Set(prev.map(m => m.id));
                            const newUnique = data.messages.filter((m: Message) => !existingIds.has(m.id));
                            if (newUnique.length === 0) return prev;
                            return [...prev, ...newUnique];
                        });
                    }
                }
            } catch (error) {
                console.error("Polling error", error);
            }
        }, 30000);

        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, loading]);

    // Load More History - 20 older messages at a time
    const loadMoreHistory = async () => {
        if (!conversationId || loadingMore || !hasMore || messages.length === 0) return;

        setLoadingMore(true);
        const scrollContainer = scrollRef.current;
        const oldScrollHeight = scrollContainer?.scrollHeight || 0;

        const firstMessage = messages.find(m => !m.id.startsWith('temp-'));
        if (!firstMessage) {
            setLoadingMore(false);
            return;
        }

        try {
            const res = await fetchWithAuth(
                `/api/conversations/${conversationId}/messages?cursor=${firstMessage.id}&limit=20`
            );
            if (res.ok) {
                const data = await res.json();
                if (data.messages && data.messages.length > 0) {
                    // Deduplicate before prepending
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const unique = data.messages.filter((m: Message) => !existingIds.has(m.id));
                        return [...unique, ...prev];
                    });

                    // Preserve scroll position
                    requestAnimationFrame(() => {
                        if (scrollContainer) {
                            const newScrollHeight = scrollContainer.scrollHeight;
                            scrollContainer.scrollTop = newScrollHeight - oldScrollHeight;
                        }
                    });

                    setHasMore(data.hasMore !== false);
                } else {
                    setHasMore(false);
                }
            }
        } catch (error) {
            toast.error("Impossible de charger l'historique");
        } finally {
            setLoadingMore(false);
        }
    };

    // Auto scroll
    const isFirstLoad = useRef(true);
    const lastMessageCount = useRef(0);

    useEffect(() => {
        if (loading) return;

        if (isFirstLoad.current && messages.length > 0) {
            scrollToBottom();
            isFirstLoad.current = false;
        }

        if (messages.length > lastMessageCount.current) {
            const lastMsg = messages[messages.length - 1];
            const isMine = lastMsg?.senderId === currentUser?.id;

            if (isMine) {
                scrollToBottom();
            } else {
                // Scroll if near bottom
                const container = scrollRef.current;
                if (container) {
                    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
                    if (isNearBottom) scrollToBottom();
                }
            }
        }
        lastMessageCount.current = messages.length;
    }, [messages, loading, currentUser?.id, scrollToBottom]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const validFiles = files.filter(file => {
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            if (!validTypes.includes(file.type)) {
                toast.error(`Type de fichier non autorise: ${file.name}`);
                return false;
            }
            if (file.size > 10 * 1024 * 1024) {
                toast.error(`Fichier trop volumineux: ${file.name} (max 10MB)`);
                return false;
            }
            return true;
        });
        setSelectedFiles(prev => [...prev, ...validFiles]);
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const fileToBase64 = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleAudioRecorded = async (blob: Blob, duration: number) => {
        let ext = 'webm';
        if (blob.type.includes('mp4')) ext = 'mp4';
        else if (blob.type.includes('aac')) ext = 'aac';
        else if (blob.type.includes('ogg')) ext = 'ogg';

        const file = new File([blob], `audio-message-${Date.now()}.${ext}`, { type: blob.type });
        await sendAudioMessage(file);
    };

    const sendAudioMessage = async (audioFile: File) => {
        if (!currentUser || !otherUser || !privateKey) {
            toast.error("Cle de chiffrement manquante");
            return;
        }

        setSending(true);
        const tempId = `temp-${Date.now()}`;

        try {
            const base64Data = await fileToBase64(audioFile);
            const attachment = { filename: audioFile.name, type: 'AUDIO', data: base64Data };
            const encryptedContent = encryptMessage('', privateKey, otherUser.publicKey);
            const optimisticMessage: Message = {
                id: tempId,
                content: encryptedContent,
                senderId: currentUser.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isEdited: false,
                attachments: [attachment],
                sender: { id: currentUser.id, name: currentUser.name || '', email: currentUser.email || '', publicKey: currentUser.publicKey || '' }
            };

            setMessages(prev => [...prev, optimisticMessage]);

            const response = await fetchWithAuth(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: encryptedContent, attachments: [attachment] }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.message) {
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
                }
                scrollToBottom();
            } else {
                toast.error("Erreur d'envoi du message vocal");
                setMessages(prev => prev.filter(m => m.id !== tempId));
            }
        } catch (error) {
            console.error('Send audio error:', error);
            toast.error("Erreur d'envoi du message vocal");
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally {
            setSending(false);
        }
    };

    // Initial check for key
    useEffect(() => {
        if (currentUser) {
            const storedKey = sessionStorage.getItem(`privateKey_${currentUser.id}`);
            if (storedKey) {
                setPrivateKey(storedKey);
                setShowPasswordDialog(false);
            } else if (!privateKey) {
                setShowPasswordDialog(true);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);

    const handleUnlock = () => {
        if (!currentUser || !password) return;

        try {
            const decrypted = decryptPrivateKey(currentUser.encryptedPrivateKey, password);
            setPrivateKey(decrypted);
            sessionStorage.setItem(`privateKey_${currentUser.id}`, decrypted);
            setShowPasswordDialog(false);
            setPassword('');
            toast.success('Cle de chiffrement deverrouillee');
        } catch (error) {
            toast.error('Mot de passe incorrect');
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() && selectedFiles.length === 0) return;
        if (!currentUser || !otherUser || !privateKey) {
            if (!privateKey) setShowPasswordDialog(true);
            return;
        }

        setSending(true);
        const currentMessage = newMessage;
        const currentFiles = [...selectedFiles];

        setNewMessage('');
        setSelectedFiles([]);

        try {
            let attachments = [];

            if (currentFiles.length > 0) {
                for (const file of currentFiles) {
                    const base64Data = await fileToBase64(file);
                    const ext = file.name.split('.').pop()?.toLowerCase() || '';
                    let fileType = 'IMAGE';
                    if (['pdf'].includes(ext)) fileType = 'PDF';
                    else if (['doc', 'docx'].includes(ext)) fileType = 'WORD';
                    else if (['webm', 'mp3', 'ogg', 'm4a', 'wav'].includes(ext)) fileType = 'AUDIO';

                    attachments.push({ filename: file.name, type: fileType, data: base64Data });
                }
            }

            const cipherText: string = encryptMessage(
                currentMessage.trim() || '',
                privateKey,
                otherUser.publicKey
            );

            const tempId = `temp-${Date.now()}`;
            const optimisticMessage: Message = {
                id: tempId,
                content: cipherText,
                senderId: currentUser.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isEdited: false,
                attachments: attachments,
                sender: { id: currentUser.id, name: currentUser.name || '', email: currentUser.email || '', publicKey: currentUser.publicKey || '' }
            };

            setMessages(prev => [...prev, optimisticMessage]);
            scrollToBottom();

            const response = await fetchWithAuth(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: cipherText,
                    attachments: attachments.length > 0 ? attachments : undefined,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.message) {
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
                }
            } else {
                const error = await response.json();
                toast.error(error.error || "Erreur d'envoi");
                setMessages(prev => prev.filter(m => m.id !== tempId));
                setNewMessage(currentMessage);
                setSelectedFiles(currentFiles);
            }
        } catch (error) {
            console.error('Send message error:', error);
            toast.error("Erreur d'envoi du message");
            setMessages(prev => prev.filter(m => m.id.startsWith('temp-') === false));
            setNewMessage(currentMessage);
            setSelectedFiles(currentFiles);
        } finally {
            setSending(false);
        }
    };

    const handleEditMessage = async (messageId: string) => {
        if (!editContent.trim() || !currentUser || !otherUser || !privateKey) return;

        try {
            const encryptedContent = encryptMessage(editContent.trim(), privateKey, otherUser.publicKey);

            setMessages(prev => prev.map(msg =>
                msg.id === messageId ? { ...msg, content: encryptedContent, isEdited: true } : msg
            ));

            setEditingMessageId(null);
            setEditContent('');

            const response = await fetchWithAuth(`/api/messages/${messageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: encryptedContent }),
            });

            if (response.ok) {
                toast.success('Message modifie');
            } else {
                toast.error('Erreur de modification');
            }
        } catch (error) {
            toast.error('Erreur de modification');
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!confirm('Supprimer ce message ?')) return;

        const originalMessages = messages;

        try {
            setMessages(prev => prev.filter(msg => msg.id !== messageId));

            const response = await fetchWithAuth(`/api/messages/${messageId}`, { method: 'DELETE' });

            if (response.ok) {
                toast.success('Message supprime');
            } else {
                setMessages(originalMessages);
                toast.error('Erreur de suppression');
            }
        } catch (error) {
            setMessages(originalMessages);
            toast.error('Erreur de suppression');
        }
    };

    const decryptMessageContent = (message: Message): string => {
        if (!currentUser || !otherUser || !privateKey) return '[Chiffre]';

        try {
            const senderPublicKey = message.senderId === currentUser.id
                ? otherUser.publicKey
                : (message.sender.publicKey || otherUser.publicKey);

            return decryptMessage(message.content, privateKey, senderPublicKey) || '';
        } catch (error) {
            return '[Erreur de dechiffrement]';
        }
    };

    const canEditOrDelete = (message: Message): boolean => {
        if (message.senderId !== currentUser?.id) return false;
        const messageTime = new Date(message.createdAt).getTime();
        return (Date.now() - messageTime) < 5 * 60 * 1000;
    };

    const getConversationName = () => {
        if (!conversation) return 'Chargement...';
        if (conversation.isDirect && otherUser) {
            return otherUser.name || otherUser.email;
        }
        return conversation.name || 'Discussion';
    };

    // Format call duration as mm:ss
    const formatCallDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background text-foreground pt-2 md:pt-0">
            <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Deverrouiller la discussion</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground mb-4">
                            Entrez votre mot de passe pour dechiffrer votre cle privee et acceder aux messages.
                        </p>
                        <Input
                            type="password"
                            placeholder="Votre mot de passe"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                        />
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUnlock}>Deverrouiller</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Call Overlay - WhatsApp style */}
            {(isCallActive || isIncomingCall) && (
                <div className="fixed inset-0 z-[100] bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center flex-col">
                    {/* Animated circles background */}
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                        {callStatus === 'connected' && (
                            <>
                                <div className="absolute w-64 h-64 rounded-full border border-white/5 animate-ping" style={{ animationDuration: '3s' }} />
                                <div className="absolute w-48 h-48 rounded-full border border-white/10 animate-ping" style={{ animationDuration: '2s' }} />
                            </>
                        )}
                        {(callStatus === 'dialing' || callStatus === 'ringing') && (
                            <>
                                <div className="absolute w-40 h-40 rounded-full bg-primary/10 animate-pulse" />
                                <div className="absolute w-56 h-56 rounded-full bg-primary/5 animate-pulse" style={{ animationDelay: '0.5s' }} />
                            </>
                        )}
                    </div>

                    <div className="relative z-10 flex flex-col items-center">
                        {/* Avatar */}
                        <div className={`relative mb-6 ${callStatus === 'ringing' ? 'animate-bounce' : ''}`}>
                            <div className={`bg-white/10 p-1 rounded-full ${callStatus === 'connected' ? 'ring-4 ring-green-500/30' : 'ring-4 ring-white/10'}`}>
                                <Avatar className="w-28 h-28 border-2 border-white/20">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${getConversationName()}`} />
                                    <AvatarFallback className="text-3xl bg-primary/20 text-white">{getConversationName()[0]}</AvatarFallback>
                                </Avatar>
                            </div>
                            {callStatus === 'connected' && (
                                <span className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-gray-800 rounded-full" />
                            )}
                        </div>

                        {/* Name */}
                        <h3 className="text-2xl font-bold text-white mb-1">
                            {isIncomingCall ? (incomingCallData?.callerName || otherUser?.name || 'Utilisateur') : (otherUser?.name || 'Utilisateur')}
                        </h3>

                        {/* Status */}
                        <p className="text-white/60 mb-2 text-sm">
                            {isIncomingCall && 'Appel vocal entrant...'}
                            {callStatus === 'dialing' && 'Appel en cours...'}
                            {callStatus === 'connected' && 'Appel vocal'}
                        </p>

                        {/* Timer */}
                        {callStatus === 'connected' && (
                            <div className="flex items-center gap-1.5 text-white/80 mb-8">
                                <Clock className="w-4 h-4" />
                                <span className="text-lg font-mono">{formatCallDuration(callDuration)}</span>
                            </div>
                        )}

                        {callStatus !== 'connected' && <div className="mb-8" />}

                        {/* Action buttons */}
                        <div className="flex items-center gap-6">
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
                                            className={`rounded-full w-14 h-14 shadow-lg ${isMuted ? 'bg-white/20 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                            onClick={toggleMute}
                                        >
                                            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                                        </Button>
                                        <span className="text-white/60 text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-2">
                                        <Button
                                            size="lg"
                                            className={`rounded-full w-14 h-14 shadow-lg ${isSpeakerOn ? 'bg-primary/40 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
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

                    {/* Hidden Audio Elements */}
                    <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
                    <audio ref={localAudioRef} autoPlay playsInline muted className="hidden" />
                </div>
            )}

            {/* Header */}
            <div className="fixed top-0 left-0 right-0 md:static md:w-full bg-background border-b border-border z-[60] h-16 flex items-center px-4 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/chat')}
                    className="mr-3 md:hidden"
                >
                    <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                </Button>

                <Avatar className="h-10 w-10 border border-border">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${getConversationName()}`} />
                    <AvatarFallback>{getConversationName()[0]}</AvatarFallback>
                </Avatar>

                <div className="ml-3 flex-1">
                    <h2 className="font-semibold text-foreground">{getConversationName()}</h2>
                    {otherUser && (
                        <p className="text-xs text-muted-foreground">
                            {otherUser.inCall ? (
                                <span className="text-amber-500 font-medium">En appel</span>
                            ) : otherUser.isOnline ? (
                                <span className="text-green-500 font-medium">En ligne</span>
                            ) : (
                                'Hors ligne'
                            )}
                        </p>
                    )}
                </div>

                {/* Call Button */}
                <div className="flex items-center gap-1 md:mr-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={startCall}
                        disabled={isCallActive}
                        title="Appel vocal"
                        className="hover:bg-primary/10"
                    >
                        <Phone className="w-5 h-5 text-muted-foreground hover:text-primary" />
                    </Button>
                </div>
            </div>

            {/* Messages */}
            <div
                className="flex-1 overflow-y-auto px-4 pt-16 md:pt-4 pb-32 md:pb-4 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                ref={scrollRef}
            >
                {/* Load More Button */}
                {hasMore && (
                    <div className="flex justify-center py-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadMoreHistory}
                            disabled={loadingMore}
                            className="text-muted-foreground text-xs h-6"
                        >
                            {loadingMore ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ArrowUp className="w-3 h-3 mr-1" />}
                            Charger plus anciens
                        </Button>
                    </div>
                )}
                {messages.filter((message, index, self) =>
                    self.findIndex(m => m.id === message.id) === index
                ).map((message) => {
                    const isOwn = message.senderId === currentUser?.id;
                    const decryptedContent = decryptMessageContent(message);
                    const canEdit = canEditOrDelete(message);
                    const isTemp = message.id.startsWith('temp-');

                    return (
                        <div
                            key={message.id}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isTemp ? 'opacity-70' : ''}`}
                        >
                            <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                                {editingMessageId === message.id ? (
                                    <div className="bg-card rounded-lg p-3 w-full border border-border">
                                        <Input
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="mb-2 bg-muted border-border"
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={() => handleEditMessage(message.id)}>
                                                Enregistrer
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => { setEditingMessageId(null); setEditContent(''); }}>
                                                Annuler
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="group relative">
                                        {decryptedContent && decryptedContent.trim() && (
                                            <div
                                                className={`rounded-2xl px-4 py-2 border ${isOwn
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'bg-muted text-foreground border-border'
                                                    }`}
                                            >
                                                <p className="break-words whitespace-pre-wrap">{decryptedContent}</p>
                                                {message.isEdited && (
                                                    <p className="text-xs opacity-70 mt-1">Modifie</p>
                                                )}
                                            </div>
                                        )}

                                        {message.attachments && message.attachments.length > 0 && (
                                            <div className={`${decryptedContent && decryptedContent.trim() ? 'mt-2' : ''} space-y-2`}>
                                                {message.attachments.map((att, idx) => (
                                                    <EncryptedAttachment
                                                        key={idx}
                                                        attachment={att}
                                                        isOwnMessage={isOwn}
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true, locale: fr })}
                                                {isTemp && ' - Envoi...'}
                                            </span>

                                            {isOwn && canEdit && !isTemp && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                                                            <MoreVertical className="w-4 h-4" />
                                                            <span className="sr-only">Actions</span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => { setEditingMessageId(message.id); setEditContent(decryptedContent); }}>
                                                            <Edit2 className="w-4 h-4 mr-2" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDeleteMessage(message.id)} className="text-destructive">
                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                            Supprimer
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="fixed bottom-16 left-0 right-0 md:static md:bottom-auto md:w-full bg-background border-t border-border p-4 z-[60]">
                {selectedFiles.length > 0 && (
                    <div className="mb-3 flex gap-2 flex-wrap">
                        {selectedFiles.map((file, idx) => (
                            <div key={idx} className="bg-muted rounded px-3 py-2 flex items-center gap-2 text-sm border border-border">
                                {file.type.startsWith('image/') ? (
                                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                )}
                                <span className="max-w-[150px] truncate text-foreground">{file.name}</span>
                                <button onClick={() => removeFile(idx)} className="text-destructive hover:text-red-300">x</button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,.docx"
                        onChange={handleFileSelect}
                        className="hidden"
                    />

                    {!isRecordingAudio && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={sending}
                                className="text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                                <Paperclip className="w-5 h-5" />
                            </Button>

                            <Input
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Message chiffre..."
                                className="flex-1"
                                disabled={sending}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                            />
                        </>
                    )}

                    <AudioRecorderComponent
                        onAudioRecorded={handleAudioRecorded}
                        onRecordingStatusChange={setIsRecordingAudio}
                    />

                    {!isRecordingAudio && (
                        <Button
                            onClick={handleSendMessage}
                            disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            {sending ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Send className="w-5 h-5" />
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
