'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/avatar';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import {
    ArrowLeft,
    Loader2,
    UserPlus,
    X,
    MessageSquare,
    Users as UsersIcon,
    Paperclip,
    Image as ImageIcon,
    FileText,
    MoreVertical,
    Pencil,
    Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/src/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Textarea } from "@/src/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { CheckCircle2, Clock, AlertCircle, Calendar as CalendarIcon, ClipboardList, Crown, Target, Calendar, BarChart3, Vote } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Department {
    id: string;
    name: string;
    publicKey: string;
    headId?: string | null;
    head?: {
        id: string;
        name: string | null;
        email: string;
    } | null;
    members: {
        id: string;
        user: {
            id: string;
            name: string;
            email: string;
            isOnline: boolean;
        };
    }[];
    _count: {
        members: number;
    };
}

interface Task {
    id: string;
    title: string;
    description: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    startDate?: string;
    dueDate?: string;
    assignee: {
        id: string;
        name: string;
        avatarUrl?: string;
    };
    creator: {
        id: string;
        name: string;
    };
    _count: {
        messages: number;
        attachments: number;
    };
    createdAt: string;
}

import useSWR from 'swr';
import { fetcher } from '@/src/lib/fetcher';
import DepartmentGoalsTab from '@/src/components/organizations/DepartmentGoalsTab';
import DepartmentMeetingsTab from '@/src/components/organizations/DepartmentMeetingsTab';
import DepartmentPollsTab from '@/src/components/organizations/DepartmentPollsTab';
import DepartmentDecisionsTab from '@/src/components/organizations/DepartmentDecisionsTab';

