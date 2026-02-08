'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ArrowLeft, Send, Paperclip, Loader2, Image as ImageIcon, FileText, MoreVertical, Edit2, Trash2, ArrowUp, Phone, PhoneIncoming, PhoneOff, Mic, MicOff } from 'lucide-react';
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
        };
    }[];
}

const fetcher = async (url: string) => {
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
};

export default function DiscussionPage() {
    const params = useParams();
    const router = useRouter();
    const conversationId = params?.id as string;

    const { data: conversationData } = useSWR(
        conversationId ? `/api/conversations/${conversationId}` : null,
        fetcher
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
    const [incomingCallData, setIncomingCallData] = useState<{ callerId: string; offer: any; conversationId: string } | null>(null);
    const [isMuted, setIsMuted] = useState(false);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null); // Even for audio, useful to attach stream
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    const { socket, isConnected } = useWebSocket(
        (data) => {
            // On new message via socket - update messages
            // This replaces/augments the polling
            setMessages(prev => {
                if (prev.some(m => m.id === data.message.id)) return prev;
                return [...prev, data.message];
            });
            scrollToBottom();
        }
    );

    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false); // For history
    const [hasMore, setHasMore] = useState(true);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const currentUser = getUser();
    const otherUser = conversation?.members.find(m => m.user.id !== currentUser?.id)?.user;

    // Initial Fetch
    useEffect(() => {
        if (!conversationId) return;

        const loadInitialMessages = async () => {
            try {
                const res = await fetchWithAuth(`/api/conversations/${conversationId}/messages?limit=50`);
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.messages);
                    // If we got fewer than limit, assume no more history
                    if (data.messages.length < 50) {
                        setHasMore(false);
                    }
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


    // WebRTC Logic
    useEffect(() => {
        if (!socket) return;

        socket.on('call:incoming', async (data) => {
            if (isCallActive) {
                socket.emit('call:reject', { callerId: data.callerId });
                return;
            }
            setIncomingCallData(data);
            setIsIncomingCall(true);
            setCallStatus('ringing');

            // Play ringtone if desired
        });

        socket.on('call:answered', async (data) => {
            if (!peerConnectionRef.current) return;
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            setCallStatus('connected');
        });

        socket.on('call:rejected', () => {
            toast.info('Appel rejeté');
            endCall();
        });

        socket.on('call:ended', () => {
            toast.info('Appel terminé');
            endCall();
        });

        socket.on('call:ice-candidate', async (data) => {
            if (!peerConnectionRef.current) return;
            try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        });

        return () => {
            socket.off('call:incoming');
            socket.off('call:answered');
            socket.off('call:rejected');
            socket.off('call:ended');
            socket.off('call:ice-candidate');
        };
    }, [socket, isCallActive]);

    const initializePeerConnection = () => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate && otherUser) {
                socket?.emit('call:ice-candidate', {
                    targetUserId: otherUser.id,
                    candidate: event.candidate
                });
            }
        };

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    };

    const startCall = async () => {
        if (!otherUser) return;
        setIsCallActive(true);
        setCallStatus('dialing');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);

            const pc = initializePeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket?.emit('call:invite', {
                recipientId: otherUser.id,
                offer: offer,
                conversationId: conversationId
            });

        } catch (err) {
            console.error('Error starting call:', err);
            toast.error('Impossible d\'accéder au microphone');
            endCall();
        }
    };

    const answerCall = async () => {
        if (!incomingCallData) return;
        setIsIncomingCall(false);
        setIsCallActive(true);
        setCallStatus('connected');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);

            const pc = initializePeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket?.emit('call:answer', {
                callerId: incomingCallData.callerId,
                answer: answer
            });

        } catch (err) {
            console.error('Error answering call:', err);
            toast.error('Erreur lors de la réponse');
            endCall();
        }
    };

    const rejectCall = () => {
        if (incomingCallData) {
            socket?.emit('call:reject', { callerId: incomingCallData.callerId });
        }
        setIsIncomingCall(false);
        setIncomingCallData(null);
        setCallStatus('idle');
    };

    const endCall = () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (isCallActive && otherUser) {
            // Only emit if we were actually in a call/dialing
            socket?.emit('call:end', { targetUserId: otherUser.id });
        }

        setIsCallActive(false);
        setIsIncomingCall(false);
        setCallStatus('idle');
        setIncomingCallData(null);
        setRemoteStream(null);
    };

    const toggleMute = () => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsMuted(!isMuted);
        }
    };

    // Auto-play remote audio
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);


    // Polling for new messages (Delta updates)
    useEffect(() => {
        if (!conversationId || loading) return;

        const interval = setInterval(async () => {
            const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
            const lastRealMessage = [...messages].reverse().find(m => !m.id.startsWith('temp-'));
            const queryParam = lastRealMessage ? `?after=${lastRealMessage.createdAt}` : '?limit=50';

            try {
                const res = await fetchWithAuth(`/api/conversations/${conversationId}/messages${queryParam}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.messages && data.messages.length > 0) {
                        // Filter out any duplicates just in case
                        setMessages(prev => {
                            const existingIds = new Set(prev.map(m => m.id));
                            const newUnique = data.messages.filter((m: Message) => !existingIds.has(m.id));
                            if (newUnique.length === 0) return prev;

                            // If user is at bottom, auto-scroll? Handled by useEffect dependency
                            return [...prev, ...newUnique];
                        });
                    }
                }
            } catch (error) {
                // Silent fail for polling
                console.error("Polling error", error);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [conversationId, loading, messages.length]); // Re-create interval when length changes to get closure over latest messages? OR use functional state updates.
    // Actually, accessing `messages` inside interval needs it to be in dependency or use functional update.
    // Optimal: Use a ref for `messages` or functional update logic. Functional update logic is safer but we need `lastMessage` for the query URL.
    // So we need `messages` in dependency array. It will reset interval on every new message. This is fine.

    // Load More History
    const loadMoreHistory = async () => {
        if (!conversationId || loadingMore || !hasMore || messages.length === 0) return;

        setLoadingMore(true);
        // Save scroll position
        const scrollContainer = scrollRef.current;
        const oldScrollHeight = scrollContainer?.scrollHeight || 0;

        const firstMessage = messages[0];
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/messages?cursor=${firstMessage.id}&limit=50`);
            if (res.ok) {
                const data = await res.json();
                if (data.messages && data.messages.length > 0) {
                    setMessages(prev => [...data.messages, ...prev]);

                    // Restore scroll position after render
                    requestAnimationFrame(() => {
                        if (scrollContainer) {
                            const newScrollHeight = scrollContainer.scrollHeight;
                            scrollContainer.scrollTop = newScrollHeight - oldScrollHeight;
                        }
                    });

                    if (data.messages.length < 50) setHasMore(false);
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

    // Auto scroll to bottom only on initial load or when sending own message
    const isFirstLoad = useRef(true);
    const lastMessageCount = useRef(0);

    useEffect(() => {
        if (loading) return;

        // Initial load scroll
        if (isFirstLoad.current && messages.length > 0) {
            scrollToBottom();
            isFirstLoad.current = false;
        }

        // Auto scroll on new message IF it is mine OR user is already near bottom
        if (messages.length > lastMessageCount.current) {
            const lastMsg = messages[messages.length - 1];
            const isMine = lastMsg?.senderId === currentUser?.id;

            // Simple logic: Always scroll if mine. If others, check position? 
            // For now, let's scroll if mine.
            if (isMine) {
                scrollToBottom();
            }
        }
        lastMessageCount.current = messages.length;
    }, [messages, loading, currentUser?.id]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const validFiles = files.filter(file => {
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            if (!validTypes.includes(file.type)) {
                toast.error(`Type de fichier non autorisé: ${file.name}`);
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
            reader.onload = () => {
                resolve(reader.result as string);
            };
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
            toast.error("Clé de chiffrement manquante");
            return;
        }

        setSending(true);

        try {
            const base64Data = await fileToBase64(audioFile);

            const attachment = {
                filename: audioFile.name,
                type: 'AUDIO',
                data: base64Data,
            };

            const encryptedContent = encryptMessage(
                '',
                privateKey,
                otherUser.publicKey
            );

            // Optimistic update
            const tempId = `temp-${Date.now()}`;
            const optimisticMessage: Message = {
                id: tempId,
                content: encryptedContent,
                senderId: currentUser.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isEdited: false,
                attachments: [attachment],
                sender: {
                    id: currentUser.id,
                    name: currentUser.name || '',
                    email: currentUser.email || '',
                    publicKey: currentUser.publicKey || '',
                }
            };

            // Update local state immediately
            setMessages(prev => [...prev, optimisticMessage]);

            const response = await fetchWithAuth(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: encryptedContent,
                    attachments: [attachment],
                }),
            });

            if (response.ok) {
                // The polling will technically pick this up eventually, but we can also replace the temp ID if the server returned the real object
                // For simplicity in this logic, we might just let polling handle the "real" one and dedup logic handle it
                // Or we can manually fetch the latest message to confirm success
                const data = await response.json();
                if (data.message) {
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
                }
                scrollToBottom();
            } else {
                toast.error("Erreur d'envoi du message vocal");
                // Remove optimistic message
                setMessages(prev => prev.filter(m => m.id !== tempId));
            }
        } catch (error) {
            console.error('Send audio error:', error);
            toast.error("Erreur d'envoi du message vocal");
            setMessages(prev => prev.filter(m => m.id.startsWith('temp-') === false)); // Rough cleanup
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
    }, [currentUser, privateKey]);

    const handleUnlock = () => {
        if (!currentUser || !password) return;

        try {
            const decrypted = decryptPrivateKey(currentUser.encryptedPrivateKey, password);
            setPrivateKey(decrypted);
            sessionStorage.setItem(`privateKey_${currentUser.id}`, decrypted);
            setShowPasswordDialog(false);
            setPassword('');
            toast.success('Clé de chiffrement déverrouillée');
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

        // Clear UI immediately for better UX
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

                    attachments.push({
                        filename: file.name,
                        type: fileType,
                        data: base64Data,
                    });
                }
            }

            const cipherText: string = encryptMessage(
                currentMessage.trim() || '',
                privateKey,
                otherUser.publicKey
            );

            // Optimistic update
            const tempId = `temp-${Date.now()}`;
            const optimisticMessage: Message = {
                id: tempId,
                content: cipherText,
                senderId: currentUser.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isEdited: false,
                attachments: attachments,
                sender: {
                    id: currentUser.id,
                    name: currentUser.name || '',
                    email: currentUser.email || '',
                    publicKey: currentUser.publicKey || '',
                }
            };

            // Add optimistic message
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
                console.error('HTTP error:', error);
                toast.error(error.error || 'Erreur d\'envoi');
                // Rollback
                setMessages(prev => prev.filter(m => m.id !== tempId));
                // Restore input
                setNewMessage(currentMessage);
                setSelectedFiles(currentFiles);
            }
        } catch (error) {
            console.error('Send message error:', error);
            toast.error('Erreur d\'envoi du message');
            setMessages(prev => prev.filter(m => m.id.startsWith('temp-') === false));
            setNewMessage(currentMessage);
            setSelectedFiles(currentFiles);
        } finally {
            setSending(false);
        }
    };

    const handleEditMessage = async (messageId: string) => {
        if (!editContent.trim() || !currentUser || !otherUser || !privateKey) return;

        const originalMessages = messages;

        try {
            const encryptedContent = encryptMessage(
                editContent.trim(),
                privateKey,
                otherUser.publicKey
            );

            // Optimistic update
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
                toast.success('Message modifié');
            } else {
                // Rollback requires storing original message content to revert - for now just generic error toast
                toast.error('Erreur de modification');
                // Could re-fetch all to sync
            }
        } catch (error) {
            toast.error('Erreur de modification');
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!confirm('Supprimer ce message ?')) return;

        const originalMessages = messages;

        try {
            // Optimistic update
            setMessages(prev => prev.filter(msg => msg.id !== messageId));

            const response = await fetchWithAuth(`/api/messages/${messageId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Message supprimé');
            } else {
                // Rollback
                setMessages(originalMessages);
                toast.error('Erreur de suppression');
            }
        } catch (error) {
            setMessages(originalMessages);
            toast.error('Erreur de suppression');
        }
    };

    const decryptMessageContent = (message: Message): string => {
        if (!currentUser || !otherUser || !privateKey) return '[Chiffré]';

        try {
            const senderPublicKey = message.senderId === currentUser.id
                ? otherUser.publicKey
                : (message.sender.publicKey || otherUser.publicKey);

            return decryptMessage(
                message.content,
                privateKey,
                senderPublicKey
            ) || '';
        } catch (error) {
            return '[Erreur de déchiffrement]';
        }
    };

    const canEditOrDelete = (message: Message): boolean => {
        if (message.senderId !== currentUser?.id) return false;
        const messageTime = new Date(message.createdAt).getTime();
        const now = Date.now();
        return (now - messageTime) < 5 * 60 * 1000; // 5 minutes
    };

    const getConversationName = () => {
        if (!conversation) return 'Chargement...';
        if (conversation.isDirect && otherUser) {
            return otherUser.name || otherUser.email;
        }
        return conversation.name || 'Discussion';
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
                        <DialogTitle>Déverrouiller la discussion</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground mb-4">
                            Entrez votre mot de passe pour déchiffrer votre clé privée et accéder aux messages.
                        </p>
                        <Input
                            type="password"
                            placeholder="Votre mot de passe"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
                        />
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUnlock}>Déverrouiller</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Call Overlay */}
            {(isCallActive || isIncomingCall) && (
                <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center flex-col">
                    <div className="bg-card p-6 rounded-full w-32 h-32 flex items-center justify-center mb-8 animate-pulse border-4 border-primary/20">
                        <Avatar className="w-24 h-24">
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${getConversationName()}`} />
                            <AvatarFallback>{getConversationName()[0]}</AvatarFallback>
                        </Avatar>
                    </div>

                    <h3 className="text-2xl font-bold mb-2">
                        {isIncomingCall ? 'Appel entrant...' : (callStatus === 'connected' ? 'En appel' : 'Appel en cours...')}
                    </h3>
                    <p className="text-muted-foreground mb-8 text-lg">
                        {isIncomingCall ? incomingCallData?.callerId : (otherUser?.name || 'Utilisateur')}
                    </p>

                    <div className="flex items-center gap-8">
                        {isIncomingCall ? (
                            <>
                                <Button
                                    size="lg"
                                    className="rounded-full w-16 h-16 bg-red-500 hover:bg-red-600"
                                    onClick={rejectCall}
                                >
                                    <PhoneOff className="w-8 h-8 text-white" />
                                </Button>
                                <Button
                                    size="lg"
                                    className="rounded-full w-16 h-16 bg-green-500 hover:bg-green-600 animate-bounce"
                                    onClick={answerCall}
                                >
                                    <PhoneIncoming className="w-8 h-8 text-white" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    size="lg"
                                    variant="outline"
                                    className={`rounded-full w-14 h-14 ${isMuted ? 'bg-muted text-muted-foreground' : ''}`}
                                    onClick={toggleMute}
                                >
                                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                                </Button>
                                <Button
                                    size="lg"
                                    className="rounded-full w-16 h-16 bg-red-500 hover:bg-red-600"
                                    onClick={endCall}
                                >
                                    <PhoneOff className="w-8 h-8 text-white" />
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Hidden Audio Elements */}
                    <audio ref={remoteVideoRef} autoPlay playsInline className="hidden" />
                    <audio ref={localVideoRef} autoPlay playsInline muted className="hidden" />
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
                            {otherUser.isOnline ? 'En ligne' : 'Hors ligne'}
                        </p>
                    )}
                </div>

                {/* Call Buttons */}
                <div className="flex items-center gap-1 md:mr-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={startCall}
                        disabled={isCallActive || !otherUser?.isOnline}
                        title="Appel vocal"
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
                {messages.map((message) => {
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
                                            <Button
                                                size="sm"
                                                onClick={() => handleEditMessage(message.id)}
                                            >
                                                Enregistrer
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setEditingMessageId(null);
                                                    setEditContent('');
                                                }}
                                            >
                                                Annuler
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="group relative">
                                        {/* Only show text bubble if there's actual content */}
                                        {decryptedContent && decryptedContent.trim() && (
                                            <div
                                                className={`rounded-2xl px-4 py-2 border ${isOwn
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'bg-muted text-foreground border-border'
                                                    }`}
                                            >
                                                <p className="break-words whitespace-pre-wrap">{decryptedContent}</p>
                                                {message.isEdited && (
                                                    <p className="text-xs opacity-70 mt-1">Modifié</p>
                                                )}
                                            </div>
                                        )}

                                        {/* Attachments - shown with transparent background if no text */}
                                        {message.attachments && message.attachments.length > 0 && (
                                            <div className={`${decryptedContent && decryptedContent.trim() ? 'mt-2' : ''} space-y-2`}>
                                                {message.attachments.map((att, idx) => {
                                                    const senderKey = message.senderId === currentUser?.id
                                                        ? otherUser?.publicKey
                                                        : (message.sender.publicKey || otherUser?.publicKey);

                                                    if (!senderKey) return null;

                                                    return (
                                                        <EncryptedAttachment
                                                            key={idx}
                                                            attachment={att}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(message.createdAt), {
                                                    addSuffix: true,
                                                    locale: fr,
                                                })}
                                                {isTemp && ' • Envoi...'}
                                            </span>

                                            {isOwn && canEdit && !isTemp && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                                        >
                                                            <MoreVertical className="w-4 h-4" />
                                                            <span className="sr-only">Actions</span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setEditingMessageId(message.id);
                                                                setEditContent(decryptedContent);
                                                            }}
                                                        >
                                                            <Edit2 className="w-4 h-4 mr-2" />
                                                            Modifier
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleDeleteMessage(message.id)}
                                                            className="text-destructive"
                                                        >
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
                            <div
                                key={idx}
                                className="bg-muted rounded px-3 py-2 flex items-center gap-2 text-sm border border-border"
                            >
                                {file.type.startsWith('image/') ? (
                                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                )}
                                <span className="max-w-[150px] truncate text-foreground">{file.name}</span>
                                <button
                                    onClick={() => removeFile(idx)}
                                    className="text-destructive hover:text-red-300"
                                >
                                    ×
                                </button>
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
                                placeholder="Message chiffré..."
                                className="flex-1"
                                disabled={sending}
                                onKeyPress={(e) => {
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
