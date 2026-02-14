'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
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
    Settings,
    Calendar,
    ExternalLink,
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/src/components/ui/dialog';
import { EncryptedAttachment } from '@/app/chat/discussion/[id]/EncryptedAttachment';
import { AudioRecorderComponent } from '@/src/components/AudioRecorder';
import { DepartmentDocumentsPanel } from '@/src/components/chat/DepartmentDocumentsPanel';
import { encryptMessage, decryptMessage, decryptPrivateKey } from '@/src/lib/crypto';

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
    publicKey: string;
    _count: {
        members: number;
    };
}

interface PinnedEvent {
    id: string;
    title: string;
    description?: string | null;
    eventType: string;
    eventDate: string;
    maxAttendees: number;
    imageUrl?: string | null;
    token: string;
}

export default function DepartmentChatPage() {
    const params = useParams();
    const router = useRouter();
    const orgId = params?.id as string;
    const deptId = params?.deptId as string;

    const [department, setDepartment] = useState<Department | null>(null);
    const [currentMemberEncryptedDeptKey, setCurrentMemberEncryptedDeptKey] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [pinnedEvents, setPinnedEvents] = useState<PinnedEvent[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [departmentPrivateKey, setDepartmentPrivateKey] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [documentsPanelOpen, setDocumentsPanelOpen] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const currentUser = getUser();

    const messagesFetcher = useCallback(async (url: string) => {
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error('Failed to fetch messages');
        const data = await res.json();
        return data;
    }, []);

    const dedupeMessagesById = (list: Message[]) => {
        const seen = new Set<string>();
        return list.filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
        });
    };

    const { data: messagesData, mutate: mutateMessages, isLoading: messagesLoading } = useSWR(
        orgId && deptId ? `/api/organizations/${orgId}/departments/${deptId}/messages` : null,
        messagesFetcher,
        { refreshInterval: 3000, revalidateOnFocus: true }
    );

    useEffect(() => {
        if (messagesData?.messages != null) {
            setMessages(dedupeMessagesById(messagesData.messages));
            if (messagesData.pinnedEvents) setPinnedEvents(messagesData.pinnedEvents);
        }
    }, [messagesData]);

    useEffect(() => {
        if (deptId) loadDepartment();
    }, [deptId]);

    useEffect(() => {
        const openDocs = () => setDocumentsPanelOpen(true);
        window.addEventListener('department-chat-open-documents', openDocs);
        return () => window.removeEventListener('department-chat-open-documents', openDocs);
    }, []);

    const loading = messagesLoading;

    const loadDepartment = async () => {
        try {
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}`);
            if (response.ok) {
                const data = await response.json();
                setDepartment(data.department);
                setCurrentMemberEncryptedDeptKey(data.currentMemberEncryptedDeptKey ?? null);
                // Pour le créateur du département, encryptedDeptKey est la clé privée du département (stockée telle quelle)
                if (data.currentMemberEncryptedDeptKey && data.department?.publicKey) {
                    setDepartmentPrivateKey(data.currentMemberEncryptedDeptKey);
                }
            }
        } catch (error) {
            console.error('Load department error:', error);
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
    }, [mutateMessages]);

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
        if (!currentUser || !department?.publicKey) {
            toast.error("Utilisateur ou département non chargé");
            return;
        }
        if (!privateKey) {
            setShowPasswordDialog(true);
            return;
        }

        setSending(true);
        const encryptedContent = encryptMessage('', privateKey, department.publicKey);

        try {
            const base64Data = await fileToBase64(audioFile);
            const attachment = { filename: audioFile.name, type: 'AUDIO', data: base64Data };

            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: encryptedContent, attachments: [attachment] }),
            });

            if (response.ok) {
                const data = await response.json();
                setMessages(prev => dedupeMessagesById([...prev, data.message]));
                mutateMessages().catch(() => {});
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
        if (!currentUser || !department?.publicKey) {
            toast.error("Utilisateur ou département non chargé");
            return;
        }
        if (!privateKey) {
            setShowPasswordDialog(true);
            return;
        }

        setSending(true);
        const plainContent = newMessage.trim() || '';
        setNewMessage('');
        setSelectedFiles([]);

        try {
            let attachments: { filename: string; type: string; data: string }[] = [];
            if (selectedFiles.length > 0) {
                for (const file of selectedFiles) {
                    const base64Data = await fileToBase64(file);
                    const ext = file.name.split('.').pop()?.toLowerCase() || '';
                    let fileType = 'IMAGE';
                    if (['pdf'].includes(ext)) fileType = 'PDF';
                    else if (['doc', 'docx'].includes(ext)) fileType = 'WORD';
                    else if (['webm', 'mp3', 'ogg', 'm4a', 'wav'].includes(ext)) fileType = 'AUDIO';
                    attachments.push({ filename: file.name, type: fileType, data: base64Data });
                }
            }

            const encryptedContent = encryptMessage(plainContent, privateKey, department.publicKey);

            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: encryptedContent,
                    attachments: attachments.length > 0 ? attachments : undefined,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setMessages(prev => dedupeMessagesById([...prev, data.message]));
                mutateMessages().catch(() => {});
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
        if (!editContent.trim() || !currentUser || !department?.publicKey || !privateKey) return;

        try {
            const encryptedContent = encryptMessage(editContent.trim(), privateKey, department.publicKey);
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

    const canEditOrDelete = (message: Message): boolean => {
        if (message.senderId !== currentUser?.id) return false;
        const messageTime = new Date(message.createdAt).getTime();
        return (Date.now() - messageTime) < 5 * 60 * 1000; // 5 minutes
    };

    const decryptMessageContent = useCallback((message: Message): string => {
        if (!departmentPrivateKey || !message.sender?.publicKey) return '[Chiffré]';
        try {
            return decryptMessage(message.content, departmentPrivateKey, message.sender.publicKey) || '';
        } catch {
            return '[Erreur de déchiffrement]';
        }
    }, [departmentPrivateKey]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!department) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-background">
                <div className="text-muted-foreground">Département non trouvé</div>
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

            {/* Header : visible sur tous les écrans (icône Fiches toujours visible) */}
            <div className="flex fixed top-0 left-0 right-0 md:static bg-background border-b border-border z-40 h-14 md:h-16 items-center px-3 md:px-4 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/chat/organizations/${orgId}/departments/${deptId}`)}
                    className="mr-2 md:mr-3 shrink-0"
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
                    onClick={() => setDocumentsPanelOpen(true)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    title="Fiches & documents du département"
                    aria-label="Fiches & documents"
                >
                    <FileText className="w-5 h-5" />
                </Button>

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

            <DepartmentDocumentsPanel
                open={documentsPanelOpen}
                onOpenChange={setDocumentsPanelOpen}
                orgId={orgId}
                deptId={deptId}
            />

            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto pt-16 pb-36 md:pb-40 px-3 md:px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
                {/* Événements épinglés — une seule ligne, fixe en haut */}
                {pinnedEvents.length > 0 && (
                    <div className="sticky top-0 z-10 -mx-3 px-3 md:-mx-4 md:px-4 py-2 mb-2 bg-background border-b border-border shrink-0 flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                            Événements
                        </span>
                        {pinnedEvents
                            .filter((ev) => new Date(ev.eventDate) >= new Date())
                            .map((ev) => (
                                <a
                                    key={ev.id}
                                    href={`${typeof window !== 'undefined' ? window.location.origin : ''}/events/${ev.token}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition min-w-0 max-w-[220px]"
                                >
                                    {ev.imageUrl ? (
                                        <div className="w-8 h-8 rounded overflow-hidden bg-muted shrink-0">
                                            <img src={ev.imageUrl} alt="" className="w-full h-full object-cover" />
                                        </div>
                                    ) : (
                                        <Calendar className="w-4 h-4 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className="text-sm font-medium text-foreground truncate">{ev.title}</span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                        {new Date(ev.eventDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                </a>
                            ))}
                    </div>
                )}

                <div className="space-y-2">
                {dedupeMessagesById(messages).map((message) => {
                    const isOwn = message.senderId === currentUser?.id;
                    const canEdit = canEditOrDelete(message);
                    const decryptedContent = decryptMessageContent(message);

                    return (
                        <div
                            key={message.id}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`max-w-[85%] md:max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
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
                                            <Button size="sm" onClick={() => handleEditMessage(message.id)}>
                                                Enregistrer
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => { setEditingMessageId(null); setEditContent(''); }}
                                            >
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
                                                    <p className="text-xs opacity-70 mt-1">Modifié</p>
                                                )}
                                            </div>
                                        )}

                                        {message.attachments && message.attachments.length > 0 && (
                                            <div className={`${decryptedContent?.trim() ? 'mt-2' : ''} space-y-2`}>
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
                                                                setEditContent(decryptedContent || '');
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
            </div>

            {/* Input: sur petit écran au-dessus de la BottomNav (h-16) pour rester visible */}
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
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                                placeholder="Message chiffré..."
                                className="flex-1 min-w-0 bg-muted border-border text-foreground placeholder:text-muted-foreground"
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
