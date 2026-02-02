"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, ArrowRight, Clock, CheckCircle, XCircle, Building2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/src/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { toast } from "sonner";
import OrganizationRequestDialog from "@/src/components/organizations/OrganizationRequestDialog";
import OrganizationCompletionWizard from "@/src/components/organizations/OrganizationCompletionWizard";

interface Organization {
    id: string;
    name: string;
    logo?: string;
    address?: string;
    members: Array<{ role: string }>;
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

interface OrgRequest {
    id: string;
    cardCode: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
    createdAt: string;
    reviewedAt?: string;
}

export default function OrganizationsPage() {
    const router = useRouter();
    const [orgs, setOrgs] = useState<Organization[]>([]);
    const [requests, setRequests] = useState<OrgRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showRequestDialog, setShowRequestDialog] = useState(false);
    const [showCompletionWizard, setShowCompletionWizard] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<OrgRequest | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            // Fetch organizations
            const orgsRes = await fetch('/api/organizations');
            if (orgsRes.ok) {
                const data = await orgsRes.json();
                setOrgs(data.organizations || []);
            }

            // Fetch requests
            const reqsRes = await fetch('/api/organizations/requests');
            if (reqsRes.ok) {
                const data = await reqsRes.json();
                setRequests(data.requests || []);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Erreur lors du chargement des données');
        } finally {
            setLoading(false);
        }
    };

    const handleRequestSuccess = () => {
        setShowRequestDialog(false);
        fetchData();
    };

    const handleCompletionSuccess = () => {
        setShowCompletionWizard(false);
        setSelectedRequest(null);
        fetchData();
    };

    const handleCompleteRequest = (request: OrgRequest) => {
        setSelectedRequest(request);
        setShowCompletionWizard(true);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'PENDING':
                return <Clock className="w-4 h-4 text-yellow-500" />;
            case 'APPROVED':
                return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'REJECTED':
                return <XCircle className="w-4 h-4 text-red-500" />;
            case 'COMPLETED':
                return <CheckCircle className="w-4 h-4 text-blue-500" />;
            default:
                return null;
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'PENDING':
                return 'En attente';
            case 'APPROVED':
                return 'Approuvée';
            case 'REJECTED':
                return 'Rejetée';
            case 'COMPLETED':
                return 'Complétée';
            default:
                return status;
        }
    };

    const getPlanBadgeColor = (plan: string) => {
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-slate-400">Chargement...</div>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            <div className="flex justify-between items-center px-2">
                <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Organisations
                </h2>

                <Button
                    size="icon"
                    className="rounded-full bg-purple-600 hover:bg-purple-700"
                    onClick={() => setShowRequestDialog(true)}
                >
                    <Plus />
                </Button>
            </div>

            {/* Pending/Approved Requests */}
            {requests.filter(r => r.status !== 'COMPLETED').length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-400 px-2">Demandes</h3>
                    {requests
                        .filter(r => r.status !== 'COMPLETED')
                        .map((request) => (
                            <Card
                                key={request.id}
                                className="bg-slate-900 border-slate-800 hover:border-slate-700 transition"
                            >
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {getStatusIcon(request.status)}
                                            <div>
                                                <p className="text-sm font-medium">
                                                    Code: {request.cardCode}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    {getStatusText(request.status)}
                                                </p>
                                            </div>
                                        </div>
                                        {request.status === 'APPROVED' && (
                                            <Button
                                                size="sm"
                                                className="bg-purple-600 hover:bg-purple-700"
                                                onClick={() => handleCompleteRequest(request)}
                                            >
                                                Compléter
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                </div>
            )}

            {/* Organizations */}
            {orgs.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-400 px-2">Mes Organisations</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {orgs.map((org) => (
                            <Card
                                key={org.id}
                                className="bg-slate-900 border-slate-800 hover:border-purple-500/50 transition cursor-pointer"
                                onClick={() => router.push(`/chat/organizations/${org.id}`)}
                            >
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div className="flex items-center gap-3">
                                        {org.logo ? (
                                            <img
                                                src={org.logo}
                                                alt={org.name}
                                                className="w-10 h-10 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center">
                                                <Building2 className="w-5 h-5 text-purple-400" />
                                            </div>
                                        )}
                                        <div>
                                            <CardTitle className="text-lg font-medium">{org.name}</CardTitle>
                                            <p className="text-xs text-slate-400 uppercase tracking-wider">
                                                {org.members[0]?.role}
                                            </p>
                                        </div>
                                    </div>
                                    {org.subscription && (
                                        <span
                                            className={`px-2 py-1 rounded text-xs font-semibold text-white ${getPlanBadgeColor(
                                                org.subscription.plan
                                            )}`}
                                        >
                                            {org.subscription.plan}
                                        </span>
                                    )}
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-400">Départements</span>
                                        <span className="text-slate-200">
                                            {org._count.departments} / {org.subscription?.maxDepartments || '∞'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-400">Membres</span>
                                        <span className="text-slate-200">{org._count.members}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-400">Événements</span>
                                        <span className="text-slate-200">{org._count.events}</span>
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button
                                        variant="ghost"
                                        className="w-full text-slate-300 hover:text-white hover:bg-slate-800 justify-between group"
                                    >
                                        Accéder au Tableau de Bord
                                        <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {orgs.length === 0 && requests.length === 0 && (
                <div className="text-center py-12">
                    <Building2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-300 mb-2">
                        Aucune organisation
                    </h3>
                    <p className="text-slate-400 mb-4">
                        Créez votre première organisation pour commencer
                    </p>
                    <Button
                        className="bg-purple-600 hover:bg-purple-700"
                        onClick={() => setShowRequestDialog(true)}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Créer une Organisation
                    </Button>
                </div>
            )}

            {/* Dialogs */}
            <OrganizationRequestDialog
                open={showRequestDialog}
                onOpenChange={setShowRequestDialog}
                onSuccess={handleRequestSuccess}
            />

            <OrganizationCompletionWizard
                open={showCompletionWizard}
                onOpenChange={setShowCompletionWizard}
                requestId={selectedRequest?.id || ''}
                onSuccess={handleCompletionSuccess}
            />
        </div>
    );
}
