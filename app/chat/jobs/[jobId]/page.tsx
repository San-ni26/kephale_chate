"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
    MapPin, Briefcase, Clock, Users, Globe, Phone, Mail,
    Upload, CheckCircle2, Loader2, ChevronRight, Building2, Calendar,
    GraduationCap, Star, Send
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { toast } from "sonner";
import { fetcher } from "@/src/lib/fetcher";
import useSWR from "swr";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const CONTRACT_LABELS: Record<string, string> = {
    CDI: "CDI", CDD: "CDD", STAGE: "Stage",
    FREELANCE: "Freelance", FULL_TIME: "Temps plein", PART_TIME: "Temps partiel",
};
const WORKMODE_LABELS: Record<string, string> = {
    ONSITE: "Présentiel", REMOTE: "Remote", HYBRID: "Hybride",
};
const WORKMODE_COLORS: Record<string, string> = {
    ONSITE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    REMOTE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    HYBRID: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const FIELD_LABELS: Record<string, string> = {
    fullName: "Nom complet",
    phone: "Téléphone",
    address: "Adresse",
    photoData: "Photo de profil",
    cvData: "Curriculum Vitae (CV)",
    coverLetterData: "Lettre de motivation",
    portfolioUrl: "Portfolio (lien URL)",
    portfolioData: "Portfolio (fichier)",
    educationLevel: "Niveau d'étude",
    experience: "Expérience professionnelle",
    socialLinks: "Réseaux sociaux",
    desiredSalary: "Salaire souhaité",
    availability: "Disponibilité",
};

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function UploadField({ label, required, onChange, accept, fieldKey }: {
    label: string; required: boolean; onChange: (val: string) => void;
    accept?: string; fieldKey: string;
}) {
    const [fileName, setFileName] = useState("");
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast.error("Fichier trop volumineux (max 5 Mo)"); return; }
        setUploading(true);
        try {
            const base64 = await fileToBase64(file);
            onChange(base64);
            setFileName(file.name);
        } catch { toast.error("Erreur lors de la lecture du fichier"); }
        finally { setUploading(false); }
    };

    return (
        <div>
            <Label className="flex items-center gap-1">
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            <div className="mt-1">
                <input ref={inputRef} type="file" accept={accept} onChange={handleFile} className="hidden" />
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className={`w-full border-2 border-dashed rounded-xl p-4 text-center transition-all hover:border-primary/50 ${fileName ? "border-primary/50 bg-primary/5" : "border-border"
                        }`}
                >
                    {uploading ? (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Chargement...</span>
                        </div>
                    ) : fileName ? (
                        <div className="flex items-center justify-center gap-2 text-primary">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-sm font-medium truncate">{fileName}</span>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Upload className="w-4 h-4" />
                            <span className="text-sm">Cliquer pour ajouter {label.toLowerCase()}</span>
                        </div>
                    )}
                </button>
            </div>
        </div>
    );
}

