"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Building2, Users, Calendar, Plus, ArrowLeft, Settings, MessageSquare, LogOut, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { toast } from "sonner";
import { fetchWithAuth, getUser } from "@/src/lib/auth-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

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

export default function OrganizationDashboard() {
    const router = useRouter();
    const params = useParams();
    const orgId = params?.id as string;
    const currentUser = getUser();

    const [org, setOrg] = useState<Organization | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [userDepartments, setUserDepartments] = useState<UserDepartment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    // Edit Department State
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
    const [editName, setEditName] = useState("");

    useEffect(() => {
        if (orgId) {
            fetchData();
        }
    }, [orgId]);

    const fetchData = async () => {
        try {
            // Fetch organization details
            const orgRes = await fetchWithAuth(`/api/organizations/${orgId}`);
            if (orgRes.ok) {
                const data = await orgRes.json();
                setOrg(data.organization);

                // Check if user is admin/owner
                const isOwnerOrAdmin = data.organization.ownerId === currentUser?.id ||
                    data.userRole === 'ADMIN' ||
                    data.userRole === 'OWNER';
                setIsAdmin(isOwnerOrAdmin);

                if (isOwnerOrAdmin) {
                    // Fetch all departments for admin
                    const deptRes = await fetchWithAuth(`/api/organizations/${orgId}/departments`);
                    if (deptRes.ok) {
                        const data = await deptRes.json();
                        setDepartments(data.departments || []);
                    }
                } else {
                    // Fetch only user's departments for regular members
                    const userDeptRes = await fetchWithAuth(`/api/organizations/${orgId}/user-departments`);
                    if (userDeptRes.ok) {
                        const data = await userDeptRes.json();
                        setUserDepartments(data.departments || []);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Erreur lors du chargement des données');
        } finally {
            setLoading(false);
        }
    };

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
            fetchData();
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
                fetchData();
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
                fetchData();
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
                fetchData();
            } else {
                toast.error('Erreur lors de la modification');
            }
        } catch (error) {
            console.error('Error updating department:', error);
            toast.error('Erreur serveur');
        }
    };

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
