'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ArrowLeft, Send, Paperclip, Loader2, Image as ImageIcon, FileText, MoreVertical, Edit2, Trash2, ArrowUp, Phone, RotateCw } from 'lucide-react';
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
import { useCallContext } from '@/src/contexts/CallContext';
import { cn } from '@/src/lib/utils';

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

/* Bulle de message avec mémorisation du déchiffrement */
function DiscussionMessageBubble({
    message,
    isOwn,
    canEdit,
    currentUser,
    otherUser,
    privateKey,
    editingMessageId,
    editContent,
    onEditContentChange,
    onEditOpen,
    onEditSave,
    onEditCancel,
    onDelete,
    onRetry,
    isFailed,
    displayCreatedAt,
}: {
    message: Message;
    isOwn: boolean;
    canEdit: boolean;
    currentUser: { id: string; name: string | null; email: string; publicKey: string } | null;
    otherUser: { id: string; name: string | null; email: string; publicKey: string } | null;
    privateKey: string | null;
    editingMessageId: string | null;
    editContent: string;
    onEditContentChange: (v: string) => void;
    onEditOpen: (content: string) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    onDelete: () => void;
    onRetry?: () => void;
    isFailed: boolean;
    displayCreatedAt?: string;
}) {
    const decryptedContent = useMemo(() => {
        if (!currentUser || !otherUser || !privateKey) return '[Chiffre]';
        try {
            const senderPublicKey = message.senderId === currentUser.id
                ? otherUser.publicKey
                : (message.sender.publicKey || otherUser.publicKey);
            return decryptMessage(message.content, privateKey, senderPublicKey) || '';
        } catch {
            return '[Erreur de dechiffrement]';
        }
    }, [message.id, message.content, message.senderId, message.sender?.publicKey, currentUser?.id, otherUser?.publicKey, privateKey]);

    const timestamp = displayCreatedAt ?? message.createdAt;

    return (
        <div
            className={cn(
                'flex',
                isOwn ? 'justify-end' : 'justify-start'
            )}
        >
            <div className={cn('max-w-[75%]', isOwn ? 'items-end' : 'items-start', 'flex flex-col')}>
                {editingMessageId === message.id ? (
                    <div className="bg-card rounded-lg p-3 w-full border border-border">
                        <Input
                            value={editContent}
                            onChange={(e) => onEditContentChange(e.target.value)}
                            className="mb-2 bg-muted border-border"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={onEditSave}>Enregistrer</Button>
                            <Button size="sm" variant="ghost" onClick={onEditCancel}>Annuler</Button>
                        </div>
                    </div>
                ) : (
                    <div className={cn('group relative', isFailed && 'ring-1 ring-destructive/50 rounded-2xl')}>
                        {decryptedContent && decryptedContent.trim() && (
                            <div
                                className={cn(
                                    'rounded-2xl px-4 py-2 border',
                                    isOwn
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-muted text-foreground border-border'
                                )}
                            >
                                <p className="break-words whitespace-pre-wrap">{decryptedContent}</p>
                                {message.isEdited && (
                                    <p className="text-xs opacity-70 mt-1">Modifie</p>
                                )}
                            </div>
                        )}

                        {message.attachments && message.attachments.length > 0 && (
                            <div className={cn(decryptedContent?.trim() ? 'mt-2' : '', 'space-y-2')}>
                                {message.attachments.map((att, idx) => (
                                    <EncryptedAttachment
                                        key={idx}
                                        attachment={att}
                                        isOwnMessage={isOwn}
                                    />
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: fr })}
                            </span>
                            {isFailed && onRetry && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs text-destructive border-destructive/50 hover:bg-destructive/10"
                                    onClick={onRetry}
                                >
                                    <RotateCw className="w-3 h-3 mr-1" />
                                    Réessayer
                                </Button>
                            )}
                            {isOwn && canEdit && !isFailed && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                                            <MoreVertical className="w-4 h-4" />
                                            <span className="sr-only">Actions</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => onEditOpen(decryptedContent || '')}>
                                            <Edit2 className="w-4 h-4 mr-2" />
                                            Modifier
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={onDelete} className="text-destructive">
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
}

export default function DiscussionPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
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

    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
    const [failedMessagePayloads, setFailedMessagePayloads] = useState<Map<string, { encryptedContent: string; attachments?: { filename: string; type: string; data: string }[] }>>(new Map());
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stableMessageKeysRef = useRef<Map<string, string>>(new Map());
    const stableMessageTimestampsRef = useRef<Map<string, string>>(new Map());

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
    }, []);

    // Real-time message handlers
    const handleNewMessage = useCallback((data: { conversationId: string; message: Message }) => {
        if (data.conversationId !== conversationId) return;
        const me = getUser();
        setMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            const ourTemp = prev.find((m) => m.id.startsWith('temp-') && m.senderId === me?.id);
            if (ourTemp && data.message.senderId === me?.id) {
                stableMessageKeysRef.current.set(data.message.id, ourTemp.id);
                stableMessageTimestampsRef.current.set(data.message.id, ourTemp.createdAt);
                return prev.map((m) => (m.id === ourTemp.id ? data.message : m));
            }
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

    const handleUserTyping = useCallback((data: { conversationId: string; userId: string; isTyping: boolean }) => {
        const me = getUser();
        if (data.conversationId !== conversationId || data.userId === me?.id) return;
        setTypingUsers(prev => ({ ...prev, [data.userId]: data.isTyping }));
    }, [conversationId]);

    const { socket: pusher, isConnected, joinConversation, leaveConversation, userChannel, startTyping, stopTyping } = useWebSocket(
        handleNewMessage,
        handleMessageEdited,
        handleMessageDeleted,
        handleUserTyping
    );

    const currentUser = getUser();
    const otherUser = conversation?.members.find(m => m.user.id !== currentUser?.id)?.user;
    const callContext = useCallContext();
    const isCallActiveRef = useRef(false);
    isCallActiveRef.current = callContext?.activeCall !== null;

    // --- Check call status on mount : redirection si appel ailleurs, ou appliquer appel en attente ---
    useEffect(() => {
        if (!conversationId) return;

        const applyPendingCall = (data: { callerId: string; callerName?: string; offer: any; conversationId: string }) => {
            callContext?.setIncomingCallData(data);
        };

        const checkCallStatus = async (claim = true) => {
            try {
                const res = await fetchWithAuth(`/api/call/status?claim=${claim ? '1' : '0'}`);
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
                    const shouldAutoAnswer = searchParams?.get('answer') === '1';
                    if (shouldAutoAnswer && callContext?.answerCallWithData) {
                        callContext.answerCallWithData(pendingCall);
                        router.replace(`/chat/discussion/${conversationId}`, { scroll: false });
                    } else {
                        applyPendingCall(pendingCall);
                    }
                    return;
                }
            } catch {
                // Ignorer
            }

            const stored = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pendingIncomingCall');
            if (stored) {
                try {
                    const data = JSON.parse(stored);
                    if (data.conversationId === conversationId && data.offer) {
                        sessionStorage.removeItem('pendingIncomingCall');
                        applyPendingCall(data);
                    }
                } catch {
                    sessionStorage.removeItem('pendingIncomingCall');
                }
            }
        };

        checkCallStatus(true);

        const onVisible = () => {
            if (document.visibilityState === 'visible' && !isCallActiveRef.current) {
                checkCallStatus(true);
            }
        };
        document.addEventListener('visibilitychange', onVisible);

        const retryTimer = setTimeout(() => {
            if (!isCallActiveRef.current) checkCallStatus(true);
        }, 800);

        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            clearTimeout(retryTimer);
        };
    }, [conversationId, router, callContext, searchParams]);

    // --- Mark as read when viewing conversation ---
    useEffect(() => {
        if (!conversationId || loading) return;

        // Mark as read on entering conversation
        fetchWithAuth(`/api/conversations/${conversationId}/read`, {
            method: 'POST',
        }).catch(() => { });
    }, [conversationId, loading]);

    // Also mark as read when new messages arrive while viewing
    useEffect(() => {
        if (!conversationId || loading || messages.length === 0) return;

        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.senderId !== currentUser?.id) {
            fetchWithAuth(`/api/conversations/${conversationId}/read`, {
                method: 'POST',
            }).catch(() => { });
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

    useEffect(() => () => {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }, []);

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

    const typingCount = Object.keys(typingUsers).filter((uid) => typingUsers[uid]).length;
    useEffect(() => {
        if (typingCount > 0) scrollToBottom();
    }, [typingCount, scrollToBottom]);

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
        let payload: { encryptedContent: string; attachments: { filename: string; type: string; data: string }[] } | null = null;

        try {
            const base64Data = await fileToBase64(audioFile);
            const attachment = { filename: audioFile.name, type: 'AUDIO', data: base64Data };
            const encryptedContent = encryptMessage('', privateKey, otherUser.publicKey);
            payload = { encryptedContent, attachments: [attachment] };

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
                    stableMessageKeysRef.current.set(data.message.id, tempId);
                    stableMessageTimestampsRef.current.set(data.message.id, optimisticMessage.createdAt);
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
                }
                scrollToBottom();
            } else {
                toast.error("Erreur d'envoi du message vocal");
                if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
            }
        } catch (error) {
            console.error('Send audio error:', error);
            toast.error("Erreur d'envoi du message vocal");
            if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
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
        if (conversationId) stopTyping(conversationId);

        const tempId = `temp-${Date.now()}`;
        let payload: { encryptedContent: string; attachments?: { filename: string; type: string; data: string }[] } | null = null;

        try {
            const attachments: { filename: string; type: string; data: string }[] = [];

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
            payload = { encryptedContent: cipherText, attachments: attachments.length > 0 ? attachments : undefined };

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
                    stableMessageKeysRef.current.set(data.message.id, tempId);
                    stableMessageTimestampsRef.current.set(data.message.id, optimisticMessage.createdAt);
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
                }
            } else {
                const error = await response.json();
                toast.error(error.error || "Erreur d'envoi");
                if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
            }
        } catch (error) {
            console.error('Send message error:', error);
            toast.error("Erreur d'envoi du message");
            if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
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

    const handleRetryMessage = useCallback(async (tempId: string) => {
        const payload = failedMessagePayloads.get(tempId);
        if (!payload || !conversationId) return;

        setSending(true);
        try {
            const response = await fetchWithAuth(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: payload.encryptedContent,
                    attachments: payload.attachments,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setMessages((prev) => {
                    const temp = prev.find((m) => m.id === tempId);
                    if (temp) {
                        stableMessageKeysRef.current.set(data.message.id, tempId);
                        stableMessageTimestampsRef.current.set(data.message.id, temp.createdAt);
                    }
                    return prev.map((m) => (m.id === tempId ? data.message : m));
                });
                setFailedMessagePayloads(prev => {
                    const next = new Map(prev);
                    next.delete(tempId);
                    return next;
                });
                scrollToBottom();
                toast.success('Message envoye');
            } else {
                const error = await response.json();
                toast.error(error.error || "Erreur d'envoi");
            }
        } catch (error) {
            toast.error("Erreur d'envoi du message");
        } finally {
            setSending(false);
        }
    }, [failedMessagePayloads, conversationId, scrollToBottom]);

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

    if (loading) {
        return (
            <div className="flex flex-col h-full bg-background pt-16 md:pt-4 pb-32 md:pb-4 px-4">
                <div className="flex justify-center py-4">
                    <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                </div>
                <div className="space-y-4 flex-1 max-w-2xl mx-auto w-full">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                            <div className={cn(
                                'rounded-2xl h-12 animate-pulse',
                                i % 2 === 0 ? 'bg-primary/20 w-3/4' : 'bg-muted w-2/3'
                            )} />
                        </div>
                    ))}
                </div>
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
                        disabled={!!callContext?.activeCall || !otherUser}
                        onMouseEnter={callContext?.prewarmMedia}
                        onClick={() => {
                            if (otherUser && conversationId) {
                                callContext?.startCall(conversationId, otherUser.id, otherUser.name || otherUser.email || 'Utilisateur');
                            }
                        }}
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
                ).map((message) => (
                    <DiscussionMessageBubble
                        key={stableMessageKeysRef.current.get(message.id) ?? message.id}
                        message={message}
                        displayCreatedAt={stableMessageTimestampsRef.current.get(message.id)}
                        isOwn={message.senderId === currentUser?.id}
                        canEdit={canEditOrDelete(message)}
                        currentUser={currentUser ?? null}
                        otherUser={otherUser ?? null}
                        privateKey={privateKey}
                        editingMessageId={editingMessageId}
                        editContent={editContent}
                        onEditContentChange={setEditContent}
                        onEditOpen={(content) => {
                            setEditingMessageId(message.id);
                            setEditContent(content);
                        }}
                        onEditSave={() => handleEditMessage(message.id)}
                        onEditCancel={() => { setEditingMessageId(null); setEditContent(''); }}
                        onDelete={() => handleDeleteMessage(message.id)}
                        onRetry={failedMessagePayloads.has(message.id) ? () => handleRetryMessage(message.id) : undefined}
                        isFailed={failedMessagePayloads.has(message.id)}
                    />
                ))}
                {typingCount > 0 && (
                    <div className="flex justify-start items-center gap-1.5 py-0.5 animate-pulse">
                        <span className="flex gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                        </span>
                        <span className="text-[11px] text-muted-foreground/70">
                            {otherUser?.name || otherUser?.email || 'Quelqu\'un'}
                        </span>
                    </div>
                )}
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
                                onChange={(e) => {
                                    setNewMessage(e.target.value);
                                    if (conversationId) {
                                        startTyping(conversationId);
                                        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                        typingTimeoutRef.current = setTimeout(() => {
                                            stopTyping(conversationId);
                                            typingTimeoutRef.current = null;
                                        }, 2000);
                                    }
                                }}
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
