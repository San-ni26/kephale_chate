"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Briefcase, MapPin, Clock, Loader2,
    FileText, ArrowRight, RefreshCw, Eye, Trash2,
    Mail, Phone, GraduationCap, DollarSign, Calendar, ExternalLink
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/src/components/ui/dialog";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
import { fetchWithAuth } from "@/src/lib/auth-client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const CONTRACT_LABELS: Record<string, string> = {
    CDI: "CDI", CDD: "CDD", STAGE: "Stage",
    FREELANCE: "Freelance", FULL_TIME: "Temps plein", PART_TIME: "Temps partiel",
};
const WORKMODE_LABELS: Record<string, string> = {
    ONSITE: "Présentiel", REMOTE: "Remote", HYBRID: "Hybride",
};
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    PENDING: { label: "En attente", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    INTERVIEW: { label: "Entretien", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    ACCEPTED: { label: "Accepté", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    REJECTED: { label: "Refusé", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_LABELS[status] || { label: status, color: "bg-muted text-muted-foreground" };
    return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>
            {s.label}
        </span>
    );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-2">
            <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span>
            <div>
                <span className="text-muted-foreground">{label} : </span>
                <span className="break-words">{value}</span>
            </div>
        </div>
    );
}

export default function MyApplicationsPage() {
    const router = useRouter();
    const [viewApp, setViewApp] = useState<any | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
    const [deleting, setDeleting] = useState(false);
    const { data, error, isLoading, mutate } = useSWR("/api/jobs/my-applications", fetcher, {
        revalidateOnFocus: true,
        dedupingInterval: 5000,
    });
    const applications = data?.applications || [];
    const isUnauthorized = error && (error as { status?: number }).status === 401;

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetchWithAuth(`/api/jobs/my-applications/${deleteTarget.id}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                toast.success("Candidature supprimée");
                setDeleteTarget(null);
                mutate();
            } else {
                toast.error(data.error || "Erreur lors de la suppression");
            }
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setDeleting(false);
        }
    };

    if (isUnauthorized) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 mt-16">
                <FileText className="w-16 h-16 text-muted-foreground/30 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Connexion requise</h2>
                <p className="text-muted-foreground text-sm text-center mb-6">
                    Connectez-vous pour voir vos candidatures et leur état.
                </p>
                <Button onClick={() => router.push("/login")}>Se connecter</Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pb-24 mt-16">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold">Mes candidatures</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Suivez l&apos;état de vos candidatures
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : applications.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
                        <Briefcase className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Aucune candidature</h3>
                        <p className="text-muted-foreground text-sm mb-6">
                            {error
                                ? "Impossible de charger vos candidatures. Vérifiez votre connexion."
                                : "Vous n'avez pas encore postulé à une offre."}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            {error && (
                                <Button variant="outline" onClick={() => mutate()} className="gap-2">
                                    <RefreshCw className="w-4 h-4" /> Réessayer
                                </Button>
                            )}
                            <Button onClick={() => router.push("/chat/groups")} className="gap-2">
                                <Briefcase className="w-4 h-4" /> Voir les offres
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                    <div className="space-y-4">
                        {applications.map((app: any) => (
                            <Card
                                key={app.id}
                                className="border-border hover:border-primary/30 transition-all"
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div
                                            className="flex-1 min-w-0 cursor-pointer"
                                            onClick={() => router.push(`/chat/jobs/${app.job?.id}`)}
                                        >
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-bold text-foreground">{app.job?.title}</h3>
                                                <StatusBadge status={app.status} />
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-0.5">{app.job?.companyName}</p>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                                    {CONTRACT_LABELS[app.job?.contractType] || app.job?.contractType}
                                                </span>
                                                <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                                    {WORKMODE_LABELS[app.job?.workMode] || app.job?.workMode}
                                                </span>
                                                {app.job?.location && (
                                                    <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" /> {app.job.location}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Postulé le {format(new Date(app.createdAt), "d MMM yyyy", { locale: fr })}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9"
                                                onClick={(e) => { e.stopPropagation(); setViewApp(app); }}
                                                title="Voir mes infos"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 text-destructive hover:text-destructive"
                                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(app); }}
                                                title="Supprimer"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9"
                                                onClick={(e) => { e.stopPropagation(); router.push(`/chat/jobs/${app.job?.id}`); }}
                                                title="Voir l'offre"
                                            >
                                                <ArrowRight className="w-5 h-5" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Dialog : voir les infos envoyées */}
                    <Dialog open={!!viewApp} onOpenChange={() => setViewApp(null)}>
                        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>
                                    {viewApp?.job?.title} — Infos envoyées
                                </DialogTitle>
                            </DialogHeader>
                            {viewApp && (
                                <div className="space-y-4 text-sm">
                                    <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={viewApp.email} />
                                    <InfoRow icon={<FileText className="w-4 h-4" />} label="Nom" value={viewApp.fullName} />
                                    <InfoRow icon={<Phone className="w-4 h-4" />} label="Téléphone" value={viewApp.phone} />
                                    <InfoRow icon={<MapPin className="w-4 h-4" />} label="Adresse" value={viewApp.address} />
                                    <InfoRow icon={<GraduationCap className="w-4 h-4" />} label="Niveau d'étude" value={viewApp.educationLevel} />
                                    <InfoRow icon={<Briefcase className="w-4 h-4" />} label="Expérience" value={viewApp.experience} />
                                    <InfoRow icon={<DollarSign className="w-4 h-4" />} label="Salaire souhaité" value={viewApp.desiredSalary} />
                                    <InfoRow icon={<Calendar className="w-4 h-4" />} label="Disponibilité" value={viewApp.availability} />
                                    {viewApp.portfolioUrl && (
                                        <div className="flex items-center gap-2">
                                            <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground" />
                                            <span className="text-muted-foreground">Portfolio :</span>
                                            <a href={viewApp.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                                                {viewApp.portfolioUrl}
                                            </a>
                                        </div>
                                    )}
                                    {(viewApp.hasCv || viewApp.hasCoverLetter || viewApp.hasPhoto || viewApp.hasPortfolio) && (
                                        <div className="pt-2 border-t">
                                            <p className="text-muted-foreground mb-2">Fichiers joints :</p>
                                            <div className="flex flex-wrap gap-2">
                                                {viewApp.hasPhoto && <span className="text-xs px-2 py-1 bg-muted rounded">Photo</span>}
                                                {viewApp.hasCv && <span className="text-xs px-2 py-1 bg-muted rounded">CV</span>}
                                                {viewApp.hasCoverLetter && <span className="text-xs px-2 py-1 bg-muted rounded">Lettre de motivation</span>}
                                                {viewApp.hasPortfolio && <span className="text-xs px-2 py-1 bg-muted rounded">Portfolio</span>}
                                            </div>
                                        </div>
                                    )}
                                    {viewApp.customAnswers && typeof viewApp.customAnswers === "object" && Object.keys(viewApp.customAnswers).length > 0 && (
                                        <div className="pt-2 border-t">
                                            <p className="text-muted-foreground mb-2">Réponses personnalisées :</p>
                                            <div className="space-y-1">
                                                {Object.entries(viewApp.customAnswers).map(([k, v]: [string, any]) => (
                                                    <div key={k}>
                                                        <span className="text-muted-foreground">{k} :</span>{" "}
                                                        <span>{String(v)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {viewApp.socialLinks && typeof viewApp.socialLinks === "object" && (
                                        <div className="pt-2 border-t">
                                            <p className="text-muted-foreground mb-2">Réseaux :</p>
                                            <div className="flex flex-wrap gap-2">
                                                {viewApp.socialLinks.linkedin && (
                                                    <a href={viewApp.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                                                        LinkedIn
                                                    </a>
                                                )}
                                                {viewApp.socialLinks.github && (
                                                    <a href={viewApp.socialLinks.github} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                                                        GitHub
                                                    </a>
                                                )}
                                                {viewApp.socialLinks.twitter && (
                                                    <a href={viewApp.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                                                        Twitter
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>

                    {/* Dialog : confirmer suppression */}
                    <Dialog open={!!deleteTarget} onOpenChange={() => !deleting && setDeleteTarget(null)}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Supprimer la candidature ?</DialogTitle>
                            </DialogHeader>
                            <p className="text-sm text-muted-foreground">
                                Êtes-vous sûr de vouloir supprimer votre candidature pour <strong>{deleteTarget?.job?.title}</strong> chez {deleteTarget?.job?.companyName} ? Cette action est irréversible.
                            </p>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                                    Annuler
                                </Button>
                                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    {deleting ? " Suppression..." : " Supprimer"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    </>
                )}
            </div>
        </div>
    );
}
