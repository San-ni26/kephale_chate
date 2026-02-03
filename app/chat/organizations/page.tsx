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
                return <Clock className="w-4 h-4 text-muted-foreground" />;
            case 'APPROVED':
                return <CheckCircle className="w-4 h-4 text-foreground" />;
            case 'REJECTED':
                return <XCircle className="w-4 h-4 text-destructive" />;
            case 'COMPLETED':
                return <CheckCircle className="w-4 h-4 text-muted-foreground" />;
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
        // Mono-chromatic badges
        switch (plan) {
            case 'FREE':
                return 'bg-muted text-muted-foreground border border-border';
            case 'BASIC':
                return 'bg-muted-foreground text-background';
            case 'PROFESSIONAL':
                return 'bg-secondary text-secondary-foreground border border-border';
            case 'ENTERPRISE':
                return 'bg-foreground text-background';
            default:
                return 'bg-muted text-muted-foreground';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="text-muted-foreground">Chargement...</div>
            </div>
        );
    }

    return (
        <div className="p-5 space-y-6 bg-background min-h-screen mt-15">
            {/* Header removed as it is now in TopNav */}

            {/* Pending/Approved Requests */}
            {requests.filter(r => r.status !== 'COMPLETED').length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground px-2">Demandes</h3>
                    {requests
                        .filter(r => r.status !== 'COMPLETED')
                        .map((request) => (
                            <Card
                                key={request.id}
                                className="bg-card border-border hover:border-foreground/50 transition"
                            >
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {getStatusIcon(request.status)}
                                            <div>
                                                <p className="text-sm font-medium text-card-foreground">
                                                    Code: {request.cardCode}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {getStatusText(request.status)}
                                                </p>
                                            </div>
                                        </div>
                                        {request.status === 'APPROVED' && (
                                            <Button
                                                size="sm"
                                                className="bg-primary text-primary-foreground hover:bg-primary/90"
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
                    <h3 className="text-sm font-semibold text-muted-foreground px-2">Mes Organisations</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {orgs.map((org) => (
                            <Card
                                key={org.id}
                                className="bg-card border-border hover:border-foreground transition cursor-pointer"
                                onClick={() => router.push(`/chat/organizations/${org.id}`)}
                            >
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div className="flex items-center gap-3">
                                        {org.logo ? (
                                            <img
                                                src={org.logo}
                                                alt={org.name}
                                                className="w-10 h-10 rounded-full object-cover border border-border"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border">
                                                <Building2 className="w-5 h-5 text-muted-foreground" />
                                            </div>
                                        )}
                                        <div>
                                            <CardTitle className="text-lg font-medium text-card-foreground">{org.name}</CardTitle>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                                {org.members[0]?.role}
                                            </p>
                                        </div>
                                    </div>
                                    {org.subscription && (
                                        <span
                                            className={`px-2 py-1 rounded text-xs font-semibold ${getPlanBadgeColor(
                                                org.subscription.plan
                                            )}`}
                                        >
                                            {org.subscription.plan}
                                        </span>
                                    )}
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Départements</span>
                                        <span className="text-foreground">
                                            {org._count.departments} / {org.subscription?.maxDepartments || '∞'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Membres</span>
                                        <span className="text-foreground">{org._count.members}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Événements</span>
                                        <span className="text-foreground">{org._count.events}</span>
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button
                                        variant="ghost"
                                        className="w-full text-muted-foreground hover:text-foreground hover:bg-muted justify-between group"
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
                    <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                        Aucune organisation
                    </h3>
                    <p className="text-muted-foreground mb-4">
                        Créez votre première organisation pour commencer
                    </p>
                    <Button
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
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
