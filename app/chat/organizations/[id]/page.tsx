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
            <div className="flex items-center justify-center h-screen">
                <div className="text-slate-400">Chargement...</div>
            </div>
        );
    }

    if (!org) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-slate-400">Organisation non trouvée</div>
            </div>
        );
    }

    const getPlanColor = (plan: string) => {
        switch (plan) {
            case 'FREE':
                return 'bg-slate-600';
            case 'BASIC':
                return 'bg-blue-600';
            case 'PROFESSIONAL':
                return 'bg-purple-600';
            case 'ENTERPRISE':
                return 'bg-gradient-to-r from-purple-600 to-pink-600';
            default:
                return 'bg-slate-600';
        }
    };

    const canCreateDepartment = org.subscription
        ? org._count.departments < org.subscription.maxDepartments
        : false;

    return (
        <div className="p-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/chat/organizations')}
                        className="hover:bg-slate-800"
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
                        <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-purple-400" />
                        </div>
                    )}

                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                            {org.name}
                        </h1>
                        <p className="text-sm text-slate-400">Code: {org.code}</p>
                    </div>
                </div>

                {org.subscription && (
                    <span
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold text-white ${getPlanColor(
                            org.subscription.plan
                        )}`}
                    >
                        {org.subscription.plan}
                    </span>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-400">Départements</p>
                                <p className="text-2xl font-bold">
                                    {org._count.departments} / {org.subscription?.maxDepartments || '∞'}
                                </p>
                            </div>
                            <Building2 className="w-8 h-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-400">Membres</p>
                                <p className="text-2xl font-bold">{org._count.members}</p>
                            </div>
                            <Users className="w-8 h-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-400">Événements</p>
                                <p className="text-2xl font-bold">{org._count.events}</p>
                            </div>
                            <Calendar className="w-8 h-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Departments Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Départements</h2>
                    <Button
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                        onClick={handleCreateDepartment}
                        disabled={!canCreateDepartment}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nouveau Département
                    </Button>
                </div>

                {!canCreateDepartment && org.subscription && (
                    <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3 text-sm text-yellow-500">
                        Limite de départements atteinte ({org.subscription.maxDepartments}). Mettez à niveau votre plan pour créer plus de départements.
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {departments.map((dept) => (
                        <Card
                            key={dept.id}
                            className="bg-slate-900 border-slate-800 hover:border-purple-500/50 transition cursor-pointer"
                        >
                            <CardHeader>
                                <CardTitle className="text-lg">{dept.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-400">Membres</span>
                                    <span className="text-slate-200">
                                        {dept._count.members} / {org.subscription?.maxMembersPerDept || '∞'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-400">Conversations</span>
                                    <span className="text-slate-200">{dept._count.conversations}</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {departments.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-lg">
                        <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">Aucun département</p>
                        <p className="text-sm text-slate-500 mb-4">Créez votre premier département pour commencer</p>
                        <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700"
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
                    className="bg-slate-900 border-slate-800 hover:border-purple-500/50 transition cursor-pointer"
                    onClick={() => router.push(`/chat/organizations/${orgId}/events`)}
                >
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center">
                                <Calendar className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Gérer les Événements</h3>
                                <p className="text-sm text-slate-400">Créer et gérer les invitations</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition cursor-pointer opacity-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-slate-600/20 flex items-center justify-center">
                                <Settings className="w-6 h-6 text-slate-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Paramètres</h3>
                                <p className="text-sm text-slate-400">Gérer l'organisation</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
