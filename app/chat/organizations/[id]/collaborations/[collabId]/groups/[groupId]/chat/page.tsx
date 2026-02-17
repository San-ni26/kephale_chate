'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { createCacheAwareFetcher, addMessageToCache, removeMessageFromCache } from '@/src/lib/api-cache';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import {
    ArrowLeft,
    Send,
    Paperclip,
    Loader2,
    Image as ImageIcon,
    FileText,
    MoreVertical,
    Edit2,
    Trash2,
    Settings,
    RotateCw,
    Circle,
    Wifi,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import { sendWithOfflineQueue } from '@/src/lib/offline-queue';
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
import { EncryptedAttachment } from '@/app/chat/discussion/[id]/EncryptedAttachment';
import { AudioRecorderComponent } from '@/src/components/AudioRecorder';
import { CollaborationDocumentsPanel } from '@/src/components/chat/CollaborationDocumentsPanel';
import { encryptMessage, decryptMessage, decryptPrivateKey } from '@/src/lib/crypto';
import { useWebSocket } from '@/src/hooks/useWebSocket';
import { cn } from '@/src/lib/utils';

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

interface Group {
    id: string;
    name: string;
    publicKey: string;
    members?: { id: string }[];
    _count?: { members: number };
}

function ChatMessageBubble({
    message,
    isOwn,
    canEdit,
    groupPrivateKey,
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
    groupPrivateKey: string | null;
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
        if (!groupPrivateKey || !message.sender?.publicKey) return '[Chiffré]';
        try {
            return decryptMessage(message.content, groupPrivateKey, message.sender.publicKey) || '';
        } catch {
            return '[Erreur de déchiffrement]';
        }
    }, [message.id, message.content, message.sender?.publicKey, groupPrivateKey]);

    const timestamp = displayCreatedAt ?? message.createdAt;

    return (
        <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] md:max-w-[75%]', isOwn ? 'items-end' : 'items-start', 'flex flex-col')}>
                {!isOwn && (
                    <span className="text-xs text-muted-foreground mb-1 px-2">
                        {message.sender.name || message.sender.email}
                    </span>
                )}

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
                                    <p className="text-xs opacity-70 mt-1">Modifié</p>
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

