'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from "@/src/components/ui/input";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Separator } from "@/src/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import {
    Loader2, ArrowLeft, Send, CheckCircle2, XCircle, Clock,
    FileIcon, Paperclip, Calendar, X, Image as ImageIcon, FileText, Pin
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { TaskAttachment } from './TaskAttachment';
import { encryptMessage, decryptMessage, decryptPrivateKey } from '@/src/lib/crypto';
import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';

interface Task {
    id: string;
    title: string;
    description: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    startDate?: string;
    dueDate?: string;
    completedAt?: string;
    createdAt: string;
    assignee: {
        id: string;
        name: string;
        avatarUrl?: string;
        email: string;
    };
    creator: {
        id: string;
        name: string;
        avatarUrl?: string;
    };
    messages: {
        id: string;
        content: string;
        createdAt: string;
        sender: {
            id: string;
            name: string;
            avatarUrl?: string;
            publicKey?: string;
        };
        attachments: {
            id: string;
            filename: string;
            url: string;
            fileType: string;
            size?: number;
        }[];
    }[];
    attachments: { id: string; filename: string; url: string; fileType: string | null; size?: number | null }[];
}

export default function TaskPage() {
    const params = useParams();
    const router = useRouter();
    const orgId = params?.id as string;
    const deptId = params?.deptId as string;
    const taskId = params?.taskId as string;
    const currentUser = getUser();

    const { data: taskData, error: taskError, mutate } = useSWR(
        taskId ? `/api/organizations/${orgId}/departments/${deptId}/tasks/${taskId}` : null,
        fetcher
    );
    const { data: deptData } = useSWR(
        orgId && deptId ? `/api/organizations/${orgId}/departments/${deptId}` : null,
        fetcher
    );

    const task: Task | null = taskData?.task || null;
    const department = deptData?.department as { publicKey?: string } | undefined;
    const currentMemberEncryptedDeptKey = deptData?.currentMemberEncryptedDeptKey as string | undefined;
    const loading = !taskData && !taskError;

    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [departmentPrivateKey, setDepartmentPrivateKey] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);

    const [pendingAttachments, setPendingAttachments] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
    const [showTaskInfo, setShowTaskInfo] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (currentUser) {
            const stored = sessionStorage.getItem(`privateKey_${currentUser.id}`);
            if (stored) setPrivateKey(stored);
            else setShowPasswordDialog(true);
        }
    }, [currentUser?.id]);
    useEffect(() => {
        if (currentMemberEncryptedDeptKey && department?.publicKey)
            setDepartmentPrivateKey(currentMemberEncryptedDeptKey);
    }, [currentMemberEncryptedDeptKey, department?.publicKey]);

    const handleUnlock = () => {
        if (!currentUser || !password) return;
        try {
            const decrypted = decryptPrivateKey(currentUser.encryptedPrivateKey, password);
            setPrivateKey(decrypted);
            sessionStorage.setItem(`privateKey_${currentUser.id}`, decrypted);
            setShowPasswordDialog(false);
            setPassword('');
            toast.success('Clé déverrouillée');
        } catch {
            toast.error('Mot de passe incorrect');
        }
    };

    const scrollToBottom = useCallback(() => {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, []);
    useEffect(() => {
        if (task?.messages?.length) scrollToBottom();
    }, [task?.messages?.length, scrollToBottom]);

    const decryptMessageContent = useCallback((msg: Task['messages'][0]): string => {
        if (!departmentPrivateKey || !msg.sender?.publicKey) return '[Chiffré]';
        try {
            return decryptMessage(msg.content, departmentPrivateKey, msg.sender.publicKey) || '';
        } catch {
            return '[Erreur de déchiffrement]';
        }
    }, [departmentPrivateKey]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        setUploading(true);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                setPendingAttachments([...pendingAttachments, data]);
            } else {
                toast.error('Erreur lors de l\'upload');
            }
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Erreur lors de l\'upload');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const removeAttachment = (index: number) => {
        setPendingAttachments(pendingAttachments.filter((_, i) => i !== index));
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() && pendingAttachments.length === 0) return;
        if (!department?.publicKey) { toast.error('Département non chargé'); return; }
        if (!privateKey) { setShowPasswordDialog(true); return; }

        setSending(true);
        const plainContent = newMessage.trim() || '';
        setNewMessage('');
        const attachmentsToSend = [...pendingAttachments];
        setPendingAttachments([]);

        try {
            const contentToSend = plainContent
                ? encryptMessage(plainContent, privateKey, department.publicKey)
                : '';

            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/tasks/${taskId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: contentToSend, attachments: attachmentsToSend }),
            });

            if (response.ok) {
                mutate();
                scrollToBottom();
            } else {
                toast.error('Erreur lors de l\'envoi');
            }
        } catch (error) {
            console.error('Send message error:', error);
            toast.error('Erreur serveur');
        } finally {
            setSending(false);
        }
    };

    const handleUpdateStatus = async (status: string) => {
        if (!confirm(`Changer le statut en ${status} ?`)) return;

        try {
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });

            if (response.ok) {
                toast.success('Statut mis à jour');
                mutate();
            } else {
                toast.error('Erreur lors de la mise à jour');
            }
        } catch (error) {
            console.error('Update status error:', error);
            toast.error('Erreur serveur');
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!task) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-background">
                <div className="text-muted-foreground">Tâche non trouvée</div>
            </div>
        );
    }

    const isAssignee = currentUser?.id === task.assignee.id;
    const isCreator = currentUser?.id === task.creator.id;
    const canManage = isAssignee || isCreator;

    const renderTaskInfoPanel = () => (
        <div className="flex flex-col h-full bg-card border-border border-l overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
                <span className="font-semibold text-sm">Infos tâche</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowTaskInfo(false)}>
                    <X className="w-4 h-4" />
                </Button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1">
                <div>
                    <h3 className="font-semibold text-sm mb-2">Statut</h3>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant={task.status === 'COMPLETED' ? 'default' : 'outline'} className={task.status === 'COMPLETED' ? 'bg-green-500 hover:bg-green-600' : ''}>{task.status}</Badge>
                        <Badge variant="outline">{task.priority}</Badge>
                    </div>
                </div>
                <div>
                    <h3 className="font-semibold text-sm mb-2">Description</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description || 'Aucune description'}</p>
                </div>
                {task.attachments && task.attachments.length > 0 && (
                    <div>
                        <h3 className="font-semibold text-sm mb-2">Documents joints</h3>
                        <div className="space-y-2">
                            {task.attachments.map((att) => (
                                <TaskAttachment key={att.id} attachment={att} />
                            ))}
                        </div>
                    </div>
                )}
                <Separator />
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-2">
                            <Avatar className="w-6 h-6"><AvatarImage src={task.assignee.avatarUrl} /><AvatarFallback>{task.assignee.name[0]}</AvatarFallback></Avatar>
                            Assigné à
                        </span>
                        <span className="font-medium truncate ml-2">{task.assignee.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" /> Date limite</span>
                        <span className="font-medium">{task.dueDate ? format(new Date(task.dueDate), 'd MMM yyyy', { locale: fr }) : '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-2"><Calendar className="w-4 h-4" /> Début</span>
                        <span className="font-medium">{task.startDate ? format(new Date(task.startDate), 'd MMM yyyy', { locale: fr }) : '-'}</span>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col min-h-screen h-screen bg-background pt-16 pb-16 md:pt-0 md:pb-0 md:h-screen">
            <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>Déverrouiller la discussion</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground py-2">Entrez votre mot de passe pour chiffrer/déchiffrer les messages.</p>
                    <Input
                        type="password"
                        placeholder="Mot de passe"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    />
                    <DialogFooter>
                        <Button onClick={handleUnlock}>Déverrouiller</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Desktop: header dans la page (TopNav masquée) */}
            <div className="hidden md:flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold truncate">{task.title}</h1>
                        <p className="text-muted-foreground text-xs">Créée par {task.creator.name} • {format(new Date(task.createdAt), 'd MMM yyyy', { locale: fr })}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTaskInfo((v) => !v)}
                        title={showTaskInfo ? 'Masquer les infos' : 'Afficher les infos tâche'}
                    >
                        <Pin className={`w-4 h-4 mr-1 ${showTaskInfo ? 'opacity-70' : ''}`} />
                        {showTaskInfo ? 'Masquer' : 'Infos'}
                    </Button>
                    {canManage && (
                        <>
                            {task.status !== 'COMPLETED' && (
                                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleUpdateStatus('COMPLETED')}>
                                    <CheckCircle2 className="w-4 h-4 mr-1" /> Terminer
                                </Button>
                            )}
                            {task.status === 'COMPLETED' && isCreator && (
                                <Button size="sm" variant="outline" onClick={() => handleUpdateStatus('IN_PROGRESS')}>
                                    <XCircle className="w-4 h-4 mr-1" /> Rouvrir
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-1 min-h-0 relative">
                {/* Discussion pleine largeur (comme page discussion) */}
                <div className="flex-1 flex flex-col min-w-0 bg-background">
                    {/* Bouton épingler infos (mobile) */}
                    <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
                        <span className="text-sm text-muted-foreground">Discussion</span>
                        <Button variant="ghost" size="sm" onClick={() => setShowTaskInfo((v) => !v)}>
                            <Pin className={`w-4 h-4 mr-1 ${showTaskInfo ? 'opacity-70' : ''}`} />
                            {showTaskInfo ? 'Masquer infos' : 'Infos tâche'}
                        </Button>
                    </div>

                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 pb-2 space-y-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted">
                        {task.messages.length === 0 ? (
                            <div className="text-center text-muted-foreground py-8 text-sm">Commencez la discussion (messages chiffrés)…</div>
                        ) : (
                            task.messages.map((msg) => {
                                const isMe = msg.sender.id === currentUser?.id;
                                const decrypted = decryptMessageContent(msg);
                                return (
                                    <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>

                                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${isMe ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-semibold opacity-90">{msg.sender.name}</span>
                                                <span className="text-[10px] opacity-70">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true, locale: fr })}</span>
                                            </div>
                                            {decrypted && decrypted.trim() && <p className="text-sm whitespace-pre-wrap break-words">{decrypted}</p>}
                                            {msg.attachments && msg.attachments.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {msg.attachments.map((att) => (
                                                        <TaskAttachment key={att.id} attachment={att} isOwn={isMe} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-3 md:p-4 border-t border-border shrink-0 bg-background pb-3 md:pb-4">
                        {pendingAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {pendingAttachments.map((att, i) => (
                                    <div
                                        key={i}
                                        className="bg-muted rounded px-3 py-2 flex items-center gap-2 text-sm border border-border"
                                    >
                                        {att.fileType === 'IMAGE' ? (
                                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                            <FileText className="w-4 h-4 text-muted-foreground" />
                                        )}
                                        <span className="max-w-[150px] truncate text-foreground">{att.filename}</span>
                                        <button
                                            onClick={() => removeAttachment(i)}
                                            className="text-destructive hover:text-red-300 ml-1"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                            {/* Attachment Button Placeholder */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5 text-muted-foreground" />}
                            </Button>

                            <Input
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Message chiffré..."
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                                className="flex-1 min-w-0"
                            />
                            <Button onClick={handleSendMessage} disabled={sending || (!newMessage.trim() && pendingAttachments.length === 0)}>
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Panneau infos tâche (affichable / masquable) */}
                {showTaskInfo && (
                    <>
                        <div className="hidden md:block w-80 shrink-0 overflow-hidden" aria-label="Infos tâche">
                            {renderTaskInfoPanel()}
                        </div>
                        <div className="md:hidden fixed right-0 top-0 bottom-0 w-full max-w-sm z-40 shadow-xl bg-card flex flex-col">
                            {renderTaskInfoPanel()}
                        </div>
                        <div className="md:hidden fixed inset-0 z-30 bg-black/50" aria-hidden onClick={() => setShowTaskInfo(false)} />
                    </>
                )}
            </div>
        </div>
    );
}