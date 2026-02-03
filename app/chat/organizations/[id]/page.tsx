"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Building2, Users, Calendar, Plus, ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { toast } from "sonner";

interface Organization {
    id: string;
    name: string;
    logo?: string;
    address?: string;
    code: string;
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

export default function OrganizationDashboard() {
    const router = useRouter();
    const params = useParams();
    const orgId = params.id as string;

    const [org, setOrg] = useState<Organization | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (orgId) {
            fetchData();
        }
    }, [orgId]);

    const fetchData = async () => {
        try {
            // Fetch organization details
            const orgRes = await fetch('/api/organizations');
            if (orgRes.ok) {
                const data = await orgRes.json();
                const foundOrg = data.organizations.find((o: Organization) => o.id === orgId);
                if (foundOrg) {
                    setOrg(foundOrg);
                }
            }

            // Fetch departments
            const deptRes = await fetch(`/api/organizations/${orgId}/departments`);
            if (deptRes.ok) {
                const data = await deptRes.json();
                setDepartments(data.departments || []);
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
            const res = await fetch(`/api/organizations/${orgId}/departments`, {
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
        // En thème monochromatique, on peut utiliser des variantes de gris ou juste le primary
        // Mais pour différencier les plans, utilisons des bordures ou des badges simples
        return 'bg-primary text-primary-foreground';
    };

    const canCreateDepartment = org.subscription
        ? org._count.departments < org.subscription.maxDepartments
        : false;

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
                            className="bg-card border-border hover:border-primary/50 transition cursor-pointer"
                        >
                            <CardHeader>
                                <CardTitle className="text-lg text-foreground">{dept.name}</CardTitle>
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
        </div>
    );
}
