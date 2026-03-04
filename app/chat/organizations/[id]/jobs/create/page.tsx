"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Building2, Briefcase, ClipboardList, Eye, Rocket, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { toast } from "sonner";
import { fetchWithAuth, getUser } from "@/src/lib/auth-client";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";

// ─── Types ────────────────────────────────────────────────────────────────────
type FieldStatus = "required" | "optional" | "disabled";
type FormConfig = Record<string, FieldStatus>;

const AVAILABLE_FIELDS = [
    { key: "fullName", label: "Nom complet" },
    { key: "phone", label: "Téléphone" },
    { key: "address", label: "Adresse" },
    { key: "photoData", label: "Photo" },
    { key: "cvData", label: "CV (upload)" },
    { key: "coverLetterData", label: "Lettre de motivation" },
    { key: "portfolioUrl", label: "Portfolio (lien/fichier)" },
    { key: "educationLevel", label: "Niveau d'étude" },
    { key: "experience", label: "Expérience détaillée" },
    { key: "socialLinks", label: "Réseaux sociaux" },
    { key: "desiredSalary", label: "Salaire souhaité" },
    { key: "availability", label: "Disponibilité" },
];

const CONTRACT_TYPES = [
    { value: "CDI", label: "CDI" },
    { value: "CDD", label: "CDD" },
    { value: "STAGE", label: "Stage" },
    { value: "FREELANCE", label: "Freelance" },
    { value: "FULL_TIME", label: "Temps plein" },
    { value: "PART_TIME", label: "Temps partiel" },
];

const WORK_MODES = [
    { value: "ONSITE", label: "Présentiel" },
    { value: "REMOTE", label: "Remote" },
    { value: "HYBRID", label: "Hybride" },
];

const STEPS = [
    { id: 1, label: "Entreprise", icon: Building2 },
    { id: 2, label: "Poste", icon: Briefcase },
    { id: 3, label: "Formulaire", icon: ClipboardList },
    { id: 4, label: "Aperçu", icon: Eye },
    { id: 5, label: "Publication", icon: Rocket },
];