export default function JobDetailPage() {
    const router = useRouter();
    const params = useParams();
    const jobId = params?.jobId as string;

    const { data, isLoading } = useSWR(jobId ? `/api/jobs/${jobId}` : null, fetcher);
    const job = data?.job;

    const [showForm, setShowForm] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formStep, setFormStep] = useState(0);

    const { data: myAppData } = useSWR<{ application: any }>(
        showForm && jobId ? `/api/jobs/${jobId}/my-application` : null,
        fetcher
    );
    const myApplication = myAppData?.application;

    useEffect(() => {
        const handler = (e: CustomEvent<{ jobId: string }>) => {
            if (e.detail?.jobId === jobId) setShowForm(true);
        };
        window.addEventListener('job-apply-open', handler as EventListener);
        return () => window.removeEventListener('job-apply-open', handler as EventListener);
    }, [jobId]);

    // Form state
    const [formData, setFormData] = useState<Record<string, any>>({
        fullName: "", email: "", phone: "", address: "",
        photoData: "", cvData: "", coverLetterData: "",
        portfolioUrl: "", portfolioData: "",
        educationLevel: "", experience: "",
        socialLinks: { linkedin: "", github: "", twitter: "" },
        desiredSalary: "", availability: "",
        customAnswers: {},
    });

    const updateField = (key: string, value: any) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const formConfig = (job?.formConfig || {}) as Record<string, string>;
    const customQuestions = (job?.customQuestions || []) as Array<{
        id: string; type: "text" | "yesno" | "multiple"; question: string; options?: string[];
    }>;

    const activeFields = Object.entries(formConfig).filter(([, s]) => s !== "disabled");
    const requiredFields = Object.entries(formConfig).filter(([, s]) => s === "required");

    const STEP_GROUPS: string[][] = [
        ["email", "fullName", "phone", "address", "photoData"],
        ["cvData", "coverLetterData", "portfolioUrl", "portfolioData"],
        ["educationLevel", "experience", "socialLinks"],
        ["desiredSalary", "availability"],
    ];
    const formSteps = STEP_GROUPS
        .map(keys => keys.filter(k => formConfig[k] !== "disabled"))
        .filter(keys => keys.length > 0);
    if (customQuestions.length > 0) formSteps.push(["custom"]);
    const totalSteps = formSteps.length + 1; // +1 pour récap/envoi
    const getFieldsForStep = (step: number) => {
        if (step >= formSteps.length) return [];
        return formSteps[step] || [];
    };

    const canSubmit = () => {
        if (!formData.email) return false;
        for (const [field] of requiredFields) {
            if (field === "socialLinks") continue;
            if (!formData[field]) return false;
        }
        return true;
    };

    const getRequiredForStep = (step: number) => {
        const stepFields = getFieldsForStep(step);
        const requiredSet = new Set(requiredFields.map(([k]) => k));
        return stepFields.filter(f => requiredSet.has(f));
    };
    const canProceedToNextStep = (step: number) => {
        const required = getRequiredForStep(step);
        for (const field of required) {
            if (field === "socialLinks") continue;
            if (!formData[field]) return false;
        }
        return true;
    };

    const handleSubmit = async () => {
        if (!canSubmit()) { toast.error("Veuillez remplir tous les champs obligatoires"); return; }
        setSubmitting(true);
        try {
            const res = await fetch(`/api/jobs/${jobId}/apply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });
            const data = await res.json();
            if (res.ok) {
                setSubmitted(true);
            } else {
                toast.error(data.error || "Erreur lors de l'envoi");
            }
        } catch { toast.error("Erreur serveur"); }
        finally { setSubmitting(false); }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!job) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <Briefcase className="w-16 h-16 text-muted-foreground/30" />
                <h2 className="text-lg font-semibold">Offre non disponible</h2>
                <p className="text-muted-foreground text-sm">Cette offre n'existe plus ou a été fermée.</p>
                <Button onClick={() => router.push("/chat/groups")}>Voir toutes les offres</Button>
            </div>
        );
    }

    const isExpired = job.deadline && new Date(job.deadline) < new Date();

    // Page de confirmation
    if (submitted) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto animate-bounce">
                        <CheckCircle2 className="w-14 h-14 text-green-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold mb-2">Candidature envoyée ! </h1>
                        <p className="text-muted-foreground">
                            Votre candidature pour le poste de <strong>{job.title}</strong> chez <strong>{job.companyName}</strong> a bien été reçue.
                        </p>
                        <p className="text-sm text-muted-foreground mt-3">
                            Un email de confirmation vous a été envoyé à <strong>{formData.email}</strong>.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <Button onClick={() => router.push("/chat/groups")} className="w-full gap-2">
                            <Briefcase className="w-4 h-4" /> Voir d'autres offres
                        </Button>
                        <Button variant="outline" onClick={() => router.push("/chat")} className="w-full">
                            Retour à l'accueil
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pb-24 mt-16">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                {/* Hero de l'offre */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <div className="flex items-start gap-4">
                        {job.companyLogo ? (
                            <img src={job.companyLogo} alt={job.companyName}
                                className="w-16 h-16 object-cover rounded-xl border border-border" />
                        ) : (
                            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                                {job.companyName?.[0]?.toUpperCase()}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl font-bold text-foreground">{job.title}</h2>
                            <p className="text-muted-foreground font-medium text-lg">{job.companyName}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="text-sm font-medium px-3 py-1 bg-primary/10 text-primary rounded-full">
                                    {CONTRACT_LABELS[job.contractType] || job.contractType}
                                </span>
                                <span className={`text-sm font-medium px-3 py-1 rounded-full ${WORKMODE_COLORS[job.workMode] || "bg-muted text-muted-foreground"}`}>
                                    {WORKMODE_LABELS[job.workMode] || job.workMode}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Méta infos */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {[
                            { icon: MapPin, label: job.location },
                            { icon: Users, label: `${job.positionsCount} poste${job.positionsCount > 1 ? 's' : ''}` },
                            job.educationLevel && { icon: GraduationCap, label: job.educationLevel },
                            job.experience && { icon: Star, label: job.experience },
                            job.deadline && { icon: Calendar, label: `Avant le ${format(new Date(job.deadline), "d MMM yyyy", { locale: fr })}` },
                            job.contactEmail && { icon: Mail, label: job.contactEmail },
                        ].filter(Boolean).map((item: any, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-muted-foreground">
                                <item.icon className="w-4 h-4 shrink-0" />
                                <span className="truncate">{item.label}</span>
                            </div>
                        ))}
                    </div>

                    {job.salary && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                            <span className="text-green-600 dark:text-green-400 font-bold">💰 {job.salary}</span>
                        </div>
                    )}
                </div>

                {/* Description */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <h3 className="text-lg font-bold">Description du poste</h3>
                    <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{job.description}</p>

                    {job.missions && (
                        <>
                            <h4 className="font-semibold">Missions principales</h4>
                            <p className="text-muted-foreground whitespace-pre-wrap">{job.missions}</p>
                        </>
                    )}

                    {job.skills && (
                        <>
                            <h4 className="font-semibold">Compétences requises</h4>
                            <p className="text-muted-foreground">{job.skills}</p>
                        </>
                    )}
                </div>

                {/* Infos entreprise */}
                <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Building2 className="w-5 h-5" /> À propos de l'entreprise
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                        {job.address && <p className="flex items-center gap-2"><MapPin className="w-4 h-4" />{job.address}{job.city && `, ${job.city}`}</p>}
                        {job.contactEmail && <p className="flex items-center gap-2"><Mail className="w-4 h-4" />{job.contactEmail}</p>}
                        {job.contactPhone && <p className="flex items-center gap-2"><Phone className="w-4 h-4" />{job.contactPhone}</p>}
                        {job.website && (
                            <a href={job.website} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 text-primary hover:underline">
                                <Globe className="w-4 h-4" />{job.website}
                            </a>
                        )}
                    </div>
                </div>

                {/* Formulaire de candidature (Dialog centré avec étapes) */}
                <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setFormStep(0); }}>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card border-primary/30">
                        {myApplication ? (
                            /* Déjà postulé : afficher les infos fournies */
                            <>
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                        Vous avez déjà postulé
                                    </DialogTitle>
                                    <p className="text-sm text-muted-foreground">
                                        Voici les informations que vous avez fournies pour <strong>{job.title}</strong>
                                    </p>
                                </DialogHeader>
                                <div className="space-y-4 py-4 border-t border-border">
                                    <div className="grid gap-3 text-sm">
                                        {myApplication.fullName && <p><span className="font-medium text-muted-foreground">Nom :</span> {myApplication.fullName}</p>}
                                        {myApplication.email && <p><span className="font-medium text-muted-foreground">Email :</span> {myApplication.email}</p>}
                                        {myApplication.phone && <p><span className="font-medium text-muted-foreground">Téléphone :</span> {myApplication.phone}</p>}
                                        {myApplication.address && <p><span className="font-medium text-muted-foreground">Adresse :</span> {myApplication.address}</p>}
                                        {myApplication.educationLevel && <p><span className="font-medium text-muted-foreground">Niveau d&apos;étude :</span> {myApplication.educationLevel}</p>}
                                        {myApplication.experience && <p><span className="font-medium text-muted-foreground">Expérience :</span> {myApplication.experience}</p>}
                                        {myApplication.desiredSalary && <p><span className="font-medium text-muted-foreground">Salaire souhaité :</span> {myApplication.desiredSalary}</p>}
                                        {myApplication.availability && <p><span className="font-medium text-muted-foreground">Disponibilité :</span> {myApplication.availability}</p>}
                                        {myApplication.hasCv && <p className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-500" /> CV fourni</p>}
                                        {myApplication.hasCoverLetter && <p className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-500" /> Lettre de motivation fournie</p>}
                                        {myApplication.hasPhoto && <p className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-500" /> Photo fournie</p>}
                                        <p className="text-xs text-muted-foreground pt-2">
                                            Statut : <span className="font-medium capitalize">{myApplication.status?.toLowerCase()}</span>
                                            {myApplication.createdAt && ` · Postulé le ${format(new Date(myApplication.createdAt), "d MMM yyyy", { locale: fr })}`}
                                        </p>
                                    </div>
                                    <Button variant="outline" onClick={() => setShowForm(false)} className="w-full">
                                        Fermer
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center justify-between">
                                <span>Votre candidature</span>
                                <span className="text-sm font-normal text-muted-foreground">
                                    Étape {formStep + 1} / {totalSteps}
                                </span>
                            </DialogTitle>
                            <p className="text-sm text-muted-foreground">
                                Postuler à <strong>{job.title}</strong>
                            </p>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            {/* Indicateur d'étapes */}
                            <div className="flex gap-1">
                                {Array.from({ length: totalSteps }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`h-1 flex-1 rounded-full transition-colors ${i <= formStep ? "bg-primary" : "bg-muted"}`}
                                    />
                                ))}
                            </div>

                            {/* Contenu par étape */}
                            {formStep === totalSteps - 1 ? (
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">
                                        Vérifiez vos informations avant d&apos;envoyer.
                                    </p>
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={!canSubmit() || submitting}
                                        className="w-full gap-2"
                                    >
                                        {submitting
                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi...</>
                                            : <><Send className="w-4 h-4" /> Envoyer ma candidature</>
                                        }
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    {getFieldsForStep(formStep).map(fieldKey => {
                                        if (fieldKey === "custom") {
                                            return (
                                                <div key="custom" className="space-y-4 pt-2 border-t border-border">
                                                    <h4 className="font-semibold">Questions de l&apos;entreprise</h4>
                                                    {customQuestions.map(q => (
                                                        <div key={q.id}>
                                                            <Label>{q.question}</Label>
                                                            {q.type === "text" && (
                                                                <Textarea
                                                                    value={formData.customAnswers?.[q.question] || ""}
                                                                    onChange={e => updateField("customAnswers", {
                                                                        ...formData.customAnswers,
                                                                        [q.question]: e.target.value,
                                                                    })}
                                                                    placeholder="Votre réponse..." rows={2} className="mt-1"
                                                                />
                                                            )}
                                                            {q.type === "yesno" && (
                                                                <div className="flex gap-3 mt-1">
                                                                    {["Oui", "Non"].map(opt => (
                                                                        <button
                                                                            key={opt}
                                                                            type="button"
                                                                            onClick={() => updateField("customAnswers", {
                                                                                ...formData.customAnswers,
                                                                                [q.question]: opt,
                                                                            })}
                                                                            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${formData.customAnswers?.[q.question] === opt
                                                                                ? "border-primary bg-primary/10 text-primary"
                                                                                : "border-border text-muted-foreground hover:border-primary/50"
                                                                                }`}
                                                                        >
                                                                            {opt}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {q.type === "multiple" && (
                                                                <div className="flex flex-wrap gap-2 mt-1">
                                                                    {(q.options || []).map(opt => (
                                                                        <button
                                                                            key={opt}
                                                                            type="button"
                                                                            onClick={() => updateField("customAnswers", {
                                                                                ...formData.customAnswers,
                                                                                [q.question]: opt,
                                                                            })}
                                                                            className={`px-3 py-1.5 rounded-xl border text-sm transition-all ${formData.customAnswers?.[q.question] === opt
                                                                                ? "border-primary bg-primary/10 text-primary font-medium"
                                                                                : "border-border text-muted-foreground hover:border-primary/50"
                                                                                }`}
                                                                        >
                                                                            {opt}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        }
                                        const status = formConfig[fieldKey];
                                        const required = status === "required";
                                        const label = FIELD_LABELS[fieldKey] || fieldKey;

                                        if (fieldKey === "cvData" || fieldKey === "coverLetterData" || fieldKey === "portfolioData" || fieldKey === "photoData") {
                                            const accept = fieldKey === "photoData" ? "image/*" : ".pdf,.doc,.docx,image/*";
                                            return (
                                                <UploadField
                                                    key={fieldKey}
                                                    label={label}
                                                    required={required}
                                                    fieldKey={fieldKey}
                                                    accept={accept}
                                                    onChange={val => updateField(fieldKey, val)}
                                                />
                                            );
                                        }
                                        if (fieldKey === "experience") {
                                            return (
                                                <div key={fieldKey}>
                                                    <Label className="flex items-center gap-1">
                                                        {label} {required && <span className="text-destructive">*</span>}
                                                    </Label>
                                                    <Textarea
                                                        value={formData[fieldKey]}
                                                        onChange={e => updateField(fieldKey, e.target.value)}
                                                        placeholder="Décrivez votre expérience professionnelle..."
                                                        rows={4} className="mt-1"
                                                    />
                                                </div>
                                            );
                                        }
                                        if (fieldKey === "socialLinks") {
                                            return (
                                                <div key={fieldKey} className="space-y-2">
                                                    <Label>{label} {required && <span className="text-destructive">*</span>}</Label>
                                                    {["linkedin", "github", "twitter"].map(network => (
                                                        <div key={network} className="flex gap-2 items-center">
                                                            <span className="text-sm text-muted-foreground w-20 capitalize">{network}</span>
                                                            <Input
                                                                value={formData.socialLinks?.[network] || ""}
                                                                onChange={e => updateField("socialLinks", { ...formData.socialLinks, [network]: e.target.value })}
                                                                placeholder={`https://${network}.com/profil`}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        }
                                        return (
                                            <div key={fieldKey}>
                                                <Label className="flex items-center gap-1">
                                                    {label} {required && <span className="text-destructive">*</span>}
                                                </Label>
                                                <Input
                                                    value={formData[fieldKey] || ""}
                                                    onChange={e => updateField(fieldKey, e.target.value)}
                                                    placeholder={label}
                                                    type={fieldKey === "email" ? "email" : "text"}
                                                    className="mt-1"
                                                />
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>

                        {/* Navigation */}
                        <div className="flex gap-3 pt-4 border-t border-border">
                            <Button
                                variant="outline"
                                onClick={() => formStep === 0 ? setShowForm(false) : setFormStep(s => s - 1)}
                                className="flex-1"
                            >
                                {formStep === 0 ? "Annuler" : "Précédent"}
                            </Button>
                            {formStep < totalSteps - 1 && (
                                <Button
                                    onClick={() => {
                                        if (!canProceedToNextStep(formStep)) {
                                            toast.error("Veuillez remplir tous les champs obligatoires de cette étape");
                                            return;
                                        }
                                        setFormStep(s => s + 1);
                                    }}
                                    className="flex-1 gap-1"
                                >
                                    Suivant <ChevronRight className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
