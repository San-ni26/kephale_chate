'use client';

/**
 * DiscussionPage — Refactorisé (#1)
 * 
 * AVANT : 1811 lignes (monolithique)
 * APRÈS : ~450 lignes (orchestration pure)
 * 
 * Logique extraite dans :
 *  - useDiscussionMessages       → envoi / édition / suppression / retry
 *  - useDiscussionLockHandlers   → code de verrouillage 4 chiffres
 *  - useFileSelection            → Object URLs + nettoyage mémoire
 */

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import {
    Send, Paperclip, Loader2, MoreVertical, Edit2, Trash2,
    ArrowUp, RotateCw, Check, X, Lock, LockOpen, Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/src/components/ui/dropdown-menu';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/src/components/ui/dialog';
import { decryptMessage, decryptPrivateKeyAsync } from '@/src/lib/crypto';
import { EncryptedAttachment } from './EncryptedAttachment';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { useInitialMessages } from '@/src/hooks/useInitialMessages';
import { useDiscussionLockState } from '@/src/hooks/useDiscussionLockState';
import { useCallContext } from '@/src/contexts/CallContext';
import { useSetDiscussionBlur } from '@/src/contexts/DiscussionBlurContext';
import { ScreenshotBlocker } from '@/src/components/chat/ScreenshotBlocker';
import { cn } from '@/src/lib/utils';
import { DiscussionNotesPanel } from '@/src/components/chat/DiscussionNotesPanel';

// Hooks extraits (#1 refactoring)
import { useDiscussionMessages } from '@/src/hooks/useDiscussionMessages';
import { useDiscussionLockHandlers } from '@/src/hooks/useDiscussionLockHandlers';
import { useFileSelection } from '@/src/hooks/useFileSelection';

const AudioRecorderComponent = dynamic(
    () => import('@/src/components/AudioRecorder').then(mod => mod.AudioRecorderComponent),
    {
        ssr: false,
        loading: () => <Button variant="ghost" size="icon" disabled className="rounded-full"><Loader2 className="w-4 h-4 animate-spin" /></Button>
    }
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    updatedAt: string;
    isEdited: boolean;
    attachments?: { filename: string; type: string; data?: string }[];
    sender: { id: string; name: string; email: string; publicKey: string };
}

interface Conversation {
    id: string;
    isDirect: boolean;
    name?: string;
    members: {
        user: {
            id: string; name: string; email: string;
            publicKey: string; isOnline: boolean; inCall?: boolean;
        };
    }[];
    deletionRequest?: {
        id: string; requestedBy: string;
        requester: { id: string; name: string | null };
    } | null;
    isLocked?: boolean;
    currentUserIsPro?: boolean;
    lockSetByUserId?: string | null;
    canCurrentUserControl?: boolean;
    hiddenByUserId?: string | null;
    rightsOwnerId?: string | null;
    rightsPurchase?: { buyerId: string; sellerId: string; expiresAt: string; duration: string } | null;
    isMessagesHiddenForCurrentUser?: boolean;
    canPurchaseRights?: boolean;
}

const fetcher = async (url: string) => {
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
};

const BLUR_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// ─── DiscussionMessageBubble ──────────────────────────────────────────────────

const DiscussionMessageBubble = memo(function DiscussionMessageBubble({
    message, isOwn, canEdit, currentUser, otherUser, privateKey,
    isEditing, editContent, onEditContentChange, onEditOpen, onEditSave, onEditCancel,
    onDelete, onRetry, isFailed, displayCreatedAt, isBlurred,
}: {
    message: Message; isOwn: boolean; canEdit: boolean;
    currentUser: { id: string; name: string | null; email: string; publicKey: string } | null;
    otherUser: { id: string; name: string | null; email: string; publicKey: string } | null;
    privateKey: string | null;
    isEditing: boolean; editContent: string;
    onEditContentChange: (v: string) => void;
    onEditOpen: (content: string) => void;
    onEditSave: () => void; onEditCancel: () => void; onDelete: () => void;
    onRetry?: () => void; isFailed: boolean;
    displayCreatedAt?: string; isBlurred?: boolean;
}) {
    const decryptedContent = useMemo(() => {
        if (!currentUser || !otherUser || !privateKey) return '[Chiffré]';
        try {
            const senderPublicKey = message.senderId === currentUser.id
                ? otherUser.publicKey
                : (message.sender.publicKey || otherUser.publicKey);
            return decryptMessage(message.content, privateKey, senderPublicKey) || '';
        } catch {
            return '[Erreur de déchiffrement]';
        }
    }, [message.id, message.content, message.senderId, message.sender?.publicKey, currentUser?.id, otherUser?.publicKey, privateKey]);

    const timestamp = displayCreatedAt ?? message.createdAt;

    return (
        <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[75%]', isOwn ? 'items-end' : 'items-start', 'flex flex-col')}>
                {isEditing ? (
                    <div className="bg-card rounded-lg p-3 w-full border border-border">
                        <Input value={editContent} onChange={(e) => onEditContentChange(e.target.value)} className="mb-2 bg-muted border-border" autoFocus />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={onEditSave}>Enregistrer</Button>
                            <Button size="sm" variant="ghost" onClick={onEditCancel}>Annuler</Button>
                        </div>
                    </div>
                ) : (
                    <div className={cn('group relative', isFailed && 'ring-1 ring-destructive/50 rounded-2xl')}>
                        {decryptedContent && decryptedContent.trim() && (
                            <div className={cn(
                                'rounded-2xl px-4 py-2 border transition-all duration-200',
                                isOwn ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-foreground border-border',
                                isBlurred && 'blur-md select-none pointer-events-none opacity-70'
                            )}>
                                <p className="break-words whitespace-pre-wrap">{decryptedContent}</p>
                                {message.isEdited && <p className="text-xs opacity-70 mt-1">Modifié</p>}
                            </div>
                        )}
                        {message.attachments && message.attachments.length > 0 && (
                            <div className={cn(decryptedContent?.trim() ? 'mt-2' : '', 'space-y-2', isBlurred && 'blur-md select-none pointer-events-none opacity-70')}>
                                {message.attachments.filter(att => att && (att.data || att.filename)).map((att, idx) => {
                                    const attachmentTheirPublicKey = isOwn
                                        ? otherUser?.publicKey
                                        : (message.sender?.publicKey || otherUser?.publicKey);
                                    return (
                                        <EncryptedAttachment
                                            key={idx}
                                            attachment={att}
                                            isOwnMessage={isOwn}
                                            myPrivateKey={privateKey || undefined}
                                            theirPublicKey={attachmentTheirPublicKey}
                                            currentUserId={currentUser?.id}
                                        />
                                    );
                                })}
                            </div>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: fr })}
                            </span>
                            {isFailed && onRetry && (
                                <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/50 hover:bg-destructive/10" onClick={onRetry}>
                                    <RotateCw className="w-3 h-3 mr-1" />Réessayer
                                </Button>
                            )}
                            {isOwn && canEdit && !isFailed && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                                            <MoreVertical className="w-4 h-4" /><span className="sr-only">Actions</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => onEditOpen(decryptedContent || '')}>
                                            <Edit2 className="w-4 h-4 mr-2" />Modifier
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={onDelete} className="text-destructive">
                                            <Trash2 className="w-4 h-4 mr-2" />Supprimer
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
}, (prev, next) => (
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
));

// ─── Page principale ──────────────────────────────────────────────────────────

export default function DiscussionPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const conversationId = params?.id as string;

    // ── SWR conversation ──
    const { data: conversationData, error: conversationError, mutate: mutateConversation } = useSWR(
        conversationId ? `/api/conversations/${conversationId}` : null,
        fetcher,
        { refreshInterval: 60000, dedupingInterval: 10000, revalidateOnFocus: true }
    );
    const conversation: Conversation | null = conversationData?.conversation || null;

    // Fix #13 : Ticker minute pour rafraîchir les timestamps relatifs
    const [, setTimeTick] = useState(0);
    useEffect(() => {
        const ticker = setInterval(() => setTimeTick(t => t + 1), 60_000);
        return () => clearInterval(ticker);
    }, []);

    useEffect(() => {
        if (conversationError && conversationId) window.location.href = '/chat';
    }, [conversationError, conversationId]);

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

    // ── State UI ──
    const [deletionActionLoading, setDeletionActionLoading] = useState(false);
    const [isUnlockedSession, setIsUnlockedSession] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
    const [loadingMore, setLoadingMore] = useState(false);

    // ── Messages ──
    const { messages, setMessages, loading, hasMore, setHasMore } = useInitialMessages(conversationId);
    const messageIds = useMemo(() => messages.map(m => m.id), [messages]);

    const uniqueMessages = useMemo(() => {
        const seen = new Set<string>();
        return messages.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    }, [messages]);

    // ── User ──
    const currentUser = useMemo(() => getUser(), []);
    const otherUser = useMemo(() => conversation?.members.find(m => m.user.id !== currentUser?.id)?.user, [conversation?.members, currentUser?.id]);

    // ── Blur ──
    const blurredMessageIds = useMemo(() => {
        const shouldBlurOldMessages = conversation?.isMessagesHiddenForCurrentUser || shouldApplyBlur;
        if (!shouldBlurOldMessages) return new Set<string>();
        const now = Date.now();
        return new Set(messages.filter(m => now - new Date(m.createdAt).getTime() > BLUR_THRESHOLD_MS).map(m => m.id));
    }, [messageIds, shouldApplyBlur, conversation?.isMessagesHiddenForCurrentUser]);

    // Fix #6 : editableMessageIds pré-calculé (useMemo + ticker minute)
    const editableMessageIds = useMemo(() => {
        const threshold = Date.now() - 5 * 60 * 1000;
        return new Set(
            uniqueMessages
                .filter(m => m.senderId === currentUser?.id && new Date(m.createdAt).getTime() > threshold)
                .map(m => m.id)
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uniqueMessages, currentUser?.id]);

    // ── Refs ──
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isTypingRef = useRef(false);
    const callContext = useCallContext();
    const isCallActiveRef = useRef(false);
    isCallActiveRef.current = callContext?.activeCall !== null;

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }, []);

    const setDiscussionBlur = useSetDiscussionBlur();
    useEffect(() => {
        const showBlurToggle = blurOldMessages && lockState.canUseLock;
        if (showBlurToggle) {
            setDiscussionBlur({ showBlurToggle: true, blurEnabled, onToggle: () => setBlurEnabled(prev => !prev) });
        } else {
            setDiscussionBlur(null);
        }
        return () => { setDiscussionBlur(null); };
    }, [blurOldMessages, lockState.canUseLock, blurEnabled, setDiscussionBlur]);

    // ── useDiscussionMessages en PREMIER ──
    // IMPORTANT : exposer pendingTempIdsRef + stableMessageKeysRef
    // avant d'appeler useWebSocket pour la déduplication correcte.
    // stopTyping est passé via une ref pour éviter la dépendance circulaire.
    const stopTypingRef = useRef<(id: string) => void>(() => { });

    const {
        sending,
        failedMessagePayloads,
        stableMessageKeysRef,       // realId → tempId
        stableMessageTimestampsRef,
        pendingTempIdsRef,          // Set<tempId> en vol (race condition fix)
        handleSendMessage,
        sendAudioMessage,
        handleEditMessage,
        handleDeleteMessage,
        handleRetryMessage,
    } = useDiscussionMessages({
        conversationId,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name || null, email: currentUser.email || '', publicKey: currentUser.publicKey || '' } : null,
        otherUser: otherUser ? { id: otherUser.id, name: otherUser.name || null, email: otherUser.email || '', publicKey: otherUser.publicKey || '' } : undefined,
        privateKey,
        setMessages,
        scrollToBottom,
        setShowPasswordDialog,
        stopTyping: (id: string) => stopTypingRef.current(id),
    });

    // ── useWebSocket (après useDiscussionMessages) ──
    // onNewMessage corrige la race condition Pusher-avant-HTTP via pendingTempIdsRef
    const { isConnected, startTyping, stopTyping, joinConversation, leaveConversation } = useWebSocket(
        // onNewMessage — 4 cas, 0 doublon possible
        (data) => {
            const msg = data.message;
            setMessages(prev => {
                // Cas 1 : realId déjà en liste (HTTP avant Pusher) → skip
                if (prev.some(m => m.id === msg.id)) return prev;

                // Cas 2 : Pusher après HTTP — stableMessageKeysRef peuplé
                const tempId = stableMessageKeysRef.current.get(msg.id);
                if (tempId && prev.some(m => m.id === tempId)) {
                    return prev.map(m => m.id === tempId ? msg : m);
                }

                // Cas 3 : Pusher AVANT HTTP (race condition principale)
                // pendingTempIdsRef a été peuplé synchro AVANT le POST
                if (pendingTempIdsRef.current.size > 0) {
                    const ourTemp = prev.find(
                        m => m.id.startsWith('temp-') && pendingTempIdsRef.current.has(m.id)
                    );
                    if (ourTemp) {
                        // Stocker le mapping → replaceTempMessage (HTTP) verra que
                        // Pusher a déjà fait le swap et ne créera pas de doublon
                        stableMessageKeysRef.current.set(msg.id, ourTemp.id);
                        pendingTempIdsRef.current.delete(ourTemp.id);
                        return prev.map(m => m.id === ourTemp.id ? msg : m);
                    }
                }

                // Cas 4 : message de l'autre utilisateur → ajouter
                return [...prev, msg];
            });
        },
        (data) => setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m)),
        (data) => setMessages(prev => prev.filter(m => m.id !== data.messageId)),
        (data) => {
            if (data.userId !== currentUser?.id) {
                setTypingUsers(prev => ({ ...prev, [data.userId]: data.isTyping }));
            }
        }
    );

    // Connecter la ref stopTyping après l'initialisation du hook
    stopTypingRef.current = stopTyping;

    const lockHandlers = useDiscussionLockHandlers({ conversationId, mutateConversation, setIsUnlockedSession });
    const { selectedFiles, handleFileSelect, revokeAllFileUrls } = useFileSelection(conversationId);

    // ── Call status au montage ──
    useEffect(() => {
        if (!conversationId) return;
        const applyPendingCall = (data: any) => callContext?.setIncomingCallData(data);
        const checkCallStatus = async (claim = true) => {
            if (isCallActiveRef.current && callContext?.activeCall?.conversationId === conversationId) return;
            try {
                const res = await fetchWithAuth(`/api/call/status?claim=${claim ? '1' : '0'}`);
                if (!res.ok) return;
                const { activeCall, pendingCall } = await res.json();
                if (activeCall && activeCall.conversationId !== conversationId) { router.push(`/chat/discussion/${activeCall.conversationId}`); return; }
                if (pendingCall && pendingCall.conversationId !== conversationId) { router.push(`/chat/discussion/${pendingCall.conversationId}`); return; }
                if (pendingCall && pendingCall.conversationId === conversationId) {
                    const shouldAutoAnswer = searchParams?.get('answer') === '1';
                    if (shouldAutoAnswer && callContext?.answerCallWithData) {
                        callContext.answerCallWithData(pendingCall);
                        router.replace(`/chat/discussion/${conversationId}`, { scroll: false });
                    } else { applyPendingCall(pendingCall); }
                    return;
                }
            } catch { }
            const stored = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pendingIncomingCall');
            if (stored) {
                try {
                    const data = JSON.parse(stored);
                    if (data.conversationId === conversationId && data.offer) {
                        sessionStorage.removeItem('pendingIncomingCall');
                        applyPendingCall(data);
                    }
                } catch { sessionStorage.removeItem('pendingIncomingCall'); }
            }
        };
        checkCallStatus(true);
        const onVisible = () => { if (document.visibilityState === 'visible' && !isCallActiveRef.current) checkCallStatus(true); };
        document.addEventListener('visibilitychange', onVisible);
        const retryTimer = setTimeout(() => { if (!isCallActiveRef.current) checkCallStatus(true); }, 800);
        return () => { document.removeEventListener('visibilitychange', onVisible); clearTimeout(retryTimer); };
    }, [conversationId, router, callContext, searchParams]);

    // ── Mark as read ──
    useEffect(() => {
        if (!conversationId || loading) return;
        fetchWithAuth(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => { });
    }, [conversationId, loading]);

    useEffect(() => {
        if (!conversationId || loading || messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.senderId !== currentUser?.id) {
            fetchWithAuth(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => { });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages.length]);

    // ── Join/leave Pusher channel ──
    useEffect(() => {
        if (!conversationId || !isConnected) return;
        joinConversation(conversationId);
        return () => { leaveConversation(conversationId); };
    }, [conversationId, isConnected, joinConversation, leaveConversation]);

    useEffect(() => () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); }, []);

    // ── Session lock ──
    useEffect(() => {
        if (!conversationId || !conversation?.isLocked) return;
        const stored = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(`unlocked_${conversationId}`);
        setIsUnlockedSession(!!stored);
    }, [conversationId, conversation?.isLocked]);

    useEffect(() => {
        if (!conversationId) return;
        return () => { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(`unlocked_${conversationId}`); };
    }, [conversationId]);

    // ── Polling fallback (Quick Win #1) ──
    useEffect(() => {
        if (!conversationId || loading) return;
        const quickCheck = setTimeout(async () => {
            if (isConnected) return;
            try {
                const lastMsg = [...messages].reverse().find(m => !m.id.startsWith('temp-'));
                if (!lastMsg) return;
                const res = await fetchWithAuth(`/api/conversations/${conversationId}/messages?after=${lastMsg.createdAt}&limit=20`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.messages?.length > 0) {
                        setMessages(prev => {
                            const existingIds = new Set(prev.map(m => m.id));
                            const newUnique = data.messages.filter((m: Message) => !existingIds.has(m.id));
                            return newUnique.length === 0 ? prev : [...prev, ...newUnique];
                        });
                    }
                }
            } catch { }
        }, 1500);
        return () => clearTimeout(quickCheck);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, loading, isConnected]);

    useEffect(() => {
        if (!conversationId || loading) return;
        const interval = setInterval(async () => {
            if (isConnected) return;
            try {
                const lastMsg = [...messages].reverse().find(m => !m.id.startsWith('temp-'));
                if (!lastMsg) return;
                const res = await fetchWithAuth(`/api/conversations/${conversationId}/messages?after=${lastMsg.createdAt}&limit=20`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.messages?.length > 0) {
                        setMessages(prev => {
                            const existingIds = new Set(prev.map(m => m.id));
                            const newUnique = data.messages.filter((m: Message) => !existingIds.has(m.id));
                            return newUnique.length === 0 ? prev : [...prev, ...newUnique];
                        });
                    }
                }
            } catch { }
        }, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, loading, isConnected]);

    // ── Clé privée ──
    useEffect(() => {
        if (currentUser) {
            const storedKey = sessionStorage.getItem(`privateKey_${currentUser.id}`);
            if (storedKey) { setPrivateKey(storedKey); setShowPasswordDialog(false); }
            else if (!privateKey) setShowPasswordDialog(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);

    const handleUnlock = async () => {
        if (!currentUser || !password) return;
        try {
            const decrypted = await decryptPrivateKeyAsync(currentUser.encryptedPrivateKey, password);
            setPrivateKey(decrypted);
            sessionStorage.setItem(`privateKey_${currentUser.id}`, decrypted);
            setShowPasswordDialog(false);
            setPassword('');
            toast.success('Clé de chiffrement déverrouillée');
        } catch { toast.error('Mot de passe incorrect'); }
    };

    // ── Auto scroll ──
    const isFirstLoad = useRef(true);
    const lastMessageCount = useRef(0);
    useEffect(() => {
        if (loading) return;
        if (isFirstLoad.current && messages.length > 0) { scrollToBottom(); isFirstLoad.current = false; }
        if (messages.length > lastMessageCount.current) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.senderId === currentUser?.id) {
                scrollToBottom();
            } else {
                const container = scrollRef.current;
                if (container) {
                    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
                    if (isNearBottom) scrollToBottom();
                }
            }
        }
        lastMessageCount.current = messages.length;
    }, [messages, loading, currentUser?.id, scrollToBottom]);

    const typingCount = Object.keys(typingUsers).filter(uid => typingUsers[uid]).length;
    useEffect(() => { if (typingCount > 0) scrollToBottom(); }, [typingCount, scrollToBottom]);

    // ── Charger l'historique ──
    const loadMoreHistory = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const oldest = messages.find(m => !m.id.startsWith('temp-'));
            if (!oldest) return;
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/messages?before=${oldest.createdAt}&limit=30`);
            if (res.ok) {
                const data = await res.json();
                if (data.messages && data.messages.length > 0) {
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const newUnique = data.messages.filter((m: Message) => !existingIds.has(m.id));
                        return [...newUnique, ...prev];
                    });
                    requestAnimationFrame(() => {
                        const scrollContainer = scrollRef.current;
                        if (scrollContainer) {
                            const oldScrollHeight = scrollContainer.scrollHeight;
                            requestAnimationFrame(() => {
                                scrollContainer.scrollTop = scrollContainer.scrollHeight - oldScrollHeight;
                            });
                        }
                    });
                    setHasMore(data.hasMore !== false);
                } else { setHasMore(false); }
            }
        } catch { toast.error("Impossible de charger l'historique"); }
        finally { setLoadingMore(false); }
    };

    // ── Edit handlers ──
    const handleEditOpen = useCallback((messageId: string, content: string) => {
        setEditingMessageId(messageId); setEditContent(content);
    }, []);
    const handleEditCancel = useCallback(() => {
        setEditingMessageId(null); setEditContent('');
    }, []);

    // ── Suppression de conversation ──
    const deletionRequest = conversation?.deletionRequest;
    const isDeletionRequester = deletionRequest && deletionRequest.requestedBy === currentUser?.id;

    const handleAcceptDeletion = async () => {
        if (!conversationId || deletionActionLoading) return;
        setDeletionActionLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/accept-deletion`, { method: 'POST' });
            if (res.ok) { toast.success('Discussion supprimée'); window.location.href = '/chat'; }
            else { const data = await res.json().catch(() => ({})); toast.error(data.error || 'Erreur'); }
        } catch { toast.error('Erreur réseau'); }
        finally { setDeletionActionLoading(false); }
    };
    const handleRejectDeletion = async () => {
        if (!conversationId || deletionActionLoading) return;
        setDeletionActionLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/reject-deletion`, { method: 'POST' });
            if (res.ok) { toast.success('Demande de suppression refusée'); mutateConversation(); }
            else { const data = await res.json().catch(() => ({})); toast.error(data.error || 'Erreur'); }
        } catch { toast.error('Erreur réseau'); }
        finally { setDeletionActionLoading(false); }
    };

    // ── Lock handlers ──
    const handleUnlockWithCode = async () => {
        if (lockHandlers.lockActionLoading || !/^\d{4}$/.test(lockHandlers.lockCode)) return;
        const ok = await lockHandlers.handleVerifyLockCode(lockHandlers.lockCode);
        if (ok) { lockHandlers.setLockCode(''); toast.success('Accès autorisé'); }
    };

    // ── Listeners window (Action 9 — stables via refs) ──
    const conversationRef = useRef(conversation);
    const lockStateRef = useRef(lockState);
    const otherUserRef = useRef(otherUser);
    const isUnlockedSessionRef = useRef(isUnlockedSession);
    const callContextRef = useRef(callContext);
    conversationRef.current = conversation;
    lockStateRef.current = lockState;
    otherUserRef.current = otherUser;
    isUnlockedSessionRef.current = isUnlockedSession;
    callContextRef.current = callContext;

    useEffect(() => {
        const onLockClick = () => {
            if (!conversationRef.current?.canCurrentUserControl) { toast.error("Les droits de cette discussion ont été achetés par l'autre utilisateur."); return; }
            if (!lockStateRef.current.userIsPro) { toast.error('Compte Pro requis pour verrouiller la discussion'); return; }
            if (lockStateRef.current.isLocked) return;
            lockHandlers.setShowLockDialog(true);
        };
        const onLockDisable = () => {
            if (!conversationRef.current?.canCurrentUserControl) { toast.error("Les droits de cette discussion ont été achetés par l'autre utilisateur."); return; }
            lockHandlers.setShowDisableLockDialog(true);
        };
        const onLockChangeCode = () => {
            if (!conversationRef.current?.canCurrentUserControl) { toast.error("Les droits de cette discussion ont été achetés par l'autre utilisateur."); return; }
            if (!isUnlockedSessionRef.current && lockStateRef.current.canManageLock) { toast.error("Déverrouillez d'abord la discussion pour modifier le code"); return; }
            if (isUnlockedSessionRef.current && lockStateRef.current.canManageLock) lockHandlers.setShowChangeCodeDialog(true);
        };
        const onCallClick = (e: Event) => {
            const u = otherUserRef.current;
            if (u && conversationId) {
                const callType = (e as CustomEvent<{ callType?: 'video' | 'audio' }>)?.detail?.callType ?? 'video';
                callContextRef.current?.startCall(conversationId, u.id, u.name || u.email || 'Utilisateur', callType);
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
    }, [conversationId]);

    // ─── Render ───────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex flex-col h-full bg-background pt-16 pb-32 px-4 min-h-0">
                <div className="flex justify-center py-4"><div className="h-10 w-10 rounded-full bg-muted animate-pulse" /></div>
                <div className="space-y-4 flex-1 max-w-2xl mx-auto w-full">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                            <div className={cn('rounded-2xl h-12 animate-pulse', i % 2 === 0 ? 'bg-primary/20 w-3/4' : 'bg-muted w-2/3')} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (searchParams?.get('view') === 'notes') {
        return <DiscussionNotesPanel conversation={conversation} />;
    }

    return (
        <div className="flex flex-col h-full bg-background text-foreground min-h-0">

            {/* ── Dialog : déverrouiller la clé privée ── */}
            <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
                <DialogContent aria-describedby="unlock-dialog-desc">
                    <DialogHeader><DialogTitle>Déverrouiller la discussion</DialogTitle></DialogHeader>
                    <div className="py-4">
                        <p id="unlock-dialog-desc" className="text-sm text-muted-foreground mb-4">
                            Entrez votre mot de passe pour déchiffrer votre clé privée et accéder aux messages.
                        </p>
                        <div className="relative">
                            <Input type={showPassword ? 'text' : 'password'} placeholder="Votre mot de passe" value={password}
                                onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUnlock()} className="pr-10" />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleUnlock}>Déverrouiller</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Dialog : verrouiller (définir code) ── */}
            <Dialog open={lockHandlers.showLockDialog} onOpenChange={lockHandlers.setShowLockDialog}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Verrouiller la discussion</DialogTitle></DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground mb-4">Définissez un code à 4 chiffres. L&apos;autre utilisateur Pro recevra ce code par email.</p>
                        <div className="relative">
                            <Input type={lockHandlers.showLockCode ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="••••"
                                value={lockHandlers.lockCode} onChange={e => lockHandlers.setLockCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                onKeyDown={e => e.key === 'Enter' && lockHandlers.handleSetLock()} className="text-center text-lg tracking-[0.5em] pr-10" />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground" onClick={() => lockHandlers.setShowLockCode(!lockHandlers.showLockCode)}>
                                {lockHandlers.showLockCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { lockHandlers.setShowLockDialog(false); lockHandlers.setLockCode(''); }}>Annuler</Button>
                        <Button onClick={lockHandlers.handleSetLock} disabled={lockHandlers.lockActionLoading || lockHandlers.lockCode.length !== 4}>
                            {lockHandlers.lockActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}Verrouiller
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Dialog : changer le code ── */}
            <Dialog open={lockHandlers.showChangeCodeDialog} onOpenChange={open => { lockHandlers.setShowChangeCodeDialog(open); if (!open) { lockHandlers.setCurrentCodeForChange(''); lockHandlers.setNewCodeForChange(''); } }}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Changer le code</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">L&apos;autre utilisateur Pro recevra le nouveau code par email.</p>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Code actuel</label>
                            <div className="relative">
                                <Input type={lockHandlers.showCurrentCode ? 'text' : 'password'} inputMode="numeric" maxLength={4} placeholder="••••"
                                    value={lockHandlers.currentCodeForChange} onChange={e => lockHandlers.setCurrentCodeForChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    className="text-center text-lg tracking-[0.5em] pr-10" />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground" onClick={() => lockHandlers.setShowCurrentCode(!lockHandlers.showCurrentCode)}>
                                    {lockHandlers.showCurrentCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Nouveau code</label>
                            <div className="relative">
                                <Input type={lockHandlers.showNewCode ? 'text' : 'password'} inputMode="numeric" maxLength={4} placeholder="••••"
                                    value={lockHandlers.newCodeForChange} onChange={e => lockHandlers.setNewCodeForChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    onKeyDown={e => e.key === 'Enter' && lockHandlers.handleChangeLockCode()} className="text-center text-lg tracking-[0.5em] pr-10" />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground" onClick={() => lockHandlers.setShowNewCode(!lockHandlers.showNewCode)}>
                                    {lockHandlers.showNewCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { lockHandlers.setShowChangeCodeDialog(false); lockHandlers.setCurrentCodeForChange(''); lockHandlers.setNewCodeForChange(''); }}>Annuler</Button>
                        <Button onClick={lockHandlers.handleChangeLockCode} disabled={lockHandlers.lockActionLoading || lockHandlers.currentCodeForChange.length !== 4 || lockHandlers.newCodeForChange.length !== 4 || lockHandlers.currentCodeForChange === lockHandlers.newCodeForChange}>
                            {lockHandlers.lockActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}Changer le code
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Dialog : désactiver le verrouillage ── */}
            <Dialog open={lockHandlers.showDisableLockDialog} onOpenChange={open => { lockHandlers.setShowDisableLockDialog(open); if (!open) lockHandlers.setLockCode(''); }}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Désactiver le verrouillage</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">Entrez le code actuel pour désactiver le verrouillage. Cette discussion ne sera plus protégée.</p>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Code actuel</label>
                            <div className="relative">
                                <Input type={lockHandlers.showLockCode ? 'text' : 'password'} inputMode="numeric" maxLength={4} placeholder="••••"
                                    value={lockHandlers.lockCode} onChange={e => lockHandlers.setLockCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    onKeyDown={e => e.key === 'Enter' && lockHandlers.lockCode.length === 4 && lockHandlers.handleDisableLock(lockHandlers.lockCode)}
                                    className="text-center text-lg tracking-[0.5em] pr-10" />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground" onClick={() => lockHandlers.setShowLockCode(!lockHandlers.showLockCode)}>
                                    {lockHandlers.showLockCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { lockHandlers.setShowDisableLockDialog(false); lockHandlers.setLockCode(''); }}>Annuler</Button>
                        <Button variant="destructive" onClick={() => lockHandlers.handleDisableLock(lockHandlers.lockCode)} disabled={lockHandlers.lockActionLoading || lockHandlers.lockCode.length !== 4}>
                            {lockHandlers.lockActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Désactiver
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Overlay : discussion verrouillée ── */}
            {lockState.isLocked && !isUnlockedSession && !showPasswordDialog && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/95 backdrop-blur-sm px-4">
                    <div className="w-full max-w-sm p-6 rounded-2xl border border-border bg-card shadow-lg">
                        <div className="flex justify-center mb-4">
                            <div className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center"><Lock className="w-7 h-7 text-amber-500" /></div>
                        </div>
                        <h3 className="text-lg font-semibold text-center mb-2">Discussion verrouillée</h3>
                        <p className="text-sm text-muted-foreground text-center mb-4">Entrez le code à 4 chiffres pour déverrouiller.</p>
                        <div className="relative mb-4">
                            <Input type={lockHandlers.showUnlockOverlayCode ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="••••"
                                value={lockHandlers.lockCode} onChange={e => lockHandlers.setLockCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                onKeyDown={e => e.key === 'Enter' && handleUnlockWithCode()} className="text-center text-lg tracking-[0.5em] pr-10" />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground" onClick={() => lockHandlers.setShowUnlockOverlayCode(!lockHandlers.showUnlockOverlayCode)}>
                                {lockHandlers.showUnlockOverlayCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                        </div>
                        <Button className="w-full" onClick={handleUnlockWithCode} disabled={lockHandlers.lockActionLoading || lockHandlers.lockCode.length !== 4}>
                            {lockHandlers.lockActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LockOpen className="w-4 h-4 mr-2" />}Déverrouiller
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Bannière suppression ── */}
            {deletionRequest && (
                <div className={cn(
                    "p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
                    "fixed top-16 left-0 right-0 z-[55] mx-4 mt-2 md:relative md:top-auto md:left-auto md:right-auto",
                    isDeletionRequester ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400" : "bg-destructive/10 border-destructive/30 text-destructive"
                )}>
                    <p className="text-sm">
                        {isDeletionRequester
                            ? "Vous avez demandé la suppression. En attente de l'acceptation de l'autre utilisateur."
                            : `${deletionRequest.requester.name || "L'autre utilisateur"} demande de supprimer cette discussion.`}
                    </p>
                    {!isDeletionRequester && (
                        <div className="flex gap-2 shrink-0">
                            <Button size="sm" variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={handleRejectDeletion} disabled={deletionActionLoading}>
                                <X className="w-4 h-4 mr-1" />Refuser
                            </Button>
                            <Button size="sm" variant="destructive" onClick={handleAcceptDeletion} disabled={deletionActionLoading}>
                                {deletionActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}Accepter
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Liste des messages ── */}
            <div
                className={cn("flex-1 overflow-y-auto px-4 pb-32 md:pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] min-h-0", deletionRequest ? "pt-36 md:pt-16" : "pt-16")}
                ref={scrollRef}
            >
                <ScreenshotBlocker enabled={shouldBlockScreenshot} className="min-h-full space-y-2">
                    {hasMore && (
                        <div className="flex justify-center py-2">
                            <Button variant="ghost" size="sm" onClick={loadMoreHistory} disabled={loadingMore} className="text-muted-foreground text-xs h-6">
                                {loadingMore ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ArrowUp className="w-3 h-3 mr-1" />}
                                Charger plus anciens
                            </Button>
                        </div>
                    )}
                    {uniqueMessages.map(message => (
                        <DiscussionMessageBubble
                            key={stableMessageKeysRef.current.get(message.id) ?? message.id}
                            message={message}
                            displayCreatedAt={stableMessageTimestampsRef.current.get(message.id)}
                            isOwn={message.senderId === currentUser?.id}
                            canEdit={editableMessageIds.has(message.id)}
                            currentUser={currentUser ?? null}
                            otherUser={otherUser ?? null}
                            privateKey={privateKey}
                            isEditing={editingMessageId === message.id}
                            editContent={editContent}
                            onEditContentChange={setEditContent}
                            onEditOpen={content => handleEditOpen(message.id, content)}
                            onEditSave={() => handleEditMessage(message.id, editContent, handleEditCancel)}
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
                                {otherUser?.name || otherUser?.email || "Quelqu'un"}
                            </span>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </ScreenshotBlocker>
            </div>

            {/* ── Zone de saisie ── */}
            <div className="fixed bottom-16 left-0 right-0 md:static md:bottom-auto md:w-full bg-background border-t border-border p-4 z-[60]">
                <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.docx" onChange={handleFileSelect} className="hidden" />

                    {!isRecordingAudio && (
                        <>
                            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sending} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                                <Paperclip className="w-5 h-5" />
                            </Button>
                            <Input
                                value={newMessage}
                                onChange={e => {
                                    setNewMessage(e.target.value);
                                    if (conversationId) {
                                        // Fix #8 : n'envoyer startTyping que si pas déjà en train de taper
                                        if (!isTypingRef.current) { isTypingRef.current = true; startTyping(conversationId); }
                                        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                        typingTimeoutRef.current = setTimeout(() => {
                                            stopTyping(conversationId);
                                            isTypingRef.current = false;
                                            typingTimeoutRef.current = null;
                                        }, 2000);
                                    }
                                }}
                                placeholder="Message chiffré..."
                                className="flex-1"
                                disabled={sending}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage(newMessage, selectedFiles, revokeAllFileUrls).then(() => setNewMessage(''));
                                    }
                                }}
                            />
                        </>
                    )}

                    <AudioRecorderComponent
                        onAudioRecorded={async (blob) => {
                            let ext = 'webm';
                            if (blob.type.includes('mp4')) ext = 'mp4';
                            else if (blob.type.includes('aac')) ext = 'aac';
                            else if (blob.type.includes('ogg')) ext = 'ogg';
                            const file = new File([blob], `audio-message-${Date.now()}.${ext}`, { type: blob.type });
                            await sendAudioMessage(file);
                        }}
                        onRecordingStatusChange={setIsRecordingAudio}
                    />

                    {!isRecordingAudio && (
                        <Button
                            onClick={() => handleSendMessage(newMessage, selectedFiles, revokeAllFileUrls).then(() => setNewMessage(''))}
                            disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