export default function CollaborationGroupChatPage() {
    const params = useParams();
    const router = useRouter();
    const orgId = params?.id as string;
    const collabId = params?.collabId as string;
    const groupId = params?.groupId as string;

    const [group, setGroup] = useState<Group | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [groupPrivateKey, setGroupPrivateKey] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [documentsPanelOpen, setDocumentsPanelOpen] = useState(false);
    const [documentsPanelTab, setDocumentsPanelTab] = useState<'documents' | 'notes'>('documents');
    const [documentsPanelCreateNote, setDocumentsPanelCreateNote] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
    const [failedMessagePayloads, setFailedMessagePayloads] = useState<Map<string, { encryptedContent: string; attachments?: { filename: string; type: string; data: string }[] }>>(new Map());
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stableMessageKeysRef = useRef<Map<string, string>>(new Map());
    const stableMessageTimestampsRef = useRef<Map<string, string>>(new Map());

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContentRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const currentUser = getUser();

    const baseFetcher = useCallback(async (url: string) => {
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error('Failed to fetch messages');
        const text = await res.text();
        try {
            return text ? JSON.parse(text) : { messages: [], hasMore: false, conversationId: null };
        } catch {
            return { messages: [], hasMore: false, conversationId: null };
        }
    }, []);
    const messagesFetcher = useMemo(() => createCacheAwareFetcher(baseFetcher), [baseFetcher]);

    const dedupeMessagesById = (list: Message[]) => {
        const seen = new Set<string>();
        return list.filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
        });
    };

    const messagesUrl = orgId && collabId && groupId
        ? `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}/messages?limit=30`
        : null;
    const messagesCacheUrl = messagesUrl;

    const { data: messagesData, mutate: mutateMessages, isLoading: messagesLoading } = useSWR(
        messagesUrl,
        messagesFetcher,
        { refreshInterval: 60000, revalidateOnFocus: true }
    );

    const handleNewMessage = useCallback((data: { conversationId: string; message: Message }) => {
        const me = getUser();
        setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            const ourTemp = prev.find((m) => m.id.startsWith('temp-') && m.senderId === me?.id);
            if (ourTemp && data.message.senderId === me?.id) {
                stableMessageKeysRef.current.set(data.message.id, ourTemp.id);
                stableMessageTimestampsRef.current.set(data.message.id, ourTemp.createdAt);
                return prev.map((m) => (m.id === ourTemp.id ? data.message : m));
            }
            return dedupeMessagesById([...prev, data.message]);
        });
        if (messagesCacheUrl) addMessageToCache(messagesCacheUrl, data.message);
    }, [messagesCacheUrl]);

    const handleMessageEdited = useCallback((data: { conversationId: string; message: Message }) => {
        setMessages((prev) => prev.map((m) => (m.id === data.message.id ? data.message : m)));
        if (messagesCacheUrl) addMessageToCache(messagesCacheUrl, data.message);
    }, [messagesCacheUrl]);

    const handleMessageDeleted = useCallback((data: { conversationId: string; messageId: string }) => {
        setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
        if (messagesCacheUrl) removeMessageFromCache(messagesCacheUrl, data.messageId);
    }, [messagesCacheUrl]);

    const handleUserTyping = useCallback((data: { conversationId: string; userId: string; isTyping: boolean }) => {
        if (data.userId === currentUser?.id) return;
        setTypingUsers((prev) => ({ ...prev, [data.userId]: data.isTyping }));
    }, [currentUser?.id]);

    const { joinConversation, leaveConversation, isConnected, startTyping, stopTyping } = useWebSocket(
        handleNewMessage,
        handleMessageEdited,
        handleMessageDeleted,
        handleUserTyping
    );

    useEffect(() => {
        if (messagesData?.messages != null) {
            setMessages(dedupeMessagesById(messagesData.messages));
            if (messagesData.conversationId) setConversationId(messagesData.conversationId);
            setHasMore(messagesData.hasMore !== false);
        }
    }, [messagesData]);

    useEffect(() => {
        if (!conversationId || !isConnected) return;
        joinConversation(conversationId);
        return () => leaveConversation(conversationId);
    }, [conversationId, isConnected, joinConversation, leaveConversation]);

    useEffect(() => {
        if (!conversationId || messagesLoading) return;
        fetchWithAuth(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
    }, [conversationId, messagesLoading]);

    const typingCount = Object.keys(typingUsers).filter((uid) => typingUsers[uid]).length;

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const container = scrollRef.current;
                if (container) {
                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                } else {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }, []);

    const lastMessageCountRef = useRef(0);
    const isFirstLoadRef = useRef(true);

    useEffect(() => {
        if (messagesLoading) return;
        if (messages.length === 0) return;

        const prevCount = lastMessageCountRef.current;
        lastMessageCountRef.current = messages.length;

        const doScroll = () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const container = scrollRef.current;
                    if (container) {
                        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                    } else {
                        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }
                });
            });
        };

        if (messages.length > prevCount) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.senderId !== currentUser?.id) {
                doScroll();
            }
        }
    }, [messages.length, messagesLoading, currentUser?.id]);

    useLayoutEffect(() => {
        if (messagesLoading || messages.length === 0) return;
        if (!isFirstLoadRef.current) return;

        isFirstLoadRef.current = false;
        const scrollToEnd = () => {
            const container = scrollRef.current;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
            messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
        };

        scrollToEnd();
        const t1 = setTimeout(scrollToEnd, 50);
        const t2 = setTimeout(scrollToEnd, 150);
        const t3 = setTimeout(scrollToEnd, 400);
        const t4 = setTimeout(scrollToEnd, 800);

        const contentEl = messagesContentRef.current ?? scrollRef.current;
        if (!contentEl) return;
        let rafId = 0;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => scrollToEnd());
        });
        observer.observe(contentEl);
        const t5 = setTimeout(() => observer.disconnect(), 2000);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            clearTimeout(t4);
            clearTimeout(t5);
            cancelAnimationFrame(rafId);
            observer.disconnect();
        };
    }, [messages.length, messagesLoading]);

    useEffect(() => {
        if (typingCount > 0) {
            requestAnimationFrame(() => {
                const container = scrollRef.current;
                if (container) {
                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                } else {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
    }, [typingCount]);

    useEffect(() => {
        if (groupId && orgId && collabId) loadGroup();
    }, [groupId, orgId, collabId]);

    useEffect(() => {
        const openDocs = () => setDocumentsPanelOpen(true);
        window.addEventListener('collaboration-chat-open-documents', openDocs);
        return () => window.removeEventListener('collaboration-chat-open-documents', openDocs);
    }, []);

    useEffect(() => () => {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }, []);

    const loadGroup = async () => {
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}`
            );
            const text = await res.text();
            let data: { group?: Group; currentMemberEncryptedDeptKey?: string } = {};
            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                return;
            }
            if (res.ok && data.group) {
                setGroup(data.group);
                if (data.currentMemberEncryptedDeptKey) {
                    setGroupPrivateKey(data.currentMemberEncryptedDeptKey);
                }
            }
        } catch (e) {
            console.error('Load group error:', e);
        }
    };

    useEffect(() => {
        if (!currentUser) return;
        const storedKey = sessionStorage.getItem(`privateKey_${currentUser.id}`);
        if (storedKey) {
            setPrivateKey(storedKey);
            setShowPasswordDialog(false);
        } else {
            setShowPasswordDialog(true);
        }
    }, [currentUser?.id]);

    const handleUnlock = () => {
        if (!currentUser || !password) return;
        try {
            const decrypted = decryptPrivateKey(currentUser.encryptedPrivateKey, password);
            setPrivateKey(decrypted);
            sessionStorage.setItem(`privateKey_${currentUser.id}`, decrypted);
            setShowPasswordDialog(false);
            setPassword('');
            toast.success('Clé de chiffrement déverrouillée');
        } catch {
            toast.error('Mot de passe incorrect');
        }
    };

    const refreshMessages = useCallback(() => {
        mutateMessages().then(() => scrollToBottom()).catch(() => {});
    }, [mutateMessages, scrollToBottom]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const validFiles = files.filter((file) => {
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
        setSelectedFiles((prev) => [...prev, ...validFiles]);
    };

    const removeFile = (index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const fileToBase64 = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleAudioRecorded = async (blob: Blob) => {
        let ext = 'webm';
        if (blob.type.includes('mp4')) ext = 'mp4';
        else if (blob.type.includes('aac')) ext = 'aac';
        else if (blob.type.includes('ogg')) ext = 'ogg';

        const file = new File([blob], `audio-message-${Date.now()}.${ext}`, { type: blob.type });
        await sendAudioMessage(file);
    };

    const sendAudioMessage = async (audioFile: File) => {
        if (!currentUser || !group?.publicKey) {
            toast.error('Utilisateur ou groupe non chargé');
            return;
        }
        if (!privateKey) {
            setShowPasswordDialog(true);
            return;
        }

        setSending(true);
        const encryptedContent = encryptMessage('', privateKey, group.publicKey);
        const tempId = `temp-${Date.now()}`;
        const base64Data = await fileToBase64(audioFile);
        const attachment = { filename: audioFile.name, type: 'AUDIO', data: base64Data };

        const optimisticMessage: Message = {
            id: tempId,
            content: encryptedContent,
            senderId: currentUser.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isEdited: false,
            attachments: [attachment],
            sender: { id: currentUser.id, name: currentUser.name || '', email: currentUser.email || '', publicKey: currentUser.publicKey || '' },
        };
        setMessages((prev) => dedupeMessagesById([...prev, optimisticMessage]));
        scrollToBottom();

        try {
            const url = `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}/messages`;
            const bodyStr = JSON.stringify({ content: encryptedContent, attachments: [attachment] });
            const result = await sendWithOfflineQueue(url, { method: 'POST', body: bodyStr }, tempId, (u, opts) =>
                fetchWithAuth(u, opts as RequestInit)
            );

            if (result.queued) {
                toast.info('Message vocal en attente (hors ligne)');
                setFailedMessagePayloads((prev) => new Map(prev).set(tempId, { encryptedContent, attachments: [attachment] }));
            } else if (result.ok && result.response) {
                const data = await result.response.json();
                stableMessageKeysRef.current.set(data.message.id, tempId);
                stableMessageTimestampsRef.current.set(data.message.id, optimisticMessage.createdAt);
                setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
                if (messagesCacheUrl) addMessageToCache(messagesCacheUrl, data.message);
                mutateMessages().catch(() => {});
                scrollToBottom();
            } else if (result.response) {
                toast.error("Erreur d'envoi du message vocal");
                setFailedMessagePayloads((prev) => new Map(prev).set(tempId, { encryptedContent, attachments: [attachment] }));
            }
        } catch (error) {
            console.error('Send audio error:', error);
            toast.error("Erreur d'envoi du message vocal");
            setFailedMessagePayloads((prev) => new Map(prev).set(tempId, { encryptedContent, attachments: [attachment] }));
        } finally {
            setSending(false);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() && selectedFiles.length === 0) return;
        if (!currentUser || !group?.publicKey) {
            toast.error('Utilisateur ou groupe non chargé');
            return;
        }
        if (!privateKey) {
            setShowPasswordDialog(true);
            return;
        }

        setSending(true);
        const plainContent = newMessage.trim() || '';
        const currentFiles = [...selectedFiles];
        setNewMessage('');
        setSelectedFiles([]);
        if (conversationId) stopTyping(conversationId);

        let attachments: { filename: string; type: string; data: string }[] = [];
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

        const encryptedContent = encryptMessage(plainContent, privateKey, group.publicKey);
        const tempId = `temp-${Date.now()}`;
        const optimisticMessage: Message = {
            id: tempId,
            content: encryptedContent,
            senderId: currentUser.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isEdited: false,
            attachments: attachments.length > 0 ? attachments : undefined,
            sender: { id: currentUser.id, name: currentUser.name || '', email: currentUser.email || '', publicKey: currentUser.publicKey || '' },
        };
        setMessages((prev) => dedupeMessagesById([...prev, optimisticMessage]));
        scrollToBottom();

        try {
            const url = `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}/messages`;
            const bodyStr = JSON.stringify({
                content: encryptedContent,
                attachments: attachments.length > 0 ? attachments : undefined,
            });
            const result = await sendWithOfflineQueue(url, { method: 'POST', body: bodyStr }, tempId, (u, opts) =>
                fetchWithAuth(u, opts as RequestInit)
            );

            if (result.queued) {
                toast.info('Message en attente (hors ligne)');
                setFailedMessagePayloads((prev) => new Map(prev).set(tempId, { encryptedContent, attachments: attachments.length > 0 ? attachments : undefined }));
            } else if (result.ok && result.response) {
                const data = await result.response.json();
                stableMessageKeysRef.current.set(data.message.id, tempId);
                stableMessageTimestampsRef.current.set(data.message.id, optimisticMessage.createdAt);
                setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
                if (messagesCacheUrl) addMessageToCache(messagesCacheUrl, data.message);
                mutateMessages().catch(() => {});
                scrollToBottom();
            } else if (result.response) {
                const error = await result.response.json();
                toast.error(error.error || "Erreur d'envoi");
                setFailedMessagePayloads((prev) => new Map(prev).set(tempId, { encryptedContent, attachments: attachments.length > 0 ? attachments : undefined }));
            }
        } catch (error) {
            console.error('Send message error:', error);
            toast.error("Erreur d'envoi du message");
            setFailedMessagePayloads((prev) => new Map(prev).set(tempId, { encryptedContent, attachments: attachments.length > 0 ? attachments : undefined }));
        } finally {
            setSending(false);
        }
    };

    const handleRetryMessage = useCallback(
        async (tempId: string) => {
            const payload = failedMessagePayloads.get(tempId);
            if (!payload || !orgId || !collabId || !groupId) return;

            setSending(true);
            try {
                const res = await fetchWithAuth(
                    `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}/messages`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: payload.encryptedContent,
                            attachments: payload.attachments,
                        }),
                    }
                );

                if (res.ok) {
                    const data = await res.json();
                    setMessages((prev) => {
                        const temp = prev.find((m) => m.id === tempId);
                        if (temp) {
                            stableMessageKeysRef.current.set(data.message.id, tempId);
                            stableMessageTimestampsRef.current.set(data.message.id, temp.createdAt);
                        }
                        return prev.map((m) => (m.id === tempId ? data.message : m));
                    });
                    setFailedMessagePayloads((prev) => {
                        const next = new Map(prev);
                        next.delete(tempId);
                        return next;
                    });
                    if (messagesCacheUrl) addMessageToCache(messagesCacheUrl, data.message);
                    mutateMessages().catch(() => {});
                    scrollToBottom();
                    toast.success('Message envoyé');
                } else {
                    const error = await res.json();
                    toast.error(error.error || "Erreur d'envoi");
                }
            } catch {
                toast.error("Erreur d'envoi du message");
            } finally {
                setSending(false);
            }
        },
        [failedMessagePayloads, orgId, collabId, groupId, messagesCacheUrl, mutateMessages, scrollToBottom]
    );

    const handleEditMessage = async (messageId: string) => {
        if (!editContent.trim() || !currentUser || !group?.publicKey || !privateKey) return;

        try {
            const encryptedContent = encryptMessage(editContent.trim(), privateKey, group.publicKey);
            const response = await fetchWithAuth(`/api/messages/${messageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: encryptedContent }),
            });

            if (response.ok) {
                const data = await response.json();
                setMessages((prev) => prev.map((msg) => (msg.id === messageId ? data.message : msg)));
                setEditingMessageId(null);
                setEditContent('');
                if (messagesCacheUrl && data.message) addMessageToCache(messagesCacheUrl, data.message);
                toast.success('Message modifié');
            }
        } catch {
            toast.error('Erreur de modification');
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!confirm('Supprimer ce message ?')) return;

        try {
            const response = await fetchWithAuth(`/api/messages/${messageId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
                if (messagesCacheUrl) removeMessageFromCache(messagesCacheUrl, messageId);
                toast.success('Message supprimé');
            }
        } catch {
            toast.error('Erreur de suppression');
        }
    };

    const canEditOrDelete = (message: Message): boolean => {
        if (message.senderId !== currentUser?.id) return false;
        const messageTime = new Date(message.createdAt).getTime();
        return Date.now() - messageTime < 5 * 60 * 1000; // 5 minutes
    };

    const loadMoreHistory = useCallback(async () => {
        if (!orgId || !collabId || !groupId || loadingMore || !hasMore || messages.length === 0) return;
        const firstMessage = messages.find((m) => !m.id.startsWith('temp-'));
        if (!firstMessage) return;

        setLoadingMore(true);
        const scrollContainer = scrollRef.current;
        const oldScrollHeight = scrollContainer?.scrollHeight ?? 0;

        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}/messages?cursor=${firstMessage.id}&limit=20`
            );
            if (res.ok) {
                const text = await res.text();
                let data: { messages?: Message[]; hasMore?: boolean } = {};
                try {
                    data = text ? JSON.parse(text) : {};
                } catch {
                    return;
                }
                if (data.messages?.length) {
                    setMessages((prev) => {
                        const existingIds = new Set(prev.map((m) => m.id));
                        const unique = data.messages!.filter((m) => !existingIds.has(m.id));
                        return dedupeMessagesById([...unique, ...prev]);
                    });
                    setHasMore(data.hasMore !== false);
                    requestAnimationFrame(() => {
                        if (scrollContainer) {
                            const newScrollHeight = scrollContainer.scrollHeight;
                            scrollContainer.scrollTop = newScrollHeight - oldScrollHeight;
                        }
                    });
                } else {
                    setHasMore(false);
                }
            }
        } catch {
            toast.error("Impossible de charger l'historique");
        } finally {
            setLoadingMore(false);
        }
    }, [orgId, collabId, groupId, loadingMore, hasMore, messages.length]);

    const loading = messagesLoading;

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen md:h-screen bg-background pt-16 pb-36 md:pb-40 px-3 md:px-4">
                <div className="flex justify-center py-4">
                    <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                </div>
                <div className="space-y-4 flex-1 max-w-2xl mx-auto w-full">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                            <div
                                className={cn(
                                    'rounded-2xl h-12 animate-pulse',
                                    i % 2 === 0 ? 'bg-primary/20 w-3/4' : 'bg-muted w-2/3'
                                )}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!group) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-background">
                <div className="text-muted-foreground">Groupe non trouvé</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen md:h-screen bg-background text-foreground pt-2 md:pt-0">
            <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>Déverrouiller le chat</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground py-2">
                        Entrez votre mot de passe pour déchiffrer vos messages.
                    </p>
                    <Input
                        type="password"
                        placeholder="Votre mot de passe"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    />
                    <DialogFooter>
                        <Button onClick={handleUnlock}>Déverrouiller</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Barre supérieure : retour, infos du groupe, documents/notes */}
            <div className="flex fixed top-0 left-0 right-0 md:static bg-background border-b border-border z-40 h-14 md:h-16 items-center px-3 md:px-4 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/chat/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}`)}
                    className="mr-2 md:mr-3 shrink-0"
                    title="Retour au groupe"
                    aria-label="Retour"
                >
                    <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                </Button>

                <Avatar className="h-10 w-10 border border-border shrink-0">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${group.name}`} />
                    <AvatarFallback>{group.name[0]}</AvatarFallback>
                </Avatar>

                <div className="ml-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-semibold text-foreground truncate">{group.name}</h2>
                        <span
                            className={cn(
                                'flex items-center gap-1 shrink-0 text-[10px]',
                                isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                            )}
                            title={isConnected ? 'Connecté en temps réel' : 'Connexion en cours...'}
                        >
                            {isConnected ? <Wifi className="w-3 h-3" /> : <Circle className="w-2 h-2 animate-pulse" />}
                            {isConnected ? 'En direct' : 'Hors ligne'}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                        {(() => {
                            const count = group._count?.members ?? group.members?.length;
                            const membersText = count != null ? `${count} membre${count > 1 ? 's' : ''}` : '';
                            return membersText ? `${membersText} · Collaboration inter-organisations` : 'Collaboration inter-organisations';
                        })()}
                    </p>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        setDocumentsPanelTab('documents');
                        setDocumentsPanelCreateNote(false);
                        setDocumentsPanelOpen(true);
                    }}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    title="Documents & notes du groupe"
                    aria-label="Documents et notes"
                >
                    <FileText className="w-5 h-5" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/chat/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}`)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    title="Gérer le groupe"
                    aria-label="Paramètres du groupe"
                >
                    <Settings className="w-5 h-5" />
                </Button>
            </div>

            <CollaborationDocumentsPanel
                open={documentsPanelOpen}
                onOpenChange={setDocumentsPanelOpen}
                orgId={orgId}
                collabId={collabId}
                groupId={groupId}
                initialTab={documentsPanelTab}
                openCreateNoteOnMount={documentsPanelCreateNote}
            />

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto pt-16 pb-36 md:pb-40 px-3 md:px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
                {hasMore && messages.length > 0 && (
                    <div className="flex justify-center py-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadMoreHistory}
                            disabled={loadingMore}
                            className="text-muted-foreground"
                        >
                            {loadingMore ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                'Charger les messages précédents'
                            )}
                        </Button>
                    </div>
                )}

                <div ref={messagesContentRef} className="space-y-2">
                    {dedupeMessagesById(messages).map((message) => (
                        <ChatMessageBubble
                            key={stableMessageKeysRef.current.get(message.id) ?? message.id}
                            message={message}
                            displayCreatedAt={stableMessageTimestampsRef.current.get(message.id)}
                            isOwn={message.senderId === currentUser?.id}
                            canEdit={canEditOrDelete(message)}
                            groupPrivateKey={groupPrivateKey}
                            editingMessageId={editingMessageId}
                            editContent={editContent}
                            onEditContentChange={setEditContent}
                            onEditOpen={(content) => {
                                setEditingMessageId(message.id);
                                setEditContent(content);
                            }}
                            onEditSave={() => handleEditMessage(message.id)}
                            onEditCancel={() => {
                                setEditingMessageId(null);
                                setEditContent('');
                            }}
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
                                {(() => {
                                    const typingIds = Object.keys(typingUsers).filter((uid) => typingUsers[uid]);
                                    const names = typingIds
                                        .map((uid) => messages.find((m) => m.senderId === uid)?.sender?.name || messages.find((m) => m.senderId === uid)?.sender?.email)
                                        .filter(Boolean) as string[];
                                    return names.length > 0 ? (names.length === 1 ? names[0] : names.slice(0, 2).join(', ')) : "Quelqu'un";
                                })()}
                            </span>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="fixed left-0 right-0 bottom-16 md:bottom-auto md:static md:border-t md:border-border bg-background p-3 md:p-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-4 z-40 md:shrink-0 border-t border-border">
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
                                <button onClick={() => removeFile(idx)} className="text-destructive hover:text-red-300">
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

                            <Textarea
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
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder="Message..."
                                className="flex-1 min-w-0 bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[40px] max-h-32 py-2"
                                disabled={sending}
                                rows={1}
                            />

                            <Button
                                onClick={handleSendMessage}
                                disabled={sending || (!newMessage.trim() && selectedFiles.length === 0)}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                {sending ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Send className="w-5 h-5" />
                                )}
                            </Button>
                        </>
                    )}

                    <div className={`${!isRecordingAudio ? 'border-l border-border pl-2 ml-1' : 'flex-1'}`}>
                        <AudioRecorderComponent
                            onAudioRecorded={handleAudioRecorded}
                            isRecordingDisabled={sending}
                            onRecordingStatusChange={setIsRecordingAudio}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