// ─── Page principale ──────────────────────────────────────────────────────────
export default function CreateJobOfferPage() {
    const router = useRouter();
    const params = useParams();
    const orgId = params?.id as string;
    const currentUser = getUser();

    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);

    // Fetch org data to auto-fill company name
    const { data: orgData } = useSWR(orgId ? `/api/organizations/${orgId}` : null, fetcher);
    const org = orgData?.organization;

    // Step 1: Company info
    const [companyName, setCompanyName] = useState("");
    const [companyLogo, setCompanyLogo] = useState("");
    const [contactEmail, setContactEmail] = useState(currentUser?.email || "");
    const [contactPhone, setContactPhone] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [website, setWebsite] = useState("");

    // Step 2: Job info
    const [title, setTitle] = useState("");
    const [contractType, setContractType] = useState("");
    const [location, setLocation] = useState("");
    const [workMode, setWorkMode] = useState("");
    const [description, setDescription] = useState("");
    const [missions, setMissions] = useState("");
    const [skills, setSkills] = useState("");
    const [educationLevel, setEducationLevel] = useState("");
    const [experience, setExperience] = useState("");
    const [salary, setSalary] = useState("");
    const [deadline, setDeadline] = useState("");
    const [positionsCount, setPositionsCount] = useState(1);

    // Step 3: Form config
    const [formConfig, setFormConfig] = useState<FormConfig>({
        fullName: "required",
        phone: "optional",
        address: "disabled",
        photoData: "disabled",
        cvData: "required",
        coverLetterData: "optional",
        portfolioUrl: "optional",
        educationLevel: "optional",
        experience: "optional",
        socialLinks: "disabled",
        desiredSalary: "disabled",
        availability: "optional",
    });
    const [customQuestions, setCustomQuestions] = useState<Array<{
        id: string; type: "text" | "yesno" | "multiple"; question: string; options?: string[];
    }>>([]);

    // Auto-fill company name from org
    useState(() => {
        if (org && !companyName) setCompanyName(org.name || "");
    });

    const addCustomQuestion = (type: "text" | "yesno" | "multiple") => {
        setCustomQuestions(prev => [...prev, {
            id: Date.now().toString(),
            type,
            question: "",
            options: type === "multiple" ? ["Option 1", "Option 2"] : undefined,
        }]);
    };

    const removeCustomQuestion = (id: string) => {
        setCustomQuestions(prev => prev.filter(q => q.id !== id));
    };

    const updateQuestion = (id: string, updates: any) => {
        setCustomQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { toast.error("Image trop volumineuse (max 2 Mo)"); return; }
        const reader = new FileReader();
        reader.onload = () => setCompanyLogo(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (publish: boolean) => {
        setSubmitting(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/jobs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyName, companyLogo, contactEmail, contactPhone,
                    address, city, website,
                    title, contractType, location, workMode,
                    description, missions, skills, educationLevel, experience,
                    salary, deadline, positionsCount,
                    formConfig, customQuestions,
                    publish,
                }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || "Erreur"); return; }
            toast.success(publish ? "Offre publiée avec succès !" : "Brouillon enregistré");
            router.push(`/chat/organizations/${orgId}/jobs`);
        } catch {
            toast.error("Erreur serveur");
        } finally {
            setSubmitting(false);
        }
    };

    const canProceedStep1 = companyName.trim() && contactEmail.trim();
    const canProceedStep2 = title.trim() && contractType && location.trim() && workMode && description.trim();

    return (
        <div className="min-h-screen bg-background pb-20 md:pb-8">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
                <div className="max-w-3xl mx-auto flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-lg font-bold">Créer une offre d'emploi</h1>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 mt-6">
                {/* Barre de progression */}
                <div className="flex items-center justify-between mb-8 mt-20">
                    {STEPS.map((s, i) => (
                        <div key={s.id} className="flex items-center">
                            <div className="flex flex-col items-center">
                                <button
                                    onClick={() => step > s.id && setStep(s.id)}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${step > s.id
                                        ? "bg-green-500 text-white cursor-pointer"
                                        : step === s.id
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground cursor-not-allowed"
                                        }`}
                                >
                                    {step > s.id ? <Check className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                                </button>
                                <span className={`text-xs mt-1 hidden md:block ${step === s.id ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                                    {s.label}
                                </span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`flex-1 h-0.5 mx-2 ${step > s.id ? "bg-green-500" : "bg-border"}`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Étape 1: Informations entreprise */}
                {step === 1 && (
                    <div className="space-y-6 bg-card border border-border rounded-2xl p-6 pb-20">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Informations de l'entreprise</h2>
                            <p className="text-muted-foreground text-sm">Ces informations seront visibles par les candidats</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <Label>Nom de l'entreprise *</Label>
                                <Input value={companyName} onChange={e => setCompanyName(e.target.value)}
                                    placeholder={org?.name || "Nom de votre entreprise"} className="mt-1" />
                            </div>
                            <div className="md:col-span-2">
                                <Label>Logo de l'entreprise</Label>
                                <div className="mt-1 flex items-center gap-4">
                                    {companyLogo && (
                                        <img src={companyLogo} alt="Logo" className="w-16 h-16 object-cover rounded-lg border border-border" />
                                    )}
                                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" id="logo-upload" />
                                    <label htmlFor="logo-upload" className="cursor-pointer text-sm text-primary hover:underline">
                                        {companyLogo ? "Changer le logo" : "Ajouter un logo"}
                                    </label>
                                </div>
                            </div>
                            <div>
                                <Label>Email de contact *</Label>
                                <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                                    placeholder="contact@entreprise.com" className="mt-1" />
                            </div>
                            <div>
                                <Label>Téléphone</Label>
                                <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                                    placeholder="+225 XX XX XX XX" className="mt-1" />
                            </div>
                            <div>
                                <Label>Adresse</Label>
                                <Input value={address} onChange={e => setAddress(e.target.value)}
                                    placeholder="Adresse de l'entreprise" className="mt-1" />
                            </div>
                            <div>
                                <Label>Ville</Label>
                                <Input value={city} onChange={e => setCity(e.target.value)}
                                    placeholder="Abidjan, Dakar, Paris..." className="mt-1" />
                            </div>
                            <div className="md:col-span-2">
                                <Label>Site web (optionnel)</Label>
                                <Input value={website} onChange={e => setWebsite(e.target.value)}
                                    placeholder="https://www.entreprise.com" className="mt-1" />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button onClick={() => setStep(2)} disabled={!canProceedStep1} className="gap-2">
                                Suivant <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Étape 2: Informations du poste */}
                {step === 2 && (
                    <div className="space-y-6 bg-card border border-border rounded-2xl p-6 pb-20">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Informations du poste</h2>
                            <p className="text-muted-foreground text-sm">Décrivez le poste en détail pour attirer les bons candidats</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <Label>Titre du poste *</Label>
                                <Input value={title} onChange={e => setTitle(e.target.value)}
                                    placeholder="Ex: Développeur Full Stack Senior" className="mt-1" />
                            </div>
                            <div>
                                <Label>Type de contrat *</Label>
                                <Select value={contractType} onValueChange={setContractType}>
                                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                                    <SelectContent>
                                        {CONTRACT_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Mode de travail *</Label>
                                <Select value={workMode} onValueChange={setWorkMode}>
                                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                                    <SelectContent>
                                        {WORK_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="md:col-span-2">
                                <Label>Localisation *</Label>
                                <Input value={location} onChange={e => setLocation(e.target.value)}
                                    placeholder="Ex: Abidjan, Côte d'Ivoire (ou précisez le quartier)" className="mt-1" />
                            </div>
                            <div className="md:col-span-2">
                                <Label>Description détaillée *</Label>
                                <Textarea value={description} onChange={e => setDescription(e.target.value)}
                                    placeholder="Décrivez le contexte du poste, l'environnement de travail..." rows={4} className="mt-1" />
                            </div>
                            <div className="md:col-span-2">
                                <Label>Missions principales</Label>
                                <Textarea value={missions} onChange={e => setMissions(e.target.value)}
                                    placeholder="Listez les missions principales du poste..." rows={3} className="mt-1" />
                            </div>
                            <div className="md:col-span-2">
                                <Label>Compétences requises</Label>
                                <Textarea value={skills} onChange={e => setSkills(e.target.value)}
                                    placeholder="Ex: React, Node.js, SQL, communication..." rows={2} className="mt-1" />
                            </div>
                            <div>
                                <Label>Niveau d'étude requis</Label>
                                <Select value={educationLevel} onValueChange={setEducationLevel}>
                                    <SelectTrigger className="mt-1"><SelectValue placeholder="Niveau requis..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Baccalauréat">Baccalauréat</SelectItem>
                                        <SelectItem value="Bac+2 (BTS/DUT)">Bac+2 (BTS/DUT)</SelectItem>
                                        <SelectItem value="Bac+3 (Licence)">Bac+3 (Licence)</SelectItem>
                                        <SelectItem value="Bac+5 (Master)">Bac+5 (Master)</SelectItem>
                                        <SelectItem value="Doctorat">Doctorat</SelectItem>
                                        <SelectItem value="Non précisé">Non précisé</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Expérience requise</Label>
                                <Select value={experience} onValueChange={setExperience}>
                                    <SelectTrigger className="mt-1"><SelectValue placeholder="Années d'expérience..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Débutant (0 ans)">Débutant (0 an)</SelectItem>
                                        <SelectItem value="Junior (1-2 ans)">Junior (1-2 ans)</SelectItem>
                                        <SelectItem value="Intermédiaire (3-5 ans)">Intermédiaire (3-5 ans)</SelectItem>
                                        <SelectItem value="Confirmé (5-8 ans)">Confirmé (5-8 ans)</SelectItem>
                                        <SelectItem value="Senior (8+ ans)">Senior (8+ ans)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Salaire (optionnel)</Label>
                                <Input value={salary} onChange={e => setSalary(e.target.value)}
                                    placeholder="Ex: 500 000 - 800 000 FCFA/mois" className="mt-1" />
                            </div>
                            <div>
                                <Label>Date limite de candidature</Label>
                                <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="mt-1" />
                            </div>
                            <div>
                                <Label>Nombre de postes à pourvoir</Label>
                                <Input type="number" min={1} value={positionsCount}
                                    onChange={e => setPositionsCount(parseInt(e.target.value) || 1)} className="mt-1" />
                            </div>
                        </div>
                        <div className="flex justify-between">
                            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                                <ArrowLeft className="w-4 h-4" /> Précédent
                            </Button>
                            <Button onClick={() => setStep(3)} disabled={!canProceedStep2} className="gap-2">
                                Suivant <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Étape 3: Formulaire candidat */}
                {step === 3 && (
                    <div className="space-y-6 bg-card border border-border rounded-2xl p-6 pb-20">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Formulaire de candidature</h2>
                            <p className="text-muted-foreground text-sm">Choisissez les informations à demander aux candidats</p>
                        </div>

                        <div className="space-y-3">
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Champs standards</h3>
                            {AVAILABLE_FIELDS.map(field => (
                                <div key={field.key} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                                    <span className="text-sm font-medium">{field.label}</span>
                                    <div className="flex gap-1">
                                        {(["required", "optional", "disabled"] as FieldStatus[]).map(status => (
                                            <button
                                                key={status}
                                                onClick={() => setFormConfig(prev => ({ ...prev, [field.key]: status }))}
                                                className={`px-3 py-1 text-xs rounded-lg transition-all font-medium ${formConfig[field.key] === status
                                                    ? status === "required"
                                                        ? "bg-primary text-primary-foreground"
                                                        : status === "optional"
                                                            ? "bg-amber-500 text-white"
                                                            : "bg-muted-foreground/20 text-muted-foreground"
                                                    : "text-muted-foreground hover:bg-muted"
                                                    }`}
                                            >
                                                {status === "required" ? "Obligatoire" : status === "optional" ? "Optionnel" : "Non"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Questions personnalisées */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Questions personnalisées</h3>
                            {customQuestions.map(q => (
                                <div key={q.id} className="p-4 border border-border rounded-xl space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-muted-foreground uppercase">
                                            {q.type === "text" ? "Texte libre" : q.type === "yesno" ? "Oui/Non" : "Choix multiples"}
                                        </span>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCustomQuestion(q.id)}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <Input value={q.question} onChange={e => updateQuestion(q.id, { question: e.target.value })}
                                        placeholder="Votre question..." className="bg-muted/50" />
                                    {q.type === "multiple" && (
                                        <div className="space-y-2 pl-2 border-l-2 border-border">
                                            {(q.options || []).map((opt, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <Input value={opt} onChange={e => {
                                                        const opts = [...(q.options || [])];
                                                        opts[idx] = e.target.value;
                                                        updateQuestion(q.id, { options: opts });
                                                    }} placeholder={`Option ${idx + 1}`} className="h-8 text-sm" />
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                                                        const opts = (q.options || []).filter((_, i) => i !== idx);
                                                        updateQuestion(q.id, { options: opts });
                                                    }}>
                                                        <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => {
                                                updateQuestion(q.id, { options: [...(q.options || []), `Option ${(q.options?.length || 0) + 1}`] });
                                            }}>
                                                <Plus className="w-3 h-3" /> Ajouter une option
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" className="gap-1" onClick={() => addCustomQuestion("text")}>
                                    <Plus className="w-3 h-3" /> Question texte
                                </Button>
                                <Button variant="outline" size="sm" className="gap-1" onClick={() => addCustomQuestion("yesno")}>
                                    <Plus className="w-3 h-3" /> Oui / Non
                                </Button>
                                <Button variant="outline" size="sm" className="gap-1" onClick={() => addCustomQuestion("multiple")}>
                                    <Plus className="w-3 h-3" /> Choix multiples
                                </Button>
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                                <ArrowLeft className="w-4 h-4" /> Précédent
                            </Button>
                            <Button onClick={() => setStep(4)} className="gap-2">
                                Suivant <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Étape 4: Aperçu */}
                {step === 4 && (
                    <div className="space-y-6">
                        <div className="bg-card border border-border rounded-2xl p-6 ">
                            <h2 className="text-xl font-bold mb-4">Aperçu de l'offre</h2>
                            {/* Preview card */}
                            <div className="border border-border rounded-xl p-5 space-y-4">
                                <div className="flex items-start gap-4">
                                    {companyLogo ? (
                                        <img src={companyLogo} alt="Logo" className="w-14 h-14 object-cover rounded-xl border border-border" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground">
                                            {companyName[0]?.toUpperCase()}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-xl font-bold text-foreground">{title}</h3>
                                        <p className="text-muted-foreground font-medium">{companyName}</p>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">
                                                {CONTRACT_TYPES.find(c => c.value === contractType)?.label}
                                            </span>
                                            <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full">
                                                {WORK_MODES.find(m => m.value === workMode)?.label}
                                            </span>
                                            <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded-full">
                                                📍 {location}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {salary && <p className="text-sm font-medium text-green-600 dark:text-green-400">💰 {salary}</p>}
                                <div>
                                    <h4 className="font-semibold mb-2">Description</h4>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{description}</p>
                                </div>
                                {missions && (
                                    <div>
                                        <h4 className="font-semibold mb-2">Missions</h4>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{missions}</p>
                                    </div>
                                )}
                                {skills && (
                                    <div>
                                        <h4 className="font-semibold mb-2">Compétences</h4>
                                        <p className="text-sm text-muted-foreground">{skills}</p>
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2 border-t border-border">
                                    {educationLevel && <span>🎓 {educationLevel}</span>}
                                    {experience && <span>⏱ {experience}</span>}
                                    {positionsCount && <span>👥 {positionsCount} poste{positionsCount > 1 ? 's' : ''}</span>}
                                    {deadline && <span>📅 Jusqu'au {new Date(deadline).toLocaleDateString('fr-FR')}</span>}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between pb-20">
                            <Button variant="outline" onClick={() => setStep(3)} className="gap-2">
                                <ArrowLeft className="w-4 h-4" /> Précédent
                            </Button>
                            <Button onClick={() => setStep(5)} className="gap-2">
                                Continuer <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Étape 5: Publication */}
                {step === 5 && (
                    <div className="space-y-6 bg-card border border-border rounded-2xl p-6 mb-20">
                        <div className="text-center space-y-2">
                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                                <Rocket className="w-8 h-8 text-primary" />
                            </div>
                            <h2 className="text-2xl font-bold">Prêt à publier !</h2>
                            <p className="text-muted-foreground">Choisissez comment vous souhaitez enregistrer cette offre</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={() => handleSubmit(false)}
                                disabled={submitting}
                                className="p-5 border-2 border-border rounded-xl text-left hover:border-primary/50 transition-all group"
                            >
                                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center mb-3">
                                    📝
                                </div>
                                <h3 className="font-bold mb-1">Brouillon</h3>
                                <p className="text-sm text-muted-foreground">Enregistrez et publiez plus tard</p>
                            </button>

                            <button
                                onClick={() => handleSubmit(true)}
                                disabled={submitting}
                                className="p-5 border-2 border-primary/50 bg-primary/5 rounded-xl text-left hover:border-primary transition-all"
                            >
                                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                                    🚀
                                </div>
                                <h3 className="font-bold mb-1 text-primary">Publier maintenant</h3>
                                <p className="text-sm text-muted-foreground">Rendre visible aux candidats immédiatement</p>
                            </button>
                        </div>

                        {submitting && (
                            <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Enregistrement en cours...</span>
                            </div>
                        )}

                        <div className="flex justify-start pb-15">
                            <Button variant="outline" onClick={() => setStep(4)} className="gap-2">
                                <ArrowLeft className="w-4 h-4" /> Précédent
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
