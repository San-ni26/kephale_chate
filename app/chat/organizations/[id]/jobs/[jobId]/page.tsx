"use client";

import { useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
    User, Phone, Mail, MapPin, Globe, GraduationCap,
    Briefcase, FileText, Download, Clock, CheckCircle2, XCircle,
    MessageSquare, Loader2, Eye, StickyNote
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Textarea } from "@/src/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/src/components/ui/dialog";
import { toast } from "sonner";
import { fetchWithAuth } from "@/src/lib/auth-client";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const APPLICATION_STATUSES = [
    { value: "PENDING", label: "En attente", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    { value: "INTERVIEW", label: "Entretien", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    { value: "ACCEPTED", label: "Accepté", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    { value: "REJECTED", label: "Refusé", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
];

function StatusBadge({ status }: { status: string }) {
    const s = APPLICATION_STATUSES.find(x => x.value === status);
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s?.color || "bg-muted text-muted-foreground"}`}>{s?.label || status}</span>;
}

function DownloadButton({ data, filename }: { data?: string | null; filename: string }) {
    if (!data) return null;
    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = data;
        link.download = filename;
        link.click();
    };
    return (
        <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={handleDownload}>
            <Download className="w-3 h-3" /> {filename}
        </Button>
    );
}

export default function JobApplicationsPage() {
    const router = useRouter();
    const params = useParams();
    const orgId = params?.id as string;
    const jobId = params?.jobId as string;

    const searchParams = useSearchParams();
    const statusFilter = searchParams?.get("status") || "ALL";
    const [selectedApp, setSelectedApp] = useState<any>(null);
    const [noteText, setNoteText] = useState("");
    const [updatingAppId, setUpdatingAppId] = useState<string | null>(null);

    const url = `/api/organizations/${orgId}/jobs/${jobId}/applications${statusFilter !== "ALL" ? `?status=${statusFilter}` : ""}`;
    const { data, mutate, isLoading } = useSWR(url, fetcher);
    const applications = data?.applications || [];
    const job = data?.job;

    const handleUpdateApplication = async (appId: string, updates: { status?: string; internalNote?: string }) => {
        setUpdatingAppId(appId);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/jobs/${jobId}/applications/${appId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updates),
                }
            );
            if (res.ok) {
                toast.success("Candidature mise à jour");
                mutate();
                if (selectedApp?.id === appId) {
                    const updated = await res.json();
                    setSelectedApp(updated.application);
                }
            } else {
                const e = await res.json(); toast.error(e.error || "Erreur");
            }
        } catch { toast.error("Erreur serveur"); }
        finally { setUpdatingAppId(null); }
    };

    const handleSaveNote = async () => {
        if (!selectedApp) return;
        await handleUpdateApplication(selectedApp.id, { internalNote: noteText });
    };

    const openApplication = (app: any) => {
        setSelectedApp(app);
        setNoteText(app.internalNote || "");
    };

    const stats = {
        total: applications.length,
        pending: applications.filter((a: any) => a.status === "PENDING").length,
        accepted: applications.filter((a: any) => a.status === "ACCEPTED").length,
        rejected: applications.filter((a: any) => a.status === "REJECTED").length,
    };

    return (
        <div className="min-h-screen bg-background pb-20 md:pb-8 mt-28 md:mt-28">
            <div className="max-w-5xl mx-auto px-4 py-6 space-y-4 ">
                {/* Mini stats */}
                <div className="grid grid-cols-4 gap-2">
                    {[
                        { label: "Total", value: stats.total, icon: "" },
                        { label: "En attente", value: stats.pending, icon: "" },
                        { label: "Acceptés", value: stats.accepted, icon: "" },
                        { label: "Refusés", value: stats.rejected, icon: "" },
                    ].map(s => (
                        <div key={s.label} className="text-center p-3 bg-card border border-border rounded-xl">
                            <div className="text-xl">{s.icon}</div>
                            <div className="text-xl font-bold">{s.value}</div>
                            <div className="text-xs text-muted-foreground">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Liste des candidatures */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : applications.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
                        <User className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Aucune candidature</h3>
                        <p className="text-muted-foreground text-sm">
                            {statusFilter !== "ALL" ? "Aucune candidature avec ce statut" : "Aucune candidature reçue pour cette offre"}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {applications.map((app: any) => (
                            <Card key={app.id} className="border-border hover:border-primary/30 transition-all cursor-pointer" onClick={() => openApplication(app)}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            {app.photoData ? (
                                                <img src={app.photoData} alt={app.fullName} className="w-10 h-10 rounded-full object-cover border border-border" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                                                    {(app.fullName || app.email)[0]?.toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-semibold text-sm">{app.fullName || "Candidat"}</p>
                                                    <StatusBadge status={app.status} />
                                                </div>
                                                <p className="text-xs text-muted-foreground">{app.email}</p>
                                                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                                    {app.educationLevel && <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" />{app.educationLevel}</span>}
                                                    {app.desiredSalary && <span>💰 {app.desiredSalary}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-muted-foreground">
                                                {format(new Date(app.createdAt), 'd MMM', { locale: fr })}
                                            </p>
                                            <div className="flex gap-1 mt-1 justify-end">
                                                {app.cvData && <span title="CV" className="text-xs">📄</span>}
                                                {app.coverLetterData && <span title="Lettre" className="text-xs">✉️</span>}
                                                {app.internalNote && <span title="Note" className="text-xs">📝</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions rapides statut */}
                                    <div className="flex gap-1 mt-3 pt-3 border-t border-border" onClick={e => e.stopPropagation()}>
                                        {APPLICATION_STATUSES.map(s => (
                                            <button
                                                key={s.value}
                                                disabled={app.status === s.value || updatingAppId === app.id}
                                                onClick={() => handleUpdateApplication(app.id, { status: s.value })}
                                                className={`text-xs px-2 py-1 rounded-lg transition-all ${app.status === s.value
                                                    ? s.color + " font-medium"
                                                    : "text-muted-foreground hover:bg-muted"
                                                    }`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Dialog détail candidature */}
            <Dialog open={!!selectedApp} onOpenChange={open => !open && setSelectedApp(null)}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    {selectedApp && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-3">
                                    {selectedApp.photoData ? (
                                        <img src={selectedApp.photoData} alt="photo" className="w-10 h-10 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                            {(selectedApp.fullName || selectedApp.email)[0]?.toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <div>{selectedApp.fullName || "Candidat"}</div>
                                        <p className="text-sm font-normal text-muted-foreground">{selectedApp.email}</p>
                                    </div>
                                </DialogTitle>
                            </DialogHeader>

                            <div className="space-y-4">
                                {/* Statut */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-muted-foreground">Statut :</span>
                                    {APPLICATION_STATUSES.map(s => (
                                        <button
                                            key={s.value}
                                            disabled={selectedApp.status === s.value || !!updatingAppId}
                                            onClick={() => handleUpdateApplication(selectedApp.id, { status: s.value })}
                                            className={`text-xs px-3 py-1.5 rounded-lg transition-all border font-medium ${selectedApp.status === s.value
                                                ? s.color + " border-transparent"
                                                : "border-border text-muted-foreground hover:bg-muted"
                                                }`}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Infos candidat */}
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    {selectedApp.phone && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Phone className="w-4 h-4 shrink-0" />
                                            <span>{selectedApp.phone}</span>
                                        </div>
                                    )}
                                    {selectedApp.address && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <MapPin className="w-4 h-4 shrink-0" />
                                            <span>{selectedApp.address}</span>
                                        </div>
                                    )}
                                    {selectedApp.educationLevel && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <GraduationCap className="w-4 h-4 shrink-0" />
                                            <span>{selectedApp.educationLevel}</span>
                                        </div>
                                    )}
                                    {selectedApp.desiredSalary && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <span>💰 Salaire souhaité : {selectedApp.desiredSalary}</span>
                                        </div>
                                    )}
                                    {selectedApp.availability && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Clock className="w-4 h-4 shrink-0" />
                                            <span>Disponibilité : {selectedApp.availability}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Expérience */}
                                {selectedApp.experience && (
                                    <div>
                                        <h4 className="font-semibold text-sm mb-1">Expérience</h4>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedApp.experience}</p>
                                    </div>
                                )}

                                {/* Réseaux sociaux */}
                                {selectedApp.socialLinks && Object.keys(selectedApp.socialLinks).length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-sm mb-2">Réseaux sociaux</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(selectedApp.socialLinks).map(([key, val]) => (
                                                val ? (
                                                    <a key={key} href={val as string} target="_blank" rel="noopener noreferrer"
                                                        className="text-xs px-2 py-1 bg-muted rounded-lg text-primary hover:underline flex items-center gap-1">
                                                        <Globe className="w-3 h-3" /> {key}
                                                    </a>
                                                ) : null
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Documents */}
                                <div>
                                    <h4 className="font-semibold text-sm mb-2">Documents</h4>
                                    <div className="flex flex-wrap gap-2">
                                        <DownloadButton data={selectedApp.cvData} filename="CV.pdf" />
                                        <DownloadButton data={selectedApp.coverLetterData} filename="Lettre_de_motivation.pdf" />
                                        <DownloadButton data={selectedApp.portfolioData} filename="Portfolio" />
                                        {selectedApp.portfolioUrl && (
                                            <a href={selectedApp.portfolioUrl} target="_blank" rel="noopener noreferrer">
                                                <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
                                                    <Globe className="w-3 h-3" /> Portfolio URL
                                                </Button>
                                            </a>
                                        )}
                                    </div>
                                    {!selectedApp.cvData && !selectedApp.coverLetterData && !selectedApp.portfolioData && !selectedApp.portfolioUrl && (
                                        <p className="text-xs text-muted-foreground">Aucun document fourni</p>
                                    )}
                                </div>

                                {/* Questions personnalisées */}
                                {selectedApp.customAnswers && Object.keys(selectedApp.customAnswers).length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-sm mb-2">Réponses aux questions</h4>
                                        <div className="space-y-2">
                                            {Object.entries(selectedApp.customAnswers).map(([q, a]: any) => (
                                                <div key={q} className="p-3 bg-muted/50 rounded-lg">
                                                    <p className="text-xs font-medium text-muted-foreground mb-1">{q}</p>
                                                    <p className="text-sm">{String(a)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Note interne */}
                                <div>
                                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
                                        <StickyNote className="w-4 h-4" /> Note interne
                                    </h4>
                                    <Textarea
                                        value={noteText}
                                        onChange={e => setNoteText(e.target.value)}
                                        placeholder="Ajouter une note interne sur ce candidat..."
                                        rows={3}
                                        className="text-sm"
                                    />
                                    <div className="flex justify-end mt-2">
                                        <Button size="sm" onClick={handleSaveNote} disabled={!!updatingAppId} className="gap-1">
                                            {updatingAppId === selectedApp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                            Enregistrer la note
                                        </Button>
                                    </div>
                                </div>

                                {/* Contact candidat */}
                                <div className="pt-3 border-t border-border flex gap-2">
                                    <a href={`mailto:${selectedApp.email}`} className="flex-1">
                                        <Button variant="outline" className="w-full gap-2">
                                            <Mail className="w-4 h-4" /> Contacter par email
                                        </Button>
                                    </a>
                                    {selectedApp.phone && (
                                        <a href={`tel:${selectedApp.phone}`} className="flex-1">
                                            <Button variant="outline" className="w-full gap-2">
                                                <Phone className="w-4 h-4" /> Appeler
                                            </Button>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
