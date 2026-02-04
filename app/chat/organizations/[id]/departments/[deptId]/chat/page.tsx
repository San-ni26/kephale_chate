'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
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
    Settings
} from 'lucide-react';
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
import { EncryptedAttachment } from '@/app/chat/discussion/[id]/EncryptedAttachment';
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

interface Department {
    id: string;
    name: string;
    _count: {
        members: number;
    };
}

export default function DepartmentChatPage() {
    const params = useParams();
    const router = useRouter();
    const orgId = params?.id as string;
    const deptId = params?.deptId as string;

    const [department, setDepartment] = useState<Department | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const currentUser = getUser();

    // Polling for new messages
    useEffect(() => {
        const interval = setInterval(() => {
            loadMessages(true);
        }, 10000);

        return () => clearInterval(interval);
    }, [deptId]);

    useEffect(() => {
        if (deptId) {
            loadDepartment();
            loadMessages();
        }
    }, [deptId]);

    const loadDepartment = async () => {
        try {
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}`);
            if (response.ok) {
                const data = await response.json();
                setDepartment(data.department);
            }
        } catch (error) {
            console.error('Load department error:', error);
        }
    };

    const loadMessages = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/messages`);
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
        if (!currentUser) {
            toast.error("Utilisateur non connecté");
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

            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: '',
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

    const handleSendMessage = async () => {
        if (!newMessage.trim() && selectedFiles.length === 0) return;
        if (!currentUser) {
            toast.error("Utilisateur non connecté");
            return;
        }

        setSending(true);

        try {
            let attachments = [];

            if (selectedFiles.length > 0) {
                for (const file of selectedFiles) {
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

            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: newMessage.trim() || '',
                    attachments: attachments.length > 0 ? attachments : undefined,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setMessages(prev => [...prev, data.message]);
                setNewMessage('');
                setSelectedFiles([]);
                scrollToBottom();
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
        if (!editContent.trim() || !currentUser) return;

        try {
            const response = await fetchWithAuth(`/api/messages/${messageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent.trim() }),
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

    const canEditOrDelete = (message: Message): boolean => {
        if (message.senderId !== currentUser?.id) return false;
        const messageTime = new Date(message.createdAt).getTime();
        const now = Date.now();
        return (now - messageTime) < 5 * 60 * 1000; // 5 minutes
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!department) {
        return (
            <div className="flex justify-center items-center h-screen bg-background">
                <div className="text-muted-foreground">Département non trouvé</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background text-foreground pt-2">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 bg-background border-b border-border z-40 h-16 flex items-center px-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/chat/organizations/${orgId}/departments/${deptId}`)}
                    className="mr-3"
                >
                    <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                </Button>

                <Avatar className="h-10 w-10 border border-border">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${department.name}`} />
                    <AvatarFallback>{department.name[0]}</AvatarFallback>
                </Avatar>

                <div className="ml-3 flex-1">
                    <h2 className="font-semibold text-foreground">{department.name}</h2>
                    <p className="text-xs text-muted-foreground">
                        {department._count.members} membre{department._count.members > 1 ? 's' : ''}
                    </p>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/chat/organizations/${orgId}/departments/${deptId}`)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Gérer les membres"
                >
                    <Settings className="w-5 h-5" />
                </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto pt-16 pb-40 px-4 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {messages.map((message) => {
                    const isOwn = message.senderId === currentUser?.id;
                    const canEdit = canEditOrDelete(message);

                    return (
                        <div
                            key={message.id}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                                {/* Afficher le nom de l'utilisateur qui a envoyé le message */}
                                {!isOwn && (
                                    <span className="text-xs text-muted-foreground mb-1 px-2">
                                        {message.sender.name || message.sender.email}
                                    </span>
                                )}

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
                                        {/* Text bubble */}
                                        {message.content && message.content.trim() && (
                                            <div
                                                className={`rounded-2xl px-4 py-2 border ${isOwn
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'bg-muted text-foreground border-border'
                                                    }`}
                                            >
                                                <p className="break-words whitespace-pre-wrap">{message.content}</p>
                                                {message.isEdited && (
                                                    <p className="text-xs opacity-70 mt-1">Modifié</p>
                                                )}
                                            </div>
                                        )}

                                        {/* Attachments */}
                                        {message.attachments && message.attachments.length > 0 && (
                                            <div className={`${message.content && message.content.trim() ? 'mt-2' : ''} space-y-2`}>
                                                {message.attachments.map((att, idx) => (
                                                    <EncryptedAttachment
                                                        key={idx}
                                                        attachment={att}
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-muted-foreground">
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
                                                                setEditContent(message.content);
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
                                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                                placeholder="Votre message..."
                                className="flex-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                                disabled={sending}
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
