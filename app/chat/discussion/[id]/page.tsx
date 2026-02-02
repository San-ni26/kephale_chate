'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ArrowLeft, Send, Paperclip, Loader2, Image as ImageIcon, FileText, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';

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

export default function DiscussionPage() {
    const params = useParams();
    const router = useRouter();
    const conversationId = params.id as string;

    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const currentUser = getUser();
    const otherUser = conversation?.members.find(m => m.user.id !== currentUser?.id)?.user;

    // Polling for new messages (every 10 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            loadMessages(true); // silent update
        }, 10000);

        return () => clearInterval(interval);
    }, [conversationId]);

    // Load conversation and messages
    useEffect(() => {
        loadConversation();
        loadMessages();
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

    const loadMessages = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const response = await fetchWithAuth(`/api/conversations/${conversationId}/messages`);
            if (response.ok) {
                const data = await response.json();
                setMessages(data.messages || []);
                if (!silent) scrollToBottom();
            }
        } catch (error) {
            console.error('Load messages error:', error);
            if (!silent) toast.error('Erreur de chargement des messages');
        } finally {
            if (!silent) setLoading(false);
        }
    };

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

    // Helper function to convert File to base64 efficiently (avoids stack overflow)
    const fileToBase64 = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1]; // Remove data:...;base64, prefix
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleAudioRecorded = async (blob: Blob, duration: number) => {
        // Determine extension and type based on blob.type
        let ext = 'webm';
        if (blob.type.includes('mp4')) ext = 'mp4';
        else if (blob.type.includes('aac')) ext = 'aac';
        else if (blob.type.includes('ogg')) ext = 'ogg';

        // Create a File object from the Blob
        const file = new File([blob], `audio-message-${Date.now()}.${ext}`, { type: blob.type });

        // Add to selected files to trigger encryption and sending flow
        // But we want to send immediately usually? 
        // Let's reuse handleSendMessage mechanism by adding it to selectedFiles and calling send
        // Or better, creating a specialized function since file handling is tied to UI

        const audioFile = file;
        await sendAudioMessage(audioFile);
    };

    const sendAudioMessage = async (audioFile: File) => {
        if (!currentUser || !otherUser || !privateKey) {
            toast.error("Clé de chiffrement manquante");
            return;
        }

        setSending(true);

        try {
            // Convert audio file to base64 efficiently (no encryption)
            const base64Data = await fileToBase64(audioFile);

            const attachment = {
                filename: audioFile.name,
                type: 'AUDIO',
                data: base64Data,
            };

            // Send via API (text content is still encrypted)
            const encryptedContent = encryptMessage(
                '[Message vocal]',
                privateKey,
                otherUser.publicKey
            );

            const response = await fetchWithAuth(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: encryptedContent,
                    attachments: [attachment],
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setMessages(prev => [...prev, data.message]);
                scrollToBottom();
            } else {
                toast.error("Erreur d'envoi du message vocal");
            }
        } catch (error) {
            console.error('Send audio error:', error);
            toast.error("Erreur d'envoi du message vocal");
        } finally {
            setSending(false);
        }
    };

    // Initial check for key
    useEffect(() => {
        if (currentUser && !privateKey) {
            setShowPasswordDialog(true);
        }
    }, [currentUser, privateKey]);

    const handleUnlock = () => {
        if (!currentUser || !password) return;

        try {
            const decrypted = decryptPrivateKey(currentUser.encryptedPrivateKey, password);
            setPrivateKey(decrypted);
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

        try {
            let attachments = [];

            // Process files if any (no encryption, just convert to base64)
            if (selectedFiles.length > 0) {
                for (const file of selectedFiles) {
                    // Convert file to base64 efficiently
                    const base64Data = await fileToBase64(file);

                    // Determine file type from extension
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

            // Encrypt message content
            const encryptedContent = encryptMessage(
                newMessage.trim() || '[Fichier joint]',
                privateKey, // Use decrypted key
                otherUser.publicKey
            );

            // Send via API
            const response = await fetchWithAuth(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: encryptedContent,
                    attachments: attachments.length > 0 ? attachments : undefined,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setMessages(prev => [...prev, data.message]);
                setNewMessage('');
                setSelectedFiles([]);
                scrollToBottom();

                // WebSocket code removed
                /*
                if (socket) {
                    socket.emit('send-message', {
                        conversationId,
                        message: data.message,
                    });
                }
                */
            } else {
                const error = await response.json();
                toast.error(error.error || 'Erreur d\'envoi');
            }
        } catch (error) {
            console.error('Send message error:', error);
            toast.error('Erreur d\'envoi du message');
        } finally {
            setSending(false);
        }
    };

    const handleEditMessage = async (messageId: string) => {
        if (!editContent.trim() || !currentUser || !otherUser || !privateKey) return;

        try {
            const encryptedContent = encryptMessage(
                editContent.trim(),
                privateKey, // Use decrypted key
                otherUser.publicKey
            );

            const response = await fetchWithAuth(`/api/messages/${messageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: encryptedContent }),
            });

            if (response.ok) {
                const data = await response.json();
                setMessages(prev => prev.map(msg =>
                    msg.id === messageId ? data.message : msg
                ));
                setEditingMessageId(null);
                setEditContent('');
                toast.success('Message modifié');
            }
        } catch (error) {
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
                setMessages(prev => prev.filter(msg => msg.id !== messageId));
                toast.success('Message supprimé');
            }
        } catch (error) {
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
                privateKey, // Use decrypted key
                senderPublicKey
            ) || '[Erreur de déchiffrement]';
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
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950">
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
            <div className="fixed top-0 left-0 right-0 bg-slate-900 border-b border-slate-800 z-40 h-16 flex items-center px-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/chat')}
                    className="mr-3"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>

                <Avatar className="h-10 w-10 border border-slate-700">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${getConversationName()}`} />
                    <AvatarFallback>{getConversationName()[0]}</AvatarFallback>
                </Avatar>

                <div className="ml-3 flex-1">
                    <h2 className="font-semibold text-slate-100">{getConversationName()}</h2>
                    {otherUser && (
                        <p className="text-xs text-slate-400">
                            {otherUser.isOnline ? 'En ligne' : 'Hors ligne'}
                        </p>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto pt-16 pb-24 px-4 space-y-4">
                {messages.map((message) => {
                    const isOwn = message.senderId === currentUser?.id;
                    const decryptedContent = decryptMessageContent(message);
                    const canEdit = canEditOrDelete(message);

                    return (
                        <div
                            key={message.id}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                                {editingMessageId === message.id ? (
                                    <div className="bg-slate-800 rounded-lg p-3 w-full">
                                        <Input
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="mb-2 bg-slate-900"
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
                                        <div
                                            className={`rounded-2xl px-4 py-2 ${isOwn
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-800 text-slate-100'
                                                }`}
                                        >
                                            <p className="break-words whitespace-pre-wrap">{decryptedContent}</p>

                                            {/* Attachments */}
                                            {message.attachments && message.attachments.length > 0 && (
                                                <div className="mt-2 space-y-2">
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

                                            {message.isEdited && (
                                                <p className="text-xs opacity-70 mt-1">Modifié</p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-slate-500">
                                                {formatDistanceToNow(new Date(message.createdAt), {
                                                    addSuffix: true,
                                                    locale: fr,
                                                })}
                                            </span>

                                            {isOwn && canEdit && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                                        >
                                                            <MoreVertical className="w-3 h-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent>
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
                                                            className="text-red-500"
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
            <div className="fixed bottom-16 left-0 right-0 bg-slate-900 border-t border-slate-800 p-4">
                {selectedFiles.length > 0 && (
                    <div className="mb-3 flex gap-2 flex-wrap">
                        {selectedFiles.map((file, idx) => (
                            <div
                                key={idx}
                                className="bg-slate-800 rounded px-3 py-2 flex items-center gap-2 text-sm"
                            >
                                {file.type.startsWith('image/') ? (
                                    <ImageIcon className="w-4 h-4" />
                                ) : (
                                    <FileText className="w-4 h-4" />
                                )}
                                <span className="max-w-[150px] truncate">{file.name}</span>
                                <button
                                    onClick={() => removeFile(idx)}
                                    className="text-red-400 hover:text-red-300"
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

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending}
                    >
                        <Paperclip className="w-5 h-5" />
                    </Button>

                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder="Votre message..."
                        className="flex-1 bg-slate-800 border-slate-700"
                        disabled={sending}
                    />

                    <Button
                        onClick={handleSendMessage}
                        disabled={sending || (!newMessage.trim() && selectedFiles.length === 0)}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {sending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </Button>

                    <div className="border-l border-slate-700 pl-2 ml-1">
                        <AudioRecorderComponent
                            onAudioRecorded={handleAudioRecorded}
                            isRecordingDisabled={sending}
                        />
                    </div>
                </div>
            </div>

        </div>
    );
}
