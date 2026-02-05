'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ArrowLeft, Send, Paperclip, Loader2, Image as ImageIcon, FileText, MoreVertical, Edit2, Trash2 } from 'lucide-react';
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
import { AudioRecorderComponent } from '@/src/components/AudioRecorder';

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

    const [conversation, setConversation] = useState<Conversation | null>(null);
    // Messages state is now handled by SWR, but we might keep local state for optimistic updates if needed
    // strictly speaking SWR cache is enough, but to maintain compatibility with existing decrypt logic which iterates over a list,
    // we can use the data from SWR directly in render.

    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const currentUser = getUser();
    const otherUser = conversation?.members.find(m => m.user.id !== currentUser?.id)?.user;

    // SWR for messages - polling every 3 seconds
    const { data: messagesData, error: messagesError, mutate: mutateMessages } = useSWR(
        conversationId ? `/api/conversations/${conversationId}/messages` : null,
        fetcher,
        {
            refreshInterval: 3000,
            revalidateOnFocus: true,
        }
    );

    const messages: Message[] = messagesData?.messages || [];
    const loading = !messagesData && !messagesError;

    // Load conversation details (no polling needed for this usually, or less frequent)
    useEffect(() => {
        loadConversation();
    }, [conversationId]);

    const loadConversation = async () => {
        try {
            const response = await fetchWithAuth(`/api/conversations/${conversationId}`);
            if (response.ok) {
                const data = await response.json();
                setConversation(data.conversation);
            }
        } catch (error) {
            console.error('Load conversation error:', error);
            toast.error('Erreur de chargement de la conversation');
        }
    };

    // Auto scroll to bottom only on initial load or when sending
    // We need a ref to track if it's the first load
    const isFirstLoad = useRef(true);
    useEffect(() => {
        if (messages.length > 0 && isFirstLoad.current) {
            scrollToBottom();
            isFirstLoad.current = false;
        }
    }, [messages.length]);

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

            // Mutate SWR cache immediately
            mutateMessages({ messages: [...messages, optimisticMessage] }, false);

            const response = await fetchWithAuth(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: encryptedContent,
                    attachments: [attachment],
                }),
            });

            if (response.ok) {
                // Revalidate cache to get the real message from server
                mutateMessages();
                scrollToBottom();
            } else {
                toast.error("Erreur d'envoi du message vocal");
                // Rollback if error
                mutateMessages();
            }
        } catch (error) {
            console.error('Send audio error:', error);
            toast.error("Erreur d'envoi du message vocal");
            mutateMessages();
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

            // Add optimistic message and re-render
            mutateMessages({ messages: [...messages, optimisticMessage] }, false);
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
                // Fetch the real state from server to replace temp ID
                mutateMessages();
            } else {
                const error = await response.json();
                console.error('HTTP error:', error);
                toast.error(error.error || 'Erreur d\'envoi');
                // Rollback by revalidating
                mutateMessages();
                // Restore input if failed (optional, but good UX)
                setNewMessage(currentMessage);
                setSelectedFiles(currentFiles);
            }
        } catch (error) {
            console.error('Send message error:', error);
            toast.error('Erreur d\'envoi du message');
            mutateMessages();
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
            const updatedMessages = messages.map(msg =>
                msg.id === messageId ? { ...msg, content: encryptedContent, isEdited: true } : msg
            );
            mutateMessages({ messages: updatedMessages }, false);

            setEditingMessageId(null);
            setEditContent('');

            const response = await fetchWithAuth(`/api/messages/${messageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: encryptedContent }),
            });

            if (response.ok) {
                mutateMessages();
                toast.success('Message modifié');
            } else {
                // Rollback
                mutateMessages({ messages: originalMessages }, false);
                toast.error('Erreur de modification');
            }
        } catch (error) {
            mutateMessages({ messages: originalMessages }, false);
            toast.error('Erreur de modification');
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!confirm('Supprimer ce message ?')) return;

        const originalMessages = messages;

        try {
            // Optimistic update
            const filteredMessages = messages.filter(msg => msg.id !== messageId);
            mutateMessages({ messages: filteredMessages }, false);

            const response = await fetchWithAuth(`/api/messages/${messageId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                mutateMessages();
                toast.success('Message supprimé');
            } else {
                mutateMessages({ messages: originalMessages }, false);
                toast.error('Erreur de suppression');
            }
        } catch (error) {
            mutateMessages({ messages: originalMessages }, false);
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
        <div className="flex flex-col h-screen bg-background text-foreground pt-2">
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

            {/* Header */}
            <div className="fixed top-0 left-0 right-0 bg-background border-b border-border z-40 h-16 flex items-center px-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/chat')}
                    className="mr-3"
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
            </div>

            {/* Messages */}
            <div
                className="flex-1 overflow-y-auto pt-16 pb-40 px-4 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                ref={scrollRef}
            >
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
            <div className="fixed bottom-16 left-0 right-0 bg-background border-t border-border p-4">
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
