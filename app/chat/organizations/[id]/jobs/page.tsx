"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
    Plus, Briefcase, Eye, EyeOff, Trash2, Users,
    Clock, CheckCircle2, XCircle, MoreVertical, Loader2, Edit3,
    TrendingUp, FileText, Calendar
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { toast } from "sonner";
import { fetchWithAuth } from "@/src/lib/auth-client";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const CONTRACT_LABELS: Record<string, string> = {
    CDI: "CDI", CDD: "CDD", STAGE: "Stage",
    FREELANCE: "Freelance", FULL_TIME: "Temps plein", PART_TIME: "Temps partiel",
};
const WORKMODE_LABELS: Record<string, string> = {
    ONSITE: "Présentiel", REMOTE: "Remote", HYBRID: "Hybride",
};

function StatusBadge({ status }: { status: string }) {
    if (status === "PUBLISHED") {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Publiée
            </span>
        );
    }
    if (status === "DRAFT") {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                Brouillon
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            Fermée
        </span>
    );
}

export default function OrganizationJobsPage() {
    const router = useRouter();
    const params = useParams();
    const orgId = params?.id as string;

    const { data, mutate, isLoading } = useSWR(
        orgId ? `/api/organizations/${orgId}/jobs` : null,
        fetcher
    );
    const jobs = data?.jobs || [];
    const subscription = data?.subscription;
    const isAdmin = data?.isAdmin ?? false;

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const handleDelete = async (jobId: string, title: string) => {
        if (!confirm(`Supprimer l'offre "${title}" ? Cette action est irréversible.`)) return;
        setDeletingId(jobId);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/jobs/${jobId}`, { method: "DELETE" });
            if (res.ok) { toast.success("Offre supprimée"); mutate(); }
            else { const e = await res.json(); toast.error(e.error || "Erreur"); }
        } catch { toast.error("Erreur serveur"); }
        finally { setDeletingId(null); }
    };

    const handleToggleStatus = async (job: any) => {
        const newStatus = job.status === "PUBLISHED" ? "CLOSED" : "PUBLISHED";
        setTogglingId(job.id);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/jobs/${job.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                toast.success(newStatus === "PUBLISHED" ? "Offre publiée" : "Offre fermée");
                mutate();
            } else {
                const e = await res.json(); toast.error(e.error || "Erreur");
            }
        } catch { toast.error("Erreur serveur"); }
        finally { setTogglingId(null); }
    };

    // Statistiques
    const stats = {
        total: jobs.length,
        published: jobs.filter((j: any) => j.status === "PUBLISHED").length,
        draft: jobs.filter((j: any) => j.status === "DRAFT").length,
        totalApplications: jobs.reduce((acc: number, j: any) => acc + (j._count?.applications || 0), 0),
    };

    const planLimits: Record<string, number> = {
        FREE: 0, BASIC: 3, PROFESSIONAL: 10, ENTERPRISE: 50, RECRUITMENT: 999,
    };
    const jobLimit = subscription ? (planLimits[subscription.plan] ?? subscription.maxJobOffers ?? 0) : 0;
    const canCreate = jobLimit === 999 || jobs.filter((j: any) => j.status !== 'CLOSED').length < jobLimit;

    return (
        <div className="min-h-screen bg-background pb-20 md:pb-8 mt-14 md:mt-16">
            <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
                {/* Stats */}
                {isAdmin && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: "Total offres", value: stats.total, icon: Briefcase, color: "text-primary" },
                            { label: "Publiées", value: stats.published, icon: CheckCircle2, color: "text-green-500" },
                            { label: "Brouillons", value: stats.draft, icon: FileText, color: "text-yellow-500" },
                            { label: "Candidatures", value: stats.totalApplications, icon: Users, color: "text-blue-500" },
                        ].map(stat => (
                            <Card key={stat.label} className="border-border">
                                <CardContent className="p-4 flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${stat.color}`}>
                                        <stat.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{stat.value}</p>
                                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Message abonnement insuffisant */}
                {!isLoading && jobLimit === 0 && isAdmin && (
                    <div className="border border-amber-500/30 bg-amber-500/10 rounded-2xl p-6 text-center space-y-3">
                        <Briefcase className="w-12 h-12 text-amber-500 mx-auto" />
                        <h3 className="font-bold text-lg">Module Recrutement non activé</h3>
                        <p className="text-muted-foreground text-sm">
                            Votre plan actuel ne permet pas de publier des offres d'emploi.<br />
                            Passez au plan <strong>RECRUITMENT</strong>, <strong>PROFESSIONAL</strong> ou supérieur pour activer ce module.
                        </p>
                        <Button onClick={() => router.push(`/chat/organizations/${orgId}`)} variant="outline">
                            Gérer l'abonnement
                        </Button>
                    </div>
                )}

                {/* Liste des offres */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : jobs.length === 0 && jobLimit > 0 ? (
                    <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
                        <Briefcase className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Aucune offre d'emploi</h3>
                        <p className="text-muted-foreground text-sm mb-6">
                            Commencez à attirer des talents en publiant votre première offre
                        </p>
                        {isAdmin && (
                            <Button onClick={() => router.push(`/chat/organizations/${orgId}/jobs/create`)} className="gap-2">
                                <Plus className="w-4 h-4" /> Créer une offre
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {jobs.map((job: any) => (
                            <Card key={job.id} className="border-border hover:border-primary/30 transition-all">
                                <CardContent className="p-4 md:p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            {job.companyLogo ? (
                                                <img src={job.companyLogo} alt={job.companyName}
                                                    className="w-12 h-12 object-cover rounded-xl border border-border shrink-0" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                                    <span className="text-xl font-bold text-primary">{job.companyName?.[0]?.toUpperCase()}</span>
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start gap-2 flex-wrap">
                                                    <h3 className="font-bold text-foreground truncate">{job.title}</h3>
                                                    <StatusBadge status={job.status} />
                                                </div>
                                                <p className="text-sm text-muted-foreground">{job.companyName}</p>
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                                        {CONTRACT_LABELS[job.contractType] || job.contractType}
                                                    </span>
                                                    <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                                        {WORKMODE_LABELS[job.workMode] || job.workMode}
                                                    </span>
                                                    <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                                        📍 {job.location}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Users className="w-3 h-3" />
                                                        {job._count?.applications || 0} candidature{(job._count?.applications || 0) > 1 ? 's' : ''}
                                                    </span>
                                                    {job.deadline && (
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            Avant le {format(new Date(job.deadline), 'd MMM yyyy', { locale: fr })}
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {format(new Date(job.createdAt), 'd MMM', { locale: fr })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        {isAdmin && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                                        {(deletingId === job.id || togglingId === job.id)
                                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                                            : <MoreVertical className="w-4 h-4" />}
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => router.push(`/chat/organizations/${orgId}/jobs/${job.id}`)}>
                                                        <Users className="w-4 h-4 mr-2" /> Voir les candidatures
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => router.push(`/chat/organizations/${orgId}/jobs/${job.id}/edit`)}>
                                                        <Edit3 className="w-4 h-4 mr-2" /> Modifier
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleToggleStatus(job)}>
                                                        {job.status === "PUBLISHED"
                                                            ? <><EyeOff className="w-4 h-4 mr-2" /> Fermer l'offre</>
                                                            : <><Eye className="w-4 h-4 mr-2" /> Publier</>}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:text-destructive"
                                                        onClick={() => handleDelete(job.id, job.title)}
                                                    >
                                                        <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                    </div>

                                    {/* Actions rapides */}
                                    {isAdmin && (
                                        <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                                            <Button
                                                size="sm" variant="outline" className="gap-1 h-8 text-xs flex-1"
                                                onClick={() => router.push(`/chat/organizations/${orgId}/jobs/${job.id}`)}
                                            >
                                                <Users className="w-3 h-3" />
                                                {job._count?.applications || 0} candidature{(job._count?.applications || 0) > 1 ? 's' : ''}
                                            </Button>
                                            {job.status === "DRAFT" && (
                                                <Button
                                                    size="sm" variant="default" className="gap-1 h-8 text-xs flex-1"
                                                    onClick={() => handleToggleStatus(job)}
                                                    disabled={togglingId === job.id}
                                                >
                                                    <Eye className="w-3 h-3" /> Publier
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
