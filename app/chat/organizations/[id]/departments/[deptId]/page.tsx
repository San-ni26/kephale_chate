'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
    Users as UsersIcon
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
import { CheckCircle2, Clock, AlertCircle, Calendar as CalendarIcon, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Department {
    id: string;
    name: string;
    publicKey: string;
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

// ... (interfaces stay same)

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
    const [activeTab, setActiveTab] = useState('members');

    const currentUser = getUser();

    // 1. Fetch Department
    const { data: deptData, error: deptError, mutate: mutateDepartment } = useSWR(
        deptId ? `/api/organizations/${orgId}/departments/${deptId}` : null,
        fetcher
    );
    const department: Department | null = deptData?.department || null;
    const loading = !deptData && !deptError;

    // 2. Fetch Tasks (conditionally)
    const { data: tasksData, error: tasksError, mutate: mutateTasks } = useSWR(
        deptId && activeTab === 'tasks' ? `/api/organizations/${orgId}/departments/${deptId}/tasks` : null,
        fetcher
    );
    const tasks: Task[] = tasksData?.tasks || [];
    const loadingTasks = !tasksData && !tasksError && activeTab === 'tasks';

    const refreshDepartment = () => mutateDepartment();
    const refreshTasks = () => mutateTasks();

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
                body: JSON.stringify(newTask),
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
        <div className="min-h-screen bg-background p-4 space-y-6 mt-16">
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

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/chat/organizations/${orgId}`)}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>

                    <Avatar className="h-12 w-12 border border-border">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${department.name}`} />
                        <AvatarFallback>{department.name[0]}</AvatarFallback>
                    </Avatar>

                    <div>
                        <h1 className="text-1xl font-bold text-foreground">{department.name}</h1>
                        <p className="text-sm text-muted-foreground">
                            {department._count.members} membre{department._count.members > 1 ? 's' : ''}
                        </p>
                    </div>
                </div>

            </div>
            <div>

                <Button
                    onClick={() => router.push(`/chat/organizations/${orgId}/departments/${deptId}/chat`)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Ouvrir le chat
                </Button>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="members" className="flex items-center gap-2">
                        <UsersIcon className="w-4 h-4" />
                        Membres
                    </TabsTrigger>
                    <TabsTrigger value="tasks" className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" />
                        Tâches
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="members">
                    {/* Members Section Original */}
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-1xl text-foreground flex items-center gap-2">
                                    <UsersIcon className="w-5 h-5 " />
                                    Membres du département
                                </CardTitle>

                            </div>
                            <div>
                                <Button
                                    size="sm"
                                    onClick={() => setShowAddMemberDialog(true)}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                >
                                    <UserPlus className="w-4 h-4 mr-2" />
                                    Ajouter un membre
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {department.members.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                                    <UsersIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                                    <p className="text-muted-foreground">Aucun membre dans ce département</p>
                                    <p className="text-sm text-muted-foreground mb-4">Ajoutez des membres pour commencer</p>
                                    <Button
                                        size="sm"
                                        onClick={() => setShowAddMemberDialog(true)}
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        <UserPlus className="w-4 h-4 mr-2" />
                                        Ajouter un membre
                                    </Button>
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
                                                            <p className="text-sm font-semibold text-foreground truncate">
                                                                {member.user.name || 'Sans nom'}
                                                            </p>
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
                                                        </div>
                                                    </div>
                                                    {member.user.id !== currentUser?.id && (
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
                                <Button
                                    size="sm"
                                    onClick={() => setShowCreateTaskDialog(true)}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                >
                                    <UserPlus className="w-4 h-4 mr-2" />
                                    Attribuer une tâche
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loadingTasks ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : tasks.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                                    <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                                    <p className="text-muted-foreground">Aucune tâche assignée</p>
                                    <Button
                                        size="sm"
                                        onClick={() => setShowCreateTaskDialog(true)}
                                        className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        Créer une tâche
                                    </Button>
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
            </Tabs>

            {/* Create Task Dialog */}
            <Dialog open={showCreateTaskDialog} onOpenChange={setShowCreateTaskDialog}>
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
        </div >
    );
}
