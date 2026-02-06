"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Building2, Users, Calendar, Plus, ArrowLeft, Settings, MessageSquare, LogOut, Pencil, Trash2, ClipboardList, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { toast } from "sonner";
import { fetchWithAuth, getUser } from "@/src/lib/auth-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/src/components/ui/select";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";


interface Organization {
    id: string;
    name: string;
    logo?: string;
    address?: string;
    code: string;
    ownerId: string;
    subscription?: {
        plan: string;
        maxDepartments: number;
        maxMembersPerDept: number;
        endDate?: string;
    };
    _count: {
        members: number;
        departments: number;
        events: number;
    };
}

interface Department {
    id: string;
    name: string;
    _count: {
        members: number;
        conversations: number;
    };
}

interface UserDepartment {
    id: string;
    department: {
        id: string;
        name: string;
        _count: {
            members: number;
        };
    };
}

interface Task {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate?: string | Date;
    department: {
        id: string;
        name: string;
    };
}

export default function OrganizationDashboard() {
    const router = useRouter();
    const params = useParams();
    const orgId = params?.id as string;
    const currentUser = getUser();

    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
    const [editName, setEditName] = useState("");

    // Tasks Filter State
    const [taskFilterStatus, setTaskFilterStatus] = useState<string>("ALL");
    const [taskFilterMonth, setTaskFilterMonth] = useState<string>("ALL");

    // 1. Fetch Organization
    const { data: orgData, error: orgError } = useSWR(
        orgId ? `/api/organizations/${orgId}` : null,
        fetcher
    );
    const org: Organization | null = orgData?.organization || null;

    // 2. Derive Admin Status
    const isAdmin = org
        ? (org.ownerId === currentUser?.id || orgData?.userRole === 'ADMIN' || orgData?.userRole === 'OWNER')
        : false;

    // 3. Fetch Departments (Admin only)
    const { data: deptData, mutate: mutateDepartments } = useSWR(
        orgId && isAdmin ? `/api/organizations/${orgId}/departments` : null,
        fetcher
    );
    const departments: Department[] = deptData?.departments || [];

    // 4. Fetch User Departments (Non-admin)
    const { data: userDeptData, mutate: mutateUserDepartments } = useSWR(
        orgId && !isAdmin ? `/api/organizations/${orgId}/user-departments` : null,
        fetcher
    );
    const userDepartments: UserDepartment[] = userDeptData?.departments || [];

    // 5. Fetch My Tasks
    const getTasksUrl = () => {
        if (!orgId) return null;
        const params: Record<string, string> = { status: taskFilterStatus };
        if (taskFilterMonth !== 'ALL') params.month = taskFilterMonth;
        const query = new URLSearchParams(params);
        return `/api/organizations/${orgId}/my-tasks?${query.toString()}`;
    };

    const { data: tasksData } = useSWR(getTasksUrl(), fetcher);
    const myTasks: Task[] = tasksData?.tasks || [];

    const loading = !orgData && !orgError;

    // Helper to refresh data
    const refreshData = () => {
        mutateDepartments();
        mutateUserDepartments();
    }

    const handleCreateDepartment = async () => {
        const name = prompt("Nom du département:");
        if (!name) return;

        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Erreur lors de la création du département');
                return;
            }

            toast.success('Département créé avec succès');
            refreshData();
        } catch (error) {
            console.error('Error creating department:', error);
            toast.error('Erreur lors de la création du département');
        }
    };

    const handleLeaveDepartment = async (deptMemberId: string, deptName: string) => {
        if (!confirm(`Voulez-vous vraiment quitter le département "${deptName}" ?`)) return;

        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/leave/${deptMemberId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                toast.success('Vous avez quitté le département');
                refreshData();
            } else {
                const error = await res.json();
                toast.error(error.error || 'Erreur lors de la sortie du département');
            }
        } catch (error) {
            console.error('Error leaving department:', error);
            toast.error('Erreur lors de la sortie du département');
        }
    };

    const handleDeleteDepartment = async (deptId: string) => {
        if (!confirm("Attention : Cette action est irréversible. Toutes les discussions, fichiers et membres seront supprimés et détachés de ce département. Voulez-vous vraiment continuer ?")) return;

        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                toast.success('Département supprimé');
                refreshData();
            } else {
                const error = await res.json();
                toast.error(error.error || 'Erreur lors de la suppression');
            }
        } catch (error) {
            console.error('Error deleting department:', error);
            toast.error('Erreur serveur');
        }
    };

    const openEditDialog = (dept: Department) => {
        setEditingDepartment(dept);
        setEditName(dept.name);
        setIsEditOpen(true);
    };

    const handleUpdateDepartment = async () => {
        if (!editingDepartment || !editName.trim()) return;

        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${editingDepartment.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName })
            });

            if (res.ok) {
                toast.success('Département modifié');
                setIsEditOpen(false);
                setEditingDepartment(null);
                refreshData();
            } else {
                toast.error('Erreur lors de la modification');
            }
        } catch (error) {
            console.error('Error updating department:', error);
            toast.error('Erreur serveur');
        }
    };

    const renderMyTasks = () => (
        <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <ClipboardList className="w-5 h-5" />
                    Mes Tâches
                </h2>
                <div className="flex items-center gap-2">
                    <Select value={taskFilterMonth} onValueChange={setTaskFilterMonth}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Période" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Toutes les périodes</SelectItem>
                            {/* Generate last 6 months */}
                            {Array.from({ length: 6 }).map((_, i) => {
                                const date = new Date();
                                date.setMonth(date.getMonth() - i);
                                const value = format(date, 'yyyy-MM');
                                const label = format(date, 'MMMM yyyy', { locale: fr });
                                return (
                                    <SelectItem key={value} value={value}>
                                        {label.charAt(0).toUpperCase() + label.slice(1)}
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>

                    <Select value={taskFilterStatus} onValueChange={setTaskFilterStatus}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Statut" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tous les statuts</SelectItem>
                            <SelectItem value="PENDING">En attente</SelectItem>
                            <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                            <SelectItem value="COMPLETED">Terminé</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {myTasks.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-lg bg-muted/20">
                    <p className="text-muted-foreground">Aucune tâche trouvée</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myTasks.map((task) => (
                        <Card
                            key={task.id}
                            className="cursor-pointer hover:border-primary/50 transition"
                            onClick={() => router.push(`/chat/organizations/${orgId}/departments/${task.department.id}/tasks/${task.id}`)}
                        >
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-semibold text-foreground line-clamp-1">{task.title}</h3>
                                    <div className={`w-2 h-2 rounded-full shrink-0 mt-2 ${task.priority === 'URGENT' ? 'bg-red-500' :
                                        task.priority === 'HIGH' ? 'bg-orange-500' :
                                            task.priority === 'MEDIUM' ? 'bg-yellow-500' : 'bg-blue-500'
                                        }`} />
                                </div>

                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                                    <Building2 className="w-3 h-3" />
                                    <span className="truncate">{task.department.name}</span>
                                </div>

                                <div className="flex items-center justify-between mt-4">
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Calendar className="w-3 h-3" />
                                        {task.dueDate ? format(new Date(task.dueDate), 'd MMM') : '-'}
                                    </div>
                                    <div className={`text-xs px-2 py-0.5 rounded-full ${task.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                        task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                            'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                        }`}>
                                        {task.status === 'IN_PROGRESS' ? 'En cours' :
                                            task.status === 'COMPLETED' ? 'Terminé' :
                                                task.status === 'PENDING' ? 'À faire' : task.status}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="text-muted-foreground">Chargement...</div>
            </div>
        );
    }

    if (!org) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="text-muted-foreground">Organisation non trouvée</div>
            </div>
        );
    }

    const getPlanColor = (plan: string) => {
        return 'bg-primary text-primary-foreground';
    };

    const canCreateDepartment = org.subscription
        ? org._count.departments < org.subscription.maxDepartments
        : false;

    // Vue pour les membres simples (non-admin)
    if (!isAdmin) {
        return (
            <div className="p-4 space-y-6 mt-15 bg-background min-h-screen">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/chat/organizations')}
                            className="hover:bg-muted"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>

                        {org.logo ? (
                            <img
                                src={org.logo}
                                alt={org.name}
                                className="w-12 h-12 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                <Building2 className="w-6 h-6 text-muted-foreground" />
                            </div>
                        )}

                        <div>
                            <h1 className="text-2xl font-bold text-foreground">
                                {org.name}
                            </h1>
                            <p className="text-sm text-muted-foreground">Code: {org.code}</p>
                        </div>
                    </div>
                </div>

                {/* My Departments Section */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground">Mes Départements</h2>

                    {userDepartments.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                            <p className="text-muted-foreground">Vous n'êtes membre d'aucun département</p>
                            <p className="text-sm text-muted-foreground">Contactez un administrateur pour être ajouté</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {userDepartments.map((userDept) => (
                                <Card
                                    key={userDept.id}
                                    className="bg-card border-border hover:border-primary/50 transition"
                                >
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <Avatar className="h-10 w-10 border border-border">
                                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${userDept.department.name}`} />
                                                <AvatarFallback>{userDept.department.name[0]}</AvatarFallback>
                                            </Avatar>
                                        </div>
                                        <CardTitle className="text-lg text-foreground mt-2">
                                            {userDept.department.name}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Membres</span>
                                            <span className="text-foreground">
                                                {userDept.department._count.members}
                                            </span>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                                                onClick={() => router.push(`/chat/organizations/${orgId}/departments/${userDept.department.id}/chat`)}
                                            >
                                                <MessageSquare className="w-4 h-4 mr-2" />
                                                Ouvrir le chat
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => handleLeaveDepartment(userDept.id, userDept.department.name)}
                                            >
                                                <LogOut className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* My Tasks Section */}
                {renderMyTasks()}
            </div>
        );
    }

    // Vue pour les administrateurs (code existant)
    return (
        <div className="p-4 space-y-6 mt-15 bg-background min-h-screen">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/chat/organizations')}
                        className="hover:bg-muted"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>

                    {org.logo ? (
                        <img
                            src={org.logo}
                            alt={org.name}
                            className="w-12 h-12 rounded-full object-cover"
                        />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-muted-foreground" />
                        </div>
                    )}

                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {org.name}
                        </h1>
                        <p className="text-sm text-muted-foreground">Code: {org.code}</p>
                    </div>
                </div>

                {org.subscription && (
                    <span
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold ${getPlanColor(
                            org.subscription.plan
                        )}`}
                    >
                        {org.subscription.plan}
                    </span>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-card border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Départements</p>
                                <p className="text-2xl font-bold text-foreground">
                                    {org._count.departments} / {org.subscription?.maxDepartments || '∞'}
                                </p>
                            </div>
                            <Building2 className="w-8 h-8 text-primary" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Membres</p>
                                <p className="text-2xl font-bold text-foreground">{org._count.members}</p>
                            </div>
                            <Users className="w-8 h-8 text-primary" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Événements</p>
                                <p className="text-2xl font-bold text-foreground">{org._count.events}</p>
                            </div>
                            <Calendar className="w-8 h-8 text-primary" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Departments Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-foreground">Départements</h2>
                    <Button
                        size="sm"
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={handleCreateDepartment}
                        disabled={!canCreateDepartment}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nouveau Département
                    </Button>
                </div>

                {!canCreateDepartment && org.subscription && (
                    <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3 text-sm text-destructive">
                        Limite de départements atteinte ({org.subscription.maxDepartments}). Mettez à niveau votre plan pour créer plus de départements.
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {departments.map((dept) => (
                        <Card
                            key={dept.id}
                            className="bg-card border-border hover:border-primary/50 transition cursor-pointer group"
                            onClick={() => router.push(`/chat/organizations/${orgId}/departments/${dept.id}`)}
                        >
                            <CardHeader className="relative">
                                <CardTitle className="text-lg text-foreground pr-16">{dept.name}</CardTitle>
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => openEditDialog(dept)}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => handleDeleteDepartment(dept.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Membres</span>
                                    <span className="text-foreground">
                                        {dept._count.members} / {org.subscription?.maxMembersPerDept || '∞'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Conversations</span>
                                    <span className="text-foreground">{dept._count.conversations}</span>
                                </div>
                                <Button
                                    className="w-full mt-2"
                                    variant="secondary"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/chat/organizations/${orgId}/departments/${dept.id}`);
                                    }}
                                >
                                    Gérer les membres
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {departments.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                        <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Aucun département</p>
                        <p className="text-sm text-muted-foreground mb-4">Créez votre premier département pour commencer</p>
                        <Button
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={handleCreateDepartment}
                            disabled={!canCreateDepartment}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Créer un Département
                        </Button>
                    </div>
                )}
            </div>

            {/* My Tasks Section for Admins */}
            {renderMyTasks()}

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card
                    className="bg-card border-border hover:border-primary/50 transition cursor-pointer"
                    onClick={() => router.push(`/chat/organizations/${orgId}/events`)}
                >
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                                <Calendar className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground">Gérer les Événements</h3>
                                <p className="text-sm text-muted-foreground">Créer et gérer les invitations</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border-border hover:border-border/80 transition cursor-pointer opacity-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                <Settings className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground">Paramètres</h3>
                                <p className="text-sm text-muted-foreground">Gérer l'organisation</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            {/* Edit Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifier le département</DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                        <Label>Nom du département</Label>
                        <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsEditOpen(false)}>Annuler</Button>
                        <Button onClick={handleUpdateDepartment}>Enregistrer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
