'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Separator } from "@/src/components/ui/separator";
import {
    Loader2, ArrowLeft, Send, CheckCircle2, XCircle, Clock,
    AlertCircle, FileIcon, Paperclip, Calendar, X, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TaskAttachment } from './TaskAttachment';
import { Image as ImageIcon, FileText } from 'lucide-react';
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
        };
        attachments: {
            id: string;
            filename: string;
            url: string;
            fileType: string;
            size?: number;
        }[];
    }[];
    attachments: any[];
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

    const task: Task | null = taskData?.task || null;
    const loading = !taskData && !taskError;

    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);

    // Attachments State
    const [pendingAttachments, setPendingAttachments] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollToBottom();
    }, [task?.messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

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

        setSending(true);
        try {
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/tasks/${taskId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: newMessage,
                    attachments: pendingAttachments
                }),
            });

            if (response.ok) {
                setNewMessage('');
                setPendingAttachments([]);
                mutate();
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
            <div className="flex justify-center items-center h-screen bg-background">
                <div className="text-muted-foreground">Tâche non trouvée</div>
            </div>
        );
    }

    const isAssignee = currentUser?.id === task.assignee.id;
    const isCreator = currentUser?.id === task.creator.id;
    const canManage = isAssignee || isCreator; // Adjust based on rules (Owner/Admin check logic is in API too)

    return (
        <div className="min-h-screen bg-background p-4 mt-16 max-w-7xl mx-auto">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">{task.title}</h1>
                        <p className="text-muted-foreground text-sm">
                            Créée par {task.creator.name} • {format(new Date(task.createdAt || new Date()), 'd MMM yyyy')}
                        </p>
                    </div>
                </div>

                {canManage && (
                    <div className="flex gap-2">
                        {task.status !== 'COMPLETED' && (
                            <Button
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleUpdateStatus('COMPLETED')}
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Terminer
                            </Button>
                        )}
                        {task.status === 'COMPLETED' && isCreator && (
                            <Button
                                variant="outline"
                                onClick={() => handleUpdateStatus('IN_PROGRESS')}
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                Rouvrir
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
                {/* Left: Task Details */}
                <Card className="lg:col-span-1 flex flex-col h-full bg-card border-border overflow-y-auto">
                    <CardContent className="p-6 space-y-6">
                        <div>
                            <h3 className="font-semibold mb-2">Statut</h3>
                            <div className="flex items-center gap-2">
                                <Badge variant={
                                    task.status === 'COMPLETED' ? 'default' :
                                        task.status === 'IN_PROGRESS' ? 'secondary' : 'outline'
                                } className={task.status === 'COMPLETED' ? 'bg-green-500 hover:bg-green-600' : ''}>
                                    {task.status}
                                </Badge>
                                <Badge variant="outline">{task.priority}</Badge>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Description</h3>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {task.description || 'Aucune description'}
                            </p>
                        </div>

                        <Separator />

                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Avatar className="w-6 h-6">
                                        <AvatarImage src={task.assignee.avatarUrl} />
                                        <AvatarFallback>{task.assignee.name[0]}</AvatarFallback>
                                    </Avatar>
                                    Assigné à
                                </span>
                                <span className="font-medium">{task.assignee.name}</span>
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    Date limite
                                </span>
                                <span className="font-medium">
                                    {task.dueDate ? format(new Date(task.dueDate), 'd MMM yyyy') : '-'}
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Début
                                </span>
                                <span className="font-medium">
                                    {task.startDate ? format(new Date(task.startDate), 'd MMM yyyy') : '-'}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Right: Chat / Execution */}
                <Card className="lg:col-span-2 flex flex-col h-full bg-card border-border">
                    <div className="p-4 border-b border-border font-semibold flex items-center gap-2">
                        <FileIcon className="w-5 h-5" />
                        Exécution & Discussions
                    </div>

                    <ScrollArea className="flex-1 p-4">
                        <div className="space-y-4">
                            {task.messages.length === 0 ? (
                                <div className="text-center text-muted-foreground py-10">
                                    Commencez la discussion sur cette tâche...
                                </div>
                            ) : (
                                task.messages.map((msg) => {
                                    const isMe = msg.sender.id === currentUser?.id;
                                    return (
                                        <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                            <Avatar className="w-8 h-8">
                                                <AvatarImage src={msg.sender.avatarUrl} />
                                                <AvatarFallback>{msg.sender.name[0]}</AvatarFallback>
                                            </Avatar>
                                            <div className={`max-w-[80%] rounded-lg p-3 ${isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'
                                                }`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-semibold opacity-80">{msg.sender.name}</span>
                                                    <span className="text-[10px] opacity-60">
                                                        {format(new Date(msg.createdAt), 'HH:mm')}
                                                    </span>
                                                </div>
                                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                {msg.attachments && msg.attachments.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {msg.attachments.map((att) => (
                                                            <TaskAttachment key={att.id} attachment={att} />
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
                    </ScrollArea>

                    <div className="p-4 border-t border-border">
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
                                placeholder="Écrire un message..."
                                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                className="flex-1"
                            />
                            <Button onClick={handleSendMessage} disabled={sending || (!newMessage.trim() && pendingAttachments.length === 0)}>
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}