function DepartmentReportsTab({
    orgId,
    deptId,
    isOrgAdmin,
}: {
    orgId: string;
    deptId: string;
    isOrgAdmin: boolean;
}) {
    const currentMonth = format(new Date(), 'yyyy-MM');
    const { data: reportData, mutate } = useSWR<{ report: { content: string; createdAt?: string; updatedAt?: string } | null; canEdit: boolean }>(
        orgId && deptId && !isOrgAdmin ? `/api/organizations/${orgId}/departments/${deptId}/reports?month=${currentMonth}` : null,
        fetcher
    );
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (reportData?.report?.content !== undefined) {
            setContent(reportData.report?.content ?? '');
        }
    }, [reportData?.report?.content]);

    const handleSaveReport = async () => {
        if (!orgId || !deptId || !reportData?.canEdit) return;
        setSaving(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/reports?month=${currentMonth}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
            if (res.ok) {
                toast.success('Rapport enregistré');
                mutate();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            console.error('Save report error:', e);
            toast.error('Erreur serveur');
        } finally {
            setSaving(false);
        }
    };

    if (isOrgAdmin) {
        return (
            <Card className="bg-card border-border">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Rapports mensuels du département
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Consultez les rapports déposés par les membres, par mois, et les membres qui n&apos;ont pas rendu de rapport.
                    </p>
                    <Button
                        onClick={() => router.push(`/chat/organizations/${orgId}/departments/${deptId}/reports`)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        <FileText className="w-4 h-4 mr-2" />
                        Voir la liste des rapports par mois
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const canEdit = reportData?.canEdit ?? false;

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Mon rapport du mois ({format(new Date(currentMonth + '-01'), 'MMMM yyyy', { locale: fr })})
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {!canEdit && (
                    <p className="text-sm text-amber-600 dark:text-amber-500">
                        Le mois est terminé. Vous ne pouvez plus modifier ce rapport.
                    </p>
                )}
                <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Renseignez votre rapport d'activité du mois..."
                    className="min-h-[180px]"
                    disabled={!canEdit}
                />
                {canEdit && (
                    <Button onClick={handleSaveReport} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Enregistrer le rapport
                    </Button>
                )}
                {reportData?.report?.updatedAt && (
                    <p className="text-xs text-muted-foreground">
                        Dernière mise à jour : {format(new Date(reportData.report.updatedAt), 'd MMM yyyy à HH:mm', { locale: fr })}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

export default function DepartmentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const orgId = params?.id as string;
    const deptId = params?.deptId as string;

    const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [addingMember, setAddingMember] = useState(false);
    const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

    // Task State
    const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        assigneeId: '',
        priority: 'MEDIUM',
        startDate: '',
        dueDate: ''
    });
    const [creatingTask, setCreatingTask] = useState(false);
    const [taskAttachments, setTaskAttachments] = useState<{ url: string; filename: string; fileType?: string; size?: number }[]>([]);
    const [uploadingTaskFile, setUploadingTaskFile] = useState(false);
    const taskFileInputRef = useRef<HTMLInputElement>(null);
    const searchParams = useSearchParams();
    const tabParam = searchParams?.get('tab');
    const [activeTab, setActiveTab] = useState('members');
    useEffect(() => {
        if (tabParam === 'reports' || tabParam === 'tasks' || tabParam === 'goals' || tabParam === 'meetings' || tabParam === 'polls' || tabParam === 'decisions') setActiveTab(tabParam);
    }, [tabParam]);

    const handleSetDepartmentHead = async (userId: string | null) => {
        if (!orgId || !deptId || !canManageHead) return;
        setUpdatingHead(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ headId: userId || null }),
            });
            if (res.ok) {
                toast.success(userId ? 'Chef du département mis à jour' : 'Chef du département retiré');
                refreshDepartment();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            console.error('Set head error:', e);
            toast.error('Erreur serveur');
        } finally {
            setUpdatingHead(false);
        }
    };

    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [editTaskForm, setEditTaskForm] = useState({
        title: '',
        description: '',
        assigneeId: '',
        priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
        startDate: '',
        dueDate: ''
    });
    const [updatingTask, setUpdatingTask] = useState(false);
    const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

    const currentUser = getUser();

    // 1. Fetch Department
    const { data: deptData, error: deptError, mutate: mutateDepartment } = useSWR(
        deptId ? `/api/organizations/${orgId}/departments/${deptId}` : null,
        fetcher
    );
    const department: Department | null = deptData?.department ?? null;
    const userOrgRole = (deptData as { userOrgRole?: 'OWNER' | 'ADMIN' | 'MEMBER' } | null)?.userOrgRole ?? null;
    const orgOwnerId = (deptData as { orgOwnerId?: string | null } | null)?.orgOwnerId ?? null;
    const isOwner = userOrgRole === 'OWNER';
    const isOrgAdmin = userOrgRole === 'OWNER' || userOrgRole === 'ADMIN';
    const isDeptHead = Boolean(department?.headId && currentUser && department.headId === currentUser.id);
    const canManageHead = isOwner;
    const canAddOrRemoveMember = isOwner || isOrgAdmin || isDeptHead;
    const canCreateTask = isOrgAdmin || isDeptHead;
    const loading = !deptData && !deptError;

    const [updatingHead, setUpdatingHead] = useState(false);

    useEffect(() => {
        if (!canAddOrRemoveMember && activeTab === 'members') setActiveTab('tasks');
    }, [canAddOrRemoveMember, activeTab]);

    // 2. Fetch Tasks (conditionally)
    const { data: tasksData, error: tasksError, mutate: mutateTasks } = useSWR(
        deptId && activeTab === 'tasks' ? `/api/organizations/${orgId}/departments/${deptId}/tasks` : null,
        fetcher
    );
    const tasks: Task[] = tasksData?.tasks || [];
    const loadingTasks = !tasksData && !tasksError && activeTab === 'tasks';

    const refreshDepartment = () => mutateDepartment();
    const refreshTasks = () => mutateTasks();

    const handleTaskFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;
        setUploadingTaskFile(true);
        try {
            for (const file of Array.from(files)) {
                const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
                if (!validTypes.includes(file.type)) {
                    toast.error(`Type non autorisé: ${file.name}`);
                    continue;
                }
                if (file.size > 10 * 1024 * 1024) {
                    toast.error(`${file.name} trop volumineux (max 10 Mo)`);
                    continue;
                }
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetchWithAuth('/api/upload', { method: 'POST', body: formData });
                if (res.ok) {
                    const data = await res.json();
                    setTaskAttachments(prev => [...prev, { url: data.url, filename: data.filename, fileType: data.fileType, size: data.size }]);
                } else toast.error(`Échec upload: ${file.name}`);
            }
        } finally {
            setUploadingTaskFile(false);
            if (taskFileInputRef.current) taskFileInputRef.current.value = '';
        }
    };

    const removeTaskAttachment = (index: number) => {
        setTaskAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleCreateTask = async () => {
        if (!newTask.title || !newTask.assigneeId) {
            toast.error('Titre et assigné requis');
            return;
        }

        setCreatingTask(true);
        try {
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newTask,
                    attachments: taskAttachments.length > 0 ? taskAttachments : undefined,
                }),
            });

            if (response.ok) {
                toast.success('Tâche créée avec succès');
                setShowCreateTaskDialog(false);
                setNewTask({
                    title: '',
                    description: '',
                    assigneeId: '',
                    priority: 'MEDIUM',
                    startDate: '',
                    dueDate: ''
                });
                setTaskAttachments([]);
                refreshTasks();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Erreur lors de la création');
            }
        } catch (error) {
            console.error('Create task error:', error);
            toast.error('Erreur serveur');
        } finally {
            setCreatingTask(false);
        }
    };

    const openEditTaskDialog = (task: Task) => {
        setEditingTask(task);
        setEditTaskForm({
            title: task.title,
            description: task.description || '',
            assigneeId: task.assignee.id,
            priority: task.priority,
            startDate: task.startDate ? format(new Date(task.startDate), 'yyyy-MM-dd') : '',
            dueDate: task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : ''
        });
    };

    const handleUpdateTask = async () => {
        if (!editingTask || !editTaskForm.title || !editTaskForm.assigneeId) {
            toast.error('Titre et assigné requis');
            return;
        }
        setUpdatingTask(true);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/tasks/${editingTask.id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: editTaskForm.title,
                        description: editTaskForm.description || null,
                        assigneeId: editTaskForm.assigneeId,
                        priority: editTaskForm.priority,
                        startDate: editTaskForm.startDate || null,
                        dueDate: editTaskForm.dueDate || null,
                    }),
                }
            );
            if (res.ok) {
                toast.success('Tâche mise à jour');
                setEditingTask(null);
                refreshTasks();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur lors de la mise à jour');
            }
        } catch (e) {
            console.error('Update task error:', e);
            toast.error('Erreur serveur');
        } finally {
            setUpdatingTask(false);
        }
    };

    const handleDeleteTask = async (task: Task) => {
        if (!confirm(`Supprimer la tâche « ${task.title} » ?`)) return;
        setDeletingTaskId(task.id);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/tasks/${task.id}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                toast.success('Tâche supprimée');
                refreshTasks();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur lors de la suppression');
            }
        } catch (e) {
            console.error('Delete task error:', e);
            toast.error('Erreur serveur');
        } finally {
            setDeletingTaskId(null);
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'URGENT': return 'text-red-500 bg-red-100 dark:bg-red-900/20';
            case 'HIGH': return 'text-orange-500 bg-orange-100 dark:bg-orange-900/20';
            case 'MEDIUM': return 'text-blue-500 bg-blue-100 dark:bg-blue-900/20';
            case 'LOW': return 'text-green-500 bg-green-100 dark:bg-green-900/20';
            default: return 'text-gray-500 bg-gray-100 dark:bg-gray-800';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'COMPLETED': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'IN_PROGRESS': return <Clock className="w-4 h-4 text-blue-500" />;
            case 'PENDING': return <AlertCircle className="w-4 h-4 text-gray-500" />;
            case 'CANCELLED': return <X className="w-4 h-4 text-red-500" />;
            default: return <AlertCircle className="w-4 h-4" />;
        }
    };

    const handleAddMember = async () => {
        if (!newMemberEmail.trim()) return;

        setAddingMember(true);

        try {
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newMemberEmail.trim() }),
            });

            if (response.ok) {
                toast.success('Membre ajouté avec succès');
                setNewMemberEmail('');
                setShowAddMemberDialog(false);
                refreshDepartment();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Erreur lors de l\'ajout du membre');
            }
        } catch (error) {
            console.error('Add member error:', error);
            toast.error('Erreur lors de l\'ajout du membre');
        } finally {
            setAddingMember(false);
        }
    };

    const handleRemoveMember = async (memberId: string, memberName: string) => {
        if (!confirm(`Voulez-vous vraiment retirer ${memberName} du département ?`)) return;

        setRemovingMemberId(memberId);

        try {
            const response = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/members/${memberId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Membre retiré avec succès');
                refreshDepartment();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Erreur lors du retrait du membre');
            }
        } catch (error) {
            console.error('Remove member error:', error);
            toast.error('Erreur lors du retrait du membre');
        } finally {
            setRemovingMemberId(null);
        }
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
        <div className="min-h-screen bg-background p-4 md:p-6 space-y-6 mt-16 md:mt-16 pb-20 md:pb-6">
            {/* Add Member Dialog */}
            <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajouter un membre</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground mb-4">
                            Entrez l'adresse email du membre à ajouter au département.
                        </p>
                        <Input
                            type="email"
                            placeholder="email@example.com"
                            value={newMemberEmail}
                            onChange={(e) => setNewMemberEmail(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddMember()}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setShowAddMemberDialog(false)}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleAddMember}
                            disabled={addingMember || !newMemberEmail.trim()}
                        >
                            {addingMember ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
                            Ajouter
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Header : masqué sur mobile (même barre que TopNav avec icône chat), visible sur web */}
            <div className="hidden md:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/chat/organizations/${orgId}`)}
                        className="shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>

                    <Avatar className="h-11 w-11 md:h-12 md:w-12 border border-border shrink-0">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${department.name}`} />
                        <AvatarFallback>{department.name[0]}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0">
                        <h1 className="text-lg md:text-xl font-bold text-foreground truncate">{department.name}</h1>
                        <p className="text-sm text-muted-foreground">
                            {department._count.members} membre{department._count.members > 1 ? 's' : ''}
                            {department.head && (
                                <span className="ml-2 inline-flex items-center gap-2 text-primary">
                                    <Crown className="w-3.5 h-3.5" />
                                    Chef : {department.head.name || department.head.email}
                                    {canManageHead && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs text-muted-foreground hover:text-destructive"
                                            onClick={() => handleSetDepartmentHead(null)}
                                            disabled={updatingHead}
                                        >
                                            Retirer
                                        </Button>
                                    )}
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                <Button
                    onClick={() => router.push(`/chat/organizations/${orgId}/departments/${deptId}/chat`)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto shrink-0"
                >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Ouvrir le chat
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 pb-4 ">
                <TabsList style={{ height: 'auto', paddingBottom: '10px', }} className="flex-wrap sm:flex-wrap overflow-visible mb-4">
                    {canAddOrRemoveMember && (
                        <TabsTrigger value="members" className="flex items-center gap-2">
                            <UsersIcon className="w-4 h-4" />
                            Membres
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="tasks" className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" />
                        Tâches
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Rapports
                    </TabsTrigger>
                    <TabsTrigger value="goals" className="flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Objectifs
                    </TabsTrigger>
                    <TabsTrigger value="meetings" className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Réunions
                    </TabsTrigger>
                    <TabsTrigger value="polls" className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        Sondages
                    </TabsTrigger>
                    <TabsTrigger value="decisions" className="flex items-center gap-2">
                        <Vote className="w-4 h-4" />
                        Décisions
                    </TabsTrigger>
                </TabsList>

                {canAddOrRemoveMember && (
                    <TabsContent value="members">
                        <Card className="bg-card border-border">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-1xl text-foreground flex items-center gap-2">
                                        <UsersIcon className="w-5 h-5 " />
                                        Membres du département
                                    </CardTitle>
                                    {canAddOrRemoveMember && (
                                        <Button
                                            size="sm"
                                            onClick={() => setShowAddMemberDialog(true)}
                                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                        >
                                            <UserPlus className="w-4 h-4 mr-2" />
                                            Ajouter un membre
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                {department.members.length === 0 ? (
                                    <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                                        <UsersIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                                        <p className="text-muted-foreground">Aucun membre dans ce département</p>
                                        {canAddOrRemoveMember && (
                                            <>
                                                <p className="text-sm text-muted-foreground mb-4">Ajoutez des membres pour commencer</p>
                                                <Button
                                                    size="sm"
                                                    onClick={() => setShowAddMemberDialog(true)}
                                                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                                >
                                                    <UserPlus className="w-4 h-4 mr-2" />
                                                    Ajouter un membre
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {department.members.map((member) => (
                                            <Card
                                                key={member.id}
                                                className="bg-muted/50 border-border hover:border-primary/50 transition"
                                            >
                                                <CardContent className="pt-6">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                            <Avatar className="h-12 w-12 border border-border">
                                                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.user.name || member.user.email}`} />
                                                                <AvatarFallback>
                                                                    {(member.user.name || member.user.email)[0].toUpperCase()}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-sm font-semibold text-foreground truncate">
                                                                        {member.user.name || 'Sans nom'}
                                                                    </p>
                                                                    {department.headId === member.user.id && (
                                                                        <span className="shrink-0 text-primary" title="Chef du département">
                                                                            <Crown className="w-4 h-4" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-muted-foreground truncate">
                                                                    {member.user.email}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-2">
                                                                    <div className={`w-2 h-2 rounded-full ${member.user.isOnline ? 'bg-green-500' : 'bg-gray-400'
                                                                        }`} />
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {member.user.isOnline ? 'En ligne' : 'Hors ligne'}
                                                                    </span>
                                                                </div>
                                                                {canManageHead && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="mt-2"
                                                                        disabled={updatingHead || department.headId === member.user.id}
                                                                        onClick={() => handleSetDepartmentHead(member.user.id)}
                                                                    >
                                                                        {department.headId === member.user.id ? (
                                                                            <Crown className="w-3 h-3 mr-1 text-primary" />
                                                                        ) : null}
                                                                        {department.headId === member.user.id ? 'Chef' : 'Nommer chef'}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {canAddOrRemoveMember && member.user.id !== orgOwnerId && member.user.id !== currentUser?.id && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleRemoveMember(member.id, member.user.name || member.user.email)}
                                                                disabled={removingMemberId === member.id}
                                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            >
                                                                {removingMemberId === member.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <X className="w-4 h-4" />
                                                                )}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                <TabsContent value="tasks">
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-1xl text-foreground flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5" />
                                    Tâches du département
                                </CardTitle>

                            </div>
                            <div>
                                {canCreateTask && (
                                    <Button
                                        size="sm"
                                        onClick={() => setShowCreateTaskDialog(true)}
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        <ClipboardList className="w-4 h-4 mr-2" />
                                        Nouvelle tâche
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {!canCreateTask && (
                                <p className="text-sm text-muted-foreground mb-4">Seul le propriétaire, un admin de l&apos;organisation ou le chef du département peut créer des tâches.</p>
                            )}
                            {loadingTasks ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : tasks.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                                    <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                                    <p className="text-muted-foreground">Aucune tâche assignée</p>
                                    {canCreateTask && (
                                        <Button
                                            size="sm"
                                            onClick={() => setShowCreateTaskDialog(true)}
                                            className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground"
                                        >
                                            Créer une tâche
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {tasks.map((task) => (
                                        <Card
                                            key={task.id}
                                            className="cursor-pointer hover:border-primary/50 transition"
                                            onClick={() => router.push(`/chat/organizations/${orgId}/departments/${deptId}/tasks/${task.id}`)}
                                        >
                                            <CardContent className="p-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="font-semibold text-lg">{task.title}</h3>
                                                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                                            {task.description || 'Pas de description'}
                                                        </p>
                                                        <div className="flex items-center gap-4 mt-3 text-sm">
                                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                                <CalendarIcon className="w-4 h-4" />
                                                                {task.dueDate ? format(new Date(task.dueDate), 'd MMM yyyy', { locale: fr }) : 'Pas de date'}
                                                            </div>
                                                            <div className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                                                {task.priority}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <div
                                                            className="flex items-center gap-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="icon"
                                                                        className="h-8 w-8 shrink-0 border-border bg-background hover:bg-muted"
                                                                        aria-label="Modifier ou supprimer la tâche"
                                                                    >
                                                                        <MoreVertical className="w-4 h-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem onClick={() => openEditTaskDialog(task)}>
                                                                        <Pencil className="w-4 h-4 mr-2" />
                                                                        Modifier
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="text-destructive focus:text-destructive"
                                                                        onClick={() => handleDeleteTask(task)}
                                                                        disabled={deletingTaskId === task.id}
                                                                    >
                                                                        {deletingTaskId === task.id ? (
                                                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                                        ) : (
                                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                                        )}
                                                                        Supprimer
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            {getStatusIcon(task.status)}
                                                            <span className="text-xs">{task.status}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <Avatar className="w-6 h-6">
                                                                <AvatarImage src={task.assignee.avatarUrl} />
                                                                <AvatarFallback>{task.assignee.name[0]}</AvatarFallback>
                                                            </Avatar>
                                                            <span className="text-xs text-muted-foreground">Assigné à {task.assignee.name}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="reports">
                    <DepartmentReportsTab
                        orgId={orgId}
                        deptId={deptId}
                        isOrgAdmin={isOrgAdmin}
                    />
                </TabsContent>

                <TabsContent value="goals">
                    <DepartmentGoalsTab
                        orgId={orgId}
                        deptId={deptId}
                        canManage={canCreateTask}
                    />
                </TabsContent>

                <TabsContent value="meetings">
                    <DepartmentMeetingsTab
                        orgId={orgId}
                        deptId={deptId}
                        canManage={canCreateTask}
                    />
                </TabsContent>

                <TabsContent value="polls">
                    <DepartmentPollsTab
                        orgId={orgId}
                        deptId={deptId}
                        canManage={canCreateTask}
                    />
                </TabsContent>

                <TabsContent value="decisions">
                    <DepartmentDecisionsTab
                        orgId={orgId}
                        deptId={deptId}
                        canManage={canCreateTask}
                    />
                </TabsContent>
            </Tabs>

            {/* Create Task Dialog */}
            <Dialog open={showCreateTaskDialog} onOpenChange={(open) => { setShowCreateTaskDialog(open); if (!open) setTaskAttachments([]); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Nouvelle Tâche</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Titre</label>
                            <Input
                                value={newTask.title}
                                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                placeholder="Titre de la tâche"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Description</label>
                            <Textarea
                                value={newTask.description}
                                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                placeholder="Détails de la tâche..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Assigné à</label>
                                <Select
                                    value={newTask.assigneeId}
                                    onValueChange={(val) => setNewTask({ ...newTask, assigneeId: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choisir un membre" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {department.members.map((member) => (
                                            <SelectItem key={member.user.id} value={member.user.id}>
                                                {member.user.name || member.user.email}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Priorité</label>
                                <Select
                                    value={newTask.priority}
                                    onValueChange={(val) => setNewTask({ ...newTask, priority: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="LOW">Basse</SelectItem>
                                        <SelectItem value="MEDIUM">Moyenne</SelectItem>
                                        <SelectItem value="HIGH">Haute</SelectItem>
                                        <SelectItem value="URGENT">Urgente</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date de début</label>
                                <Input
                                    type="date"
                                    value={newTask.startDate}
                                    onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date limite</label>
                                <Input
                                    type="date"
                                    value={newTask.dueDate}
                                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Documents / images (optionnel)</label>
                            <input
                                ref={taskFileInputRef}
                                type="file"
                                multiple
                                accept="image/*,.pdf,.doc,.docx"
                                onChange={handleTaskFileSelect}
                                className="hidden"
                            />
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => taskFileInputRef.current?.click()}
                                    disabled={uploadingTaskFile}
                                >
                                    {uploadingTaskFile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Paperclip className="w-4 h-4 mr-2" />}
                                    Joindre des fichiers
                                </Button>
                            </div>
                            {taskAttachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {taskAttachments.map((att, i) => (
                                        <div key={i} className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2 text-sm border border-border">
                                            {att.fileType === 'IMAGE' ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                            <span className="max-w-[140px] truncate">{att.filename}</span>
                                            <button type="button" onClick={() => removeTaskAttachment(i)} className="text-destructive hover:text-red-600">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowCreateTaskDialog(false)}>Annuler</Button>
                        <Button onClick={handleCreateTask} disabled={creatingTask}>
                            {creatingTask && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Créer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Task Dialog */}
            <Dialog open={!!editingTask} onOpenChange={(open) => { if (!open) setEditingTask(null); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Modifier la tâche</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Titre</label>
                            <Input
                                value={editTaskForm.title}
                                onChange={(e) => setEditTaskForm({ ...editTaskForm, title: e.target.value })}
                                placeholder="Titre de la tâche"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Description</label>
                            <Textarea
                                value={editTaskForm.description}
                                onChange={(e) => setEditTaskForm({ ...editTaskForm, description: e.target.value })}
                                placeholder="Détails de la tâche..."
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Assigné à</label>
                                <Select
                                    value={editTaskForm.assigneeId}
                                    onValueChange={(val) => setEditTaskForm({ ...editTaskForm, assigneeId: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choisir un membre" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {department?.members.map((member) => (
                                            <SelectItem key={member.user.id} value={member.user.id}>
                                                {member.user.name || member.user.email}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Priorité</label>
                                <Select
                                    value={editTaskForm.priority}
                                    onValueChange={(val) => setEditTaskForm({ ...editTaskForm, priority: val as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="LOW">Basse</SelectItem>
                                        <SelectItem value="MEDIUM">Moyenne</SelectItem>
                                        <SelectItem value="HIGH">Haute</SelectItem>
                                        <SelectItem value="URGENT">Urgente</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date de début</label>
                                <Input
                                    type="date"
                                    value={editTaskForm.startDate}
                                    onChange={(e) => setEditTaskForm({ ...editTaskForm, startDate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date limite</label>
                                <Input
                                    type="date"
                                    value={editTaskForm.dueDate}
                                    onChange={(e) => setEditTaskForm({ ...editTaskForm, dueDate: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingTask(null)}>Annuler</Button>
                        <Button onClick={handleUpdateTask} disabled={updatingTask}>
                            {updatingTask && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
