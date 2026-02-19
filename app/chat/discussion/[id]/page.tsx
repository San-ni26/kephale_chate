'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ArrowLeft, Send, Paperclip, Loader2, Image as ImageIcon, FileText, MoreVertical, Edit2, Trash2, ArrowUp, Phone, RotateCw, Check, X, Lock, LockOpen, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import { sendWithOfflineQueue } from '@/src/lib/offline-queue';
import { addMessageToCache, removeMessageFromCache } from '@/src/lib/api-cache';
import useSWR from 'swr';

import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
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
import { useInitialMessages } from '@/src/hooks/useInitialMessages';
import { useDiscussionLockState } from '@/src/hooks/useDiscussionLockState';
import { useCallContext } from '@/src/contexts/CallContext';
import { useSetDiscussionBlur } from '@/src/contexts/DiscussionBlurContext';
import { ScreenshotBlocker } from '@/src/components/chat/ScreenshotBlocker';
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
    deletionRequest?: {
        id: string;
        requestedBy: string;
        requester: { id: string; name: string | null };
    } | null;
    isLocked?: boolean;
    currentUserIsPro?: boolean;
    lockSetByUserId?: string | null;
}

const fetcher = async (url: string) => {
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
};

const BLUR_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/* Bulle de message avec mémorisation du déchiffrement */
const DiscussionMessageBubble = memo(function DiscussionMessageBubble({
    message,
    isOwn,
    canEdit,
    currentUser,
    otherUser,
    privateKey,
    isEditing,
    editContent,
    onEditContentChange,
    onEditOpen,
    onEditSave,
    onEditCancel,
    onDelete,
    onRetry,
    isFailed,
    displayCreatedAt,
    isBlurred,
}: {
    message: Message;
    isOwn: boolean;
    canEdit: boolean;
    currentUser: { id: string; name: string | null; email: string; publicKey: string } | null;
    otherUser: { id: string; name: string | null; email: string; publicKey: string } | null;
    privateKey: string | null;
    isEditing: boolean;
    editContent: string;
    onEditContentChange: (v: string) => void;
    onEditOpen: (content: string) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    onDelete: () => void;
    onRetry?: () => void;
    isFailed: boolean;
    displayCreatedAt?: string;
    isBlurred?: boolean;
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
                {isEditing ? (
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
                                    'rounded-2xl px-4 py-2 border transition-all duration-200',
                                    isOwn
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-muted text-foreground border-border',
                                    isBlurred && 'blur-md select-none pointer-events-none opacity-70'
                                )}
                            >
                                <p className="break-words whitespace-pre-wrap">{decryptedContent}</p>
                                {message.isEdited && (
                                    <p className="text-xs opacity-70 mt-1">Modifie</p>
                                )}
                            </div>
                        )}

                        {message.attachments && message.attachments.length > 0 && (
                            <div className={cn(decryptedContent?.trim() ? 'mt-2' : '', 'space-y-2', isBlurred && 'blur-md select-none pointer-events-none opacity-70')}>
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
}, (prev, next) => {
    return (
        prev.message.id === next.message.id &&
        prev.message.content === next.message.content &&
        prev.message.isEdited === next.message.isEdited &&
        prev.isOwn === next.isOwn &&
        prev.canEdit === next.canEdit &&
        prev.isEditing === next.isEditing &&
        prev.editContent === next.editContent &&
        prev.isFailed === next.isFailed &&
        prev.isBlurred === next.isBlurred &&
        prev.privateKey === next.privateKey &&
        prev.currentUser?.id === next.currentUser?.id &&
        prev.otherUser?.publicKey === next.otherUser?.publicKey &&
        prev.displayCreatedAt === next.displayCreatedAt
    );
});

export default function DiscussionPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const conversationId = params?.id as string;

    const { data: conversationData, mutate: mutateConversation } = useSWR(
        conversationId ? `/api/conversations/${conversationId}` : null,
        fetcher,
        { refreshInterval: 15000, dedupingInterval: 5000 }
    );
    const conversation: Conversation | null = conversationData?.conversation || null;
    const lockState = useDiscussionLockState(conversation);

    const isDirectTwoPerson = !!(conversation?.isDirect && conversation?.members?.length === 2);
    const { data: userProStatus } = useSWR(
        isDirectTwoPerson ? '/api/user-pro/status' : null,
        fetcher,
        { dedupingInterval: 60000, revalidateOnFocus: false }
    );
    const preventScreenshot = userProStatus?.settings?.preventScreenshot ?? false;
    const blurOldMessages = userProStatus?.settings?.blurOldMessages ?? false;
    const shouldBlockScreenshot = preventScreenshot && lockState.canUseLock;

    const [blurEnabled, setBlurEnabled] = useState(true);
    const shouldApplyBlur = blurOldMessages && lockState.canUseLock && blurEnabled;

    const [deletionActionLoading, setDeletionActionLoading] = useState(false);
    const [showLockDialog, setShowLockDialog] = useState(false);
    const [showChangeCodeDialog, setShowChangeCodeDialog] = useState(false);
    const [showDisableLockDialog, setShowDisableLockDialog] = useState(false);
    const [lockCode, setLockCode] = useState('');
    const [currentCodeForChange, setCurrentCodeForChange] = useState('');
    const [newCodeForChange, setNewCodeForChange] = useState('');
    const [lockActionLoading, setLockActionLoading] = useState(false);
    const [isUnlockedSession, setIsUnlockedSession] = useState(false);

    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showLockCode, setShowLockCode] = useState(false);
    const [showCurrentCode, setShowCurrentCode] = useState(false);
    const [showNewCode, setShowNewCode] = useState(false);
    const [showUnlockOverlayCode, setShowUnlockOverlayCode] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);

    const { messages, setMessages, loading, hasMore, setHasMore } = useInitialMessages(conversationId);
    const blurredMessageIds = useMemo(
        () => (shouldApplyBlur ? new Set(messages.filter(m => Date.now() - new Date(m.createdAt).getTime() > BLUR_THRESHOLD_MS).map(m => m.id)) : new Set<string>()),
        [messages, shouldApplyBlur]
    );

    const uniqueMessages = useMemo(() => {
        const seen = new Set<string>();
        return messages.filter(m => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
        });
    }, [messages]);

    const [loadingMore, setLoadingMore] = useState(false);
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

    const setDiscussionBlur = useSetDiscussionBlur();

    // Exposer le toggle flou à la TopNav (icône œil dans la barre supérieure)
    useEffect(() => {
        const showBlurToggle = blurOldMessages && lockState.canUseLock;
        if (showBlurToggle) {
            setDiscussionBlur({
                showBlurToggle: true,
                blurEnabled,
                onToggle: () => setBlurEnabled(prev => !prev),
            });
        } else {
            setDiscussionBlur(null);
        }
        return () => {
            setDiscussionBlur(null);
        };
    }, [blurOldMessages, lockState.canUseLock, blurEnabled, setDiscussionBlur]);

    const messagesCacheUrl = conversationId ? `/api/conversations/${conversationId}/messages?limit=30` : null;

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
        if (messagesCacheUrl) addMessageToCache(messagesCacheUrl, data.message);
        scrollToBottom();
    }, [conversationId, scrollToBottom, messagesCacheUrl]);

    const handleMessageEdited = useCallback((data: { conversationId: string; message: Message }) => {
        if (data.conversationId !== conversationId) return;
        setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m));
        if (messagesCacheUrl) addMessageToCache(messagesCacheUrl, data.message);
    }, [conversationId, messagesCacheUrl]);

    const handleMessageDeleted = useCallback((data: { conversationId: string; messageId: string }) => {
        if (data.conversationId !== conversationId) return;
        setMessages(prev => prev.filter(m => m.id !== data.messageId));
        if (messagesCacheUrl) removeMessageFromCache(messagesCacheUrl, data.messageId);
    }, [conversationId, messagesCacheUrl]);

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

    const currentUser = useMemo(() => getUser(), []);
    const otherUser = useMemo(() => conversation?.members.find(m => m.user.id !== currentUser?.id)?.user, [conversation?.members, currentUser?.id]);
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

    // Vérifier sessionStorage pour déverrouillage de session (code déjà entré)
    useEffect(() => {
        if (!conversationId || !conversation?.isLocked) return;
        const key = `unlocked_${conversationId}`;
        const stored = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key);
        setIsUnlockedSession(!!stored);
    }, [conversationId, conversation?.isLocked]);

    // À chaque entrée dans la discussion, le code est demandé : on efface au départ
    useEffect(() => {
        if (!conversationId) return;
        return () => {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem(`unlocked_${conversationId}`);
            }
        };
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

            const url = `/api/conversations/${conversationId}/messages`;
            const bodyStr = JSON.stringify({ content: encryptedContent, attachments: [attachment] });
            const result = await sendWithOfflineQueue(url, { method: 'POST', body: bodyStr }, tempId, (u, opts) =>
                fetchWithAuth(u, opts as RequestInit)
            );

            if (result.queued) {
                toast.info('Message vocal en attente (hors ligne)');
                if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
            } else if (result.ok && result.response) {
                const data = await result.response.json();
                if (data.message) {
                    stableMessageKeysRef.current.set(data.message.id, tempId);
                    stableMessageTimestampsRef.current.set(data.message.id, optimisticMessage.createdAt);
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
                    addMessageToCache(`/api/conversations/${conversationId}/messages?limit=30`, data.message);
                }
                scrollToBottom();
            } else if (result.response) {
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

            const url = `/api/conversations/${conversationId}/messages`;
            const bodyStr = JSON.stringify({
                content: cipherText,
                attachments: attachments.length > 0 ? attachments : undefined,
            });
            const result = await sendWithOfflineQueue(url, { method: 'POST', body: bodyStr }, tempId, (u, opts) =>
                fetchWithAuth(u, opts as RequestInit)
            );

            if (result.queued) {
                toast.info('Message en attente (hors ligne)');
                if (payload) setFailedMessagePayloads(prev => new Map(prev).set(tempId, payload!));
            } else if (result.ok && result.response) {
                const data = await result.response.json();
                if (data.message) {
                    stableMessageKeysRef.current.set(data.message.id, tempId);
                    stableMessageTimestampsRef.current.set(data.message.id, optimisticMessage.createdAt);
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
                    addMessageToCache(`/api/conversations/${conversationId}/messages?limit=30`, data.message);
                }
            } else if (result.response) {
                const error = await result.response.json();
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
                const data = await response.json();
                if (data.message) addMessageToCache(`/api/conversations/${conversationId}/messages?limit=30`, data.message);
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
                removeMessageFromCache(`/api/conversations/${conversationId}/messages?limit=30`, messageId);
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
                addMessageToCache(`/api/conversations/${conversationId}/messages?limit=30`, data.message);
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

    const canEditOrDelete = useCallback((message: Message): boolean => {
        if (message.senderId !== currentUser?.id) return false;
        const messageTime = new Date(message.createdAt).getTime();
        return (Date.now() - messageTime) < 5 * 60 * 1000;
    }, [currentUser?.id]);

    const handleEditOpen = useCallback((messageId: string, content: string) => {
        setEditingMessageId(messageId);
        setEditContent(content);
    }, []);

    const handleEditCancel = useCallback(() => {
        setEditingMessageId(null);
        setEditContent('');
    }, []);

    const getConversationName = () => {
        if (!conversation) return 'Chargement...';
        if (conversation.isDirect && otherUser) {
            return otherUser.name || otherUser.email;
        }
        return conversation.name || 'Discussion';
    };

    const deletionRequest = conversation?.deletionRequest;
    const isDeletionRequester = deletionRequest && deletionRequest.requestedBy === currentUser?.id;

    const handleAcceptDeletion = async () => {
        if (!conversationId || deletionActionLoading) return;
        setDeletionActionLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/accept-deletion`, { method: 'POST' });
            if (res.ok) {
                toast.success('Discussion supprimée');
                router.push('/chat');
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Erreur');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setDeletionActionLoading(false);
        }
    };

    const handleRejectDeletion = async () => {
        if (!conversationId || deletionActionLoading) return;
        setDeletionActionLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/reject-deletion`, { method: 'POST' });
            if (res.ok) {
                toast.success('Demande de suppression refusée');
                mutateConversation();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Erreur');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setDeletionActionLoading(false);
        }
    };

    const handleLock = async () => {
        if (!conversationId || lockActionLoading || !/^\d{4}$/.test(lockCode)) return;
        setLockActionLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: lockCode }),
            });
            if (res.ok) {
                toast.success('Discussion verrouillée');
                setLockCode('');
                setShowLockDialog(false);
                mutateConversation();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Erreur');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setLockActionLoading(false);
        }
    };

    const handleUnlockWithCode = async () => {
        if (!conversationId || lockActionLoading || !/^\d{4}$/.test(lockCode)) return;
        setLockActionLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/verify-lock-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: lockCode }),
            });
            if (res.ok) {
                sessionStorage.setItem(`unlocked_${conversationId}`, '1');
                setIsUnlockedSession(true);
                setLockCode('');
                toast.success('Accès autorisé');
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Code incorrect');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setLockActionLoading(false);
        }
    };

    const handleDisableLock = async () => {
        if (!conversationId || lockActionLoading) return;
        setLockActionLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/disable-lock`, { method: 'POST' });
            if (res.ok) {
                sessionStorage.removeItem(`unlocked_${conversationId}`);
                setIsUnlockedSession(false);
                setLockCode('');
                setShowDisableLockDialog(false);
                toast.success('Verrouillage désactivé');
                mutateConversation();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Erreur');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setLockActionLoading(false);
        }
    };

    const handleChangeCode = async () => {
        if (!conversationId || lockActionLoading || !/^\d{4}$/.test(currentCodeForChange) || !/^\d{4}$/.test(newCodeForChange)) return;
        setLockActionLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/change-lock-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentCode: currentCodeForChange, newCode: newCodeForChange }),
            });
            if (res.ok) {
                toast.success('Code modifié. L\'autre utilisateur recevra le nouveau code par email.');
                setShowChangeCodeDialog(false);
                setCurrentCodeForChange('');
                setNewCodeForChange('');
                mutateConversation();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Erreur');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setLockActionLoading(false);
        }
    };

    // Écouter les clics depuis la TopNav (icône cadenas / appel) - après définition des variables
    useEffect(() => {
        const onLockClick = () => {
            if (!lockState.userIsPro) {
                toast.error('Compte Pro requis pour verrouiller la discussion');
                return;
            }
            if (lockState.isLocked) return; // Menu géré par TopNav
            setShowLockDialog(true);
        };
        const onLockDisable = () => setShowDisableLockDialog(true);
        const onLockChangeCode = () => {
            if (!isUnlockedSession && lockState.canManageLock) {
                toast.error('Déverrouillez d\'abord la discussion pour modifier le code');
                return;
            }
            if (isUnlockedSession && lockState.canManageLock) {
                setShowChangeCodeDialog(true);
            }
        };
        const onCallClick = () => {
            if (otherUser && conversationId) {
                callContext?.startCall(conversationId, otherUser.id, otherUser.name || otherUser.email || 'Utilisateur');
            }
        };
        window.addEventListener('discussion-lock-click', onLockClick);
        window.addEventListener('discussion-lock-disable', onLockDisable);
        window.addEventListener('discussion-lock-change-code', onLockChangeCode);
        window.addEventListener('discussion-call-click', onCallClick);
        return () => {
            window.removeEventListener('discussion-lock-click', onLockClick);
            window.removeEventListener('discussion-lock-disable', onLockDisable);
            window.removeEventListener('discussion-lock-change-code', onLockChangeCode);
            window.removeEventListener('discussion-call-click', onCallClick);
        };
    }, [conversationId, otherUser, lockState.userIsPro, lockState.isLocked, lockState.canManageLock, isUnlockedSession, callContext]);

    if (loading) {
        return (
            <div className="flex flex-col h-full bg-background pt-16 pb-32 px-4 min-h-0">
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
        <div className="flex flex-col h-full bg-background text-foreground min-h-0">
            <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Deverrouiller la discussion</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground mb-4">
                            Entrez votre mot de passe pour dechiffrer votre cle privee et acceder aux messages.
                        </p>
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Votre mot de passe"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                                className="pr-10"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUnlock}>Deverrouiller</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>



            {/* Dialog: Verrouiller (définir le code) */}
            <Dialog open={showLockDialog} onOpenChange={setShowLockDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Verrouiller la discussion</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground mb-4">
                            Définissez un code à 4 chiffres. L&apos;autre utilisateur Pro recevra ce code par email. À chaque ouverture, le code sera demandé.
                        </p>
                        <div className="relative">
                            <Input
                                type={showLockCode ? 'text' : 'password'}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                placeholder="••••"
                                value={lockCode}
                                onChange={(e) => setLockCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                onKeyDown={(e) => e.key === 'Enter' && handleLock()}
                                className="text-center text-lg tracking-[0.5em] pr-10"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowLockCode(!showLockCode)}
                                aria-label={showLockCode ? 'Masquer le code' : 'Afficher le code'}
                            >
                                {showLockCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowLockDialog(false); setLockCode(''); }}>Annuler</Button>
                        <Button onClick={handleLock} disabled={lockActionLoading || lockCode.length !== 4}>
                            {lockActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                            Verrouiller
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog: Changer le code */}
            <Dialog open={showChangeCodeDialog} onOpenChange={(open) => { setShowChangeCodeDialog(open); if (!open) { setCurrentCodeForChange(''); setNewCodeForChange(''); } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Changer le code</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            L&apos;autre utilisateur Pro recevra le nouveau code par email.
                        </p>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Code actuel</label>
                            <div className="relative">
                                <Input
                                    type={showCurrentCode ? 'text' : 'password'}
                                    inputMode="numeric"
                                    maxLength={4}
                                    placeholder="••••"
                                    value={currentCodeForChange}
                                    onChange={(e) => setCurrentCodeForChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    className="text-center text-lg tracking-[0.5em] pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowCurrentCode(!showCurrentCode)}
                                    aria-label={showCurrentCode ? 'Masquer' : 'Afficher'}
                                >
                                    {showCurrentCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Nouveau code</label>
                            <div className="relative">
                                <Input
                                    type={showNewCode ? 'text' : 'password'}
                                    inputMode="numeric"
                                    maxLength={4}
                                    placeholder="••••"
                                    value={newCodeForChange}
                                    onChange={(e) => setNewCodeForChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    onKeyDown={(e) => e.key === 'Enter' && handleChangeCode()}
                                    className="text-center text-lg tracking-[0.5em] pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowNewCode(!showNewCode)}
                                    aria-label={showNewCode ? 'Masquer' : 'Afficher'}
                                >
                                    {showNewCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowChangeCodeDialog(false); setCurrentCodeForChange(''); setNewCodeForChange(''); }}>Annuler</Button>
                        <Button onClick={handleChangeCode} disabled={lockActionLoading || currentCodeForChange.length !== 4 || newCodeForChange.length !== 4 || currentCodeForChange === newCodeForChange}>
                            {lockActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                            Changer le code
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog: Confirmation désactiver le verrouillage */}
            <Dialog open={showDisableLockDialog} onOpenChange={setShowDisableLockDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Désactiver le verrouillage</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">
                            Êtes-vous sûr de vouloir désactiver le code de verrouillage ? Cette discussion ne sera plus protégée.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDisableLockDialog(false)}>Annuler</Button>
                        <Button variant="destructive" onClick={handleDisableLock} disabled={lockActionLoading}>
                            {lockActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Désactiver
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Overlay: Déverrouiller (quand discussion verrouillée, code demandé à chaque session) - masqué si le dialog mot de passe est ouvert */}
            {lockState.isLocked && !isUnlockedSession && !showPasswordDialog && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/95 backdrop-blur-sm px-4">
                    <div className="w-full max-w-sm p-6 rounded-2xl border border-border bg-card shadow-lg">
                        <div className="flex justify-center mb-4">
                            <div className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                                <Lock className="w-7 h-7 text-amber-500" />
                            </div>
                        </div>
                        <h3 className="text-lg font-semibold text-center mb-2">Discussion verrouillée</h3>
                        <p className="text-sm text-muted-foreground text-center mb-4">
                            Entrez le code à 4 chiffres pour déverrouiller.
                        </p>
                        <div className="relative mb-4">
                            <Input
                                type={showUnlockOverlayCode ? 'text' : 'password'}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                placeholder="••••"
                                value={lockCode}
                                onChange={(e) => setLockCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                onKeyDown={(e) => e.key === 'Enter' && handleUnlockWithCode()}
                                className="text-center text-lg tracking-[0.5em] pr-10"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowUnlockOverlayCode(!showUnlockOverlayCode)}
                                aria-label={showUnlockOverlayCode ? 'Masquer le code' : 'Afficher le code'}
                            >
                                {showUnlockOverlayCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                        </div>
                        <Button
                            className="w-full"
                            onClick={handleUnlockWithCode}
                            disabled={lockActionLoading || lockCode.length !== 4}
                        >
                            {lockActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LockOpen className="w-4 h-4 mr-2" />}
                            Déverrouiller
                        </Button>
                    </div>
                </div>
            )}

            {/* Bannière demande de suppression (Pro/Pro) - fixe sous la top bar sur mobile */}
            {deletionRequest && (
                <div className={cn(
                    "p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
                    "fixed top-16 left-0 right-0 z-[55] mx-4 mt-2 md:relative md:top-auto md:left-auto md:right-auto",
                    isDeletionRequester
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
                        : "bg-destructive/10 border-destructive/30 text-destructive"
                )}>
                    <p className="text-sm">
                        {isDeletionRequester
                            ? "Vous avez demandé la suppression. En attente de l'acceptation de l'autre utilisateur."
                            : `${deletionRequest.requester.name || 'L\'autre utilisateur'} demande de supprimer cette discussion.`}
                    </p>
                    {!isDeletionRequester && (
                        <div className="flex gap-2 shrink-0">
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-destructive/50 text-destructive hover:bg-destructive/10"
                                onClick={handleRejectDeletion}
                                disabled={deletionActionLoading}
                            >
                                <X className="w-4 h-4 mr-1" />
                                Refuser
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleAcceptDeletion}
                                disabled={deletionActionLoading}
                            >
                                {deletionActionLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                ) : (
                                    <Check className="w-4 h-4 mr-1" />
                                )}
                                Accepter
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Messages */}
            <div
                className={cn(
                    "flex-1 overflow-y-auto px-4 pb-32 md:pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] min-h-0",
                    deletionRequest ? "pt-36 md:pt-16" : "pt-16"
                )}
                ref={scrollRef}
            >
                <ScreenshotBlocker enabled={shouldBlockScreenshot} className="min-h-full space-y-2">
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
                    {uniqueMessages.map((message) => (
                        <DiscussionMessageBubble
                            key={stableMessageKeysRef.current.get(message.id) ?? message.id}
                            message={message}
                            displayCreatedAt={stableMessageTimestampsRef.current.get(message.id)}
                            isOwn={message.senderId === currentUser?.id}
                            canEdit={canEditOrDelete(message)}
                            currentUser={currentUser ?? null}
                            otherUser={otherUser ?? null}
                            privateKey={privateKey}
                            isEditing={editingMessageId === message.id}
                            editContent={editContent}
                            onEditContentChange={setEditContent}
                            onEditOpen={(content) => handleEditOpen(message.id, content)}
                            onEditSave={() => handleEditMessage(message.id)}
                            onEditCancel={handleEditCancel}
                            onDelete={() => handleDeleteMessage(message.id)}
                            onRetry={failedMessagePayloads.has(message.id) ? () => handleRetryMessage(message.id) : undefined}
                            isFailed={failedMessagePayloads.has(message.id)}
                            isBlurred={blurredMessageIds.has(message.id)}
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
                </ScreenshotBlocker>
            </div>

            {/* Input */}
            <div className="fixed bottom-16 left-0 right-0 md:static md:bottom-auto md:w-full bg-background border-t border-border p-4 z-[60]">


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
