"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
import { fetchWithAuth } from "@/src/lib/auth-client";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/src/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import {
    Loader2, Building2, Trash2, ArrowLeft, ChevronDown, ChevronUp,
    Crown, Check, AlertTriangle, Clock, CreditCard, ArrowUpRight, ArrowDownRight,
    Users, LayoutGrid, Infinity as InfinityIcon, Zap
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Types ───
interface Organization {
    id: string;
    name: string;
    logo?: string | null;
    address?: string | null;
    ownerId: string;
    subscription?: {
        plan: string;
        startDate: string | null;
        endDate: string | null;
        maxDepartments: number;
        maxMembersPerDept: number;
    } | null;
    _count: {
        departments: number;
        members: number;
    };
}

interface OrgMember {
    id: string;
    name: string | null;
    email: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
}

interface PendingOrder {
    id: string;
    plan: string;
    amountFcfa: number;
    status: string;
    createdAt: string;
}

interface PendingPayment {
    id: string;
    plan: string;
    transactionId: string;
    createdAt: string;
}

// ─── Plans ───
const PLANS = [
    {
        key: "FREE",
        label: "Gratuit",
        price: 0,
        maxDepartments: 2,
        maxMembers: 5,
        features: ["2 départements", "5 membres / dépt", "Essai 1 mois"],
        color: "border-muted",
        badge: null,
    },
    {
        key: "BASIC",
        label: "Basic",
        price: 5000,
        maxDepartments: 5,
        maxMembers: 20,
        features: ["5 départements", "20 membres / dépt", "Support standard"],
        color: "border-blue-500/50",
        badge: null,
    },
    {
        key: "PROFESSIONAL",
        label: "Professional",
        price: 15000,
        maxDepartments: 15,
        maxMembers: 50,
        features: ["15 départements", "50 membres / dépt", "Support prioritaire"],
        color: "border-violet-500/50",
        badge: "Populaire",
    },
    {
        key: "ENTERPRISE",
        label: "Enterprise",
        price: 50000,
        maxDepartments: 999999,
        maxMembers: 999999,
        features: ["Départements illimités", "Membres illimités", "Support dédié"],
        color: "border-amber-500/50",
        badge: "Premium",
    },
] as const;

const PLAN_ORDER: Record<string, number> = {
    FREE: 0,
    BASIC: 1,
    PROFESSIONAL: 2,
    ENTERPRISE: 3,
};

function getPlanLabel(plan: string) {
    return PLANS.find((p) => p.key === plan)?.label || plan;
}

function getPlanPrice(plan: string) {
    return PLANS.find((p) => p.key === plan)?.price ?? 0;
}

export default function OrganizationSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const orgId = params?.id as string;

    const { data: orgData, mutate: mutateOrg } = useSWR(
        orgId ? `/api/organizations/${orgId}` : null,
        fetcher
    );
    const org: Organization | null = orgData?.organization ?? null;

    const { data: membersData, mutate: mutateMembers } = useSWR<{ members: OrgMember[] }>(
        orgId ? `/api/organizations/${orgId}/members` : null,
        fetcher
    );
    const orgMembers: OrgMember[] = membersData?.members ?? [];

    // Upgrade status
    const { data: upgradeData, mutate: mutateUpgrade } = useSWR(
        orgId ? `/api/organizations/${orgId}/upgrade` : null,
        fetcher,
        { refreshInterval: 15000 }
    );
    const pendingOrders: PendingOrder[] = upgradeData?.pendingOrders ?? [];
    const pendingPayments: PendingPayment[] = upgradeData?.pendingPayments ?? [];
    const hasPendingUpgrade = pendingOrders.length > 0 || pendingPayments.length > 0;

    const [editOrgForm, setEditOrgForm] = useState({ name: "", logo: "", address: "" });
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [updatingOrg, setUpdatingOrg] = useState(false);
    const [upgradingPlan, setUpgradingPlan] = useState(false);
    const [deletingOrg, setDeletingOrg] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [logoImageError, setLogoImageError] = useState(false);
    const [loadingLogo, setLoadingLogo] = useState(false);
    const logoFileInputRef = useRef<HTMLInputElement>(null);

    const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
    const [removingMemberUserId, setRemovingMemberUserId] = useState<string | null>(null);
    const [showMembersList, setShowMembersList] = useState(true);
    const [showPlanSelector, setShowPlanSelector] = useState(false);

    useEffect(() => {
        if (!org) return;
        setEditOrgForm({
            name: org.name,
            logo: org.logo || "",
            address: org.address || "",
        });
    }, [org]);

    const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 Mo
    const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Veuillez choisir une image (JPEG, PNG, GIF, WebP)");
            return;
        }
        if (file.size > MAX_LOGO_SIZE) {
            toast.error("Image trop volumineuse (max 2 Mo)");
            return;
        }
        setLoadingLogo(true);
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            setEditOrgForm((f) => ({ ...f, logo: dataUrl }));
            setLogoImageError(false);
            setLoadingLogo(false);
            if (logoFileInputRef.current) logoFileInputRef.current.value = "";
        };
        reader.onerror = () => {
            toast.error("Erreur lors de la lecture de l'image");
            setLoadingLogo(false);
        };
        reader.readAsDataURL(file);
    };

    const handleUpdateOrgInfos = async () => {
        if (!orgId || !editOrgForm.name.trim()) {
            toast.error("Le nom est requis");
            return;
        }
        setUpdatingOrg(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: editOrgForm.name.trim(),
                    logo: editOrgForm.logo || null,
                    address: editOrgForm.address || null,
                }),
            });
            if (res.ok) {
                toast.success("Organisation mise à jour");
                mutateOrg();
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch (e) {
            console.error("Update org error:", e);
            toast.error("Erreur serveur");
        } finally {
            setUpdatingOrg(false);
        }
    };

    // ─── Changement d'abonnement avec paiement ───
    const handleUpgradePlan = useCallback(async (plan: string) => {
        if (!orgId || !plan) return;

        const currentPlan = org?.subscription?.plan || "FREE";
        if (plan === currentPlan) {
            toast.info("Vous êtes déjà sur ce plan");
            return;
        }

        setUpgradingPlan(true);
        setSelectedPlan(plan);

        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/upgrade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || "Erreur lors du changement d'abonnement");
                return;
            }

            switch (data.mode) {
                case "FREE_DOWNGRADE":
                    toast.success("Abonnement mis à jour vers le plan gratuit");
                    mutateOrg();
                    setShowPlanSelector(false);
                    break;

                case "CINETPAY":
                    if (data.paymentUrl) {
                        toast.success("Redirection vers la page de paiement...");
                        window.location.href = data.paymentUrl;
                        return;
                    }
                    toast.error("Erreur de redirection vers le paiement");
                    break;

                case "MANUAL":
                    toast.success(data.message || "Demande envoyée, en attente d'approbation");
                    mutateUpgrade();
                    setShowPlanSelector(false);
                    break;

                default:
                    toast.error("Mode de paiement inconnu");
            }
        } catch (e) {
            console.error("Upgrade plan error:", e);
            toast.error("Erreur serveur");
        } finally {
            setUpgradingPlan(false);
            setSelectedPlan(null);
        }
    }, [orgId, org, mutateOrg, mutateUpgrade]);

    const handleUpdateMemberRole = async (userId: string, role: "ADMIN" | "MEMBER") => {
        if (!orgId) return;
        setUpdatingRoleUserId(userId);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/members`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role }),
            });
            if (res.ok) {
                toast.success(
                    role === "ADMIN" ? "Droits admin attribués" : "Rôle membre"
                );
                mutateMembers();
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch (e) {
            console.error("Update role error:", e);
            toast.error("Erreur serveur");
        } finally {
            setUpdatingRoleUserId(null);
        }
    };

    const handleRemoveMemberFromOrg = async (userId: string, memberName: string) => {
        if (
            !orgId ||
            !confirm(
                `Supprimer ${memberName || "ce membre"} de l'organisation ? Il sera retiré de tous les départements.`
            )
        )
            return;
        setRemovingMemberUserId(userId);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/members`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            if (res.ok) {
                toast.success("Membre supprimé de l'organisation");
                mutateMembers();
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch (e) {
            console.error("Remove member error:", e);
            toast.error("Erreur serveur");
        } finally {
            setRemovingMemberUserId(null);
        }
    };

    const handleDeleteOrg = async () => {
        if (!orgId || deleteConfirmText !== org?.name) {
            toast.error(
                "Saisissez exactement le nom de l'organisation pour confirmer"
            );
            return;
        }
        setDeletingOrg(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}`, {
                method: "DELETE",
            });
            if (res.ok) {
                toast.success("Organisation supprimée");
                router.push("/chat/organizations");
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch (e) {
            console.error("Delete org error:", e);
            toast.error("Erreur serveur");
        } finally {
            setDeletingOrg(false);
        }
    };

    if (!org) {
        return (
            <div className="min-h-screen mt-14 md:mt-16 flex items-center justify-center bg-background">
                <p className="text-muted-foreground">Chargement des paramètres...</p>
            </div>
        );
    }

    const currentPlan = org.subscription?.plan || "FREE";
    const currentPlanConfig = PLANS.find((p) => p.key === currentPlan);

    const isSubscriptionExpired = Boolean(
        org.subscription?.endDate &&
        new Date(org.subscription.endDate) < new Date()
    );

    return (
        <div className="min-h-screen bg-background mt-14 md:mt-16 pb-20 md:pb-6 ">
            <div className="mx-auto w-full max-w-4xl px-4 md:px-6 lg:px-8 py-6 space-y-6 pb-25">

                {/* ═══════════ Abonnement actuel ═══════════ */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Crown className="w-5 h-5 text-amber-500" />
                                <CardTitle>Abonnement</CardTitle>
                            </div>
                            {currentPlanConfig && (
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                                    currentPlan === "FREE"
                                        ? "bg-muted text-muted-foreground"
                                        : currentPlan === "BASIC"
                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                        : currentPlan === "PROFESSIONAL"
                                        ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                }`}>
                                    {currentPlanConfig.label}
                                </span>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        {org.subscription ? (
                            <>
                                {/* Info abonnement actuel */}
                                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Plan actuel</p>
                                            <p className="font-semibold text-base">{getPlanLabel(currentPlan)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Prix mensuel</p>
                                            <p className="font-semibold text-base">
                                                {getPlanPrice(currentPlan) === 0
                                                    ? "Gratuit"
                                                    : `${getPlanPrice(currentPlan).toLocaleString("fr-FR")} FCFA`}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Début</p>
                                            <p className="font-medium">
                                                {org.subscription.startDate
                                                    ? format(new Date(org.subscription.startDate), "d MMMM yyyy", { locale: fr })
                                                    : "—"}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Expiration</p>
                                            <p className={`font-medium ${isSubscriptionExpired ? "text-destructive" : ""}`}>
                                                {org.subscription.endDate
                                                    ? format(new Date(org.subscription.endDate), "d MMMM yyyy", { locale: fr })
                                                    : "Sans fin"}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-4 pt-2 border-t border-border">
                                        <div className="flex items-center gap-1.5">
                                            <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm">
                                                <strong>{org._count.departments}</strong> / {org.subscription.maxDepartments >= 999999 ? <InfinityIcon className="inline w-3.5 h-3.5" /> : org.subscription.maxDepartments} départements
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Users className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm">
                                                {org.subscription.maxMembersPerDept >= 999999 ? <><InfinityIcon className="inline w-3.5 h-3.5" /> membres/dépt</> : <><strong>{org.subscription.maxMembersPerDept}</strong> membres max/dépt</>}
                                            </span>
                                        </div>
                                    </div>

                                    {isSubscriptionExpired && (
                                        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                                            <AlertTriangle className="w-4 h-4 shrink-0" />
                                            <p className="text-sm font-medium">
                                                Votre abonnement a expiré. Renouvelez ou changez de plan pour continuer.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Demande(s) en attente */}
                                {hasPendingUpgrade && (
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-amber-600" />
                                            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                                                Changement d&apos;abonnement en cours
                                            </p>
                                        </div>
                                        {pendingOrders.map((o) => (
                                            <div key={o.id} className="flex items-center justify-between text-sm bg-background/60 rounded p-2">
                                                <span>
                                                    Passage au plan <strong>{getPlanLabel(o.plan)}</strong> ({o.amountFcfa.toLocaleString("fr-FR")} FCFA)
                                                </span>
                                                <span className="text-xs text-amber-600 font-medium px-2 py-0.5 bg-amber-500/10 rounded-full">
                                                    En attente d&apos;approbation
                                                </span>
                                            </div>
                                        ))}
                                        {pendingPayments.map((p) => (
                                            <div key={p.id} className="flex items-center justify-between text-sm bg-background/60 rounded p-2">
                                                <span>
                                                    Paiement en cours pour le plan <strong>{getPlanLabel(p.plan)}</strong>
                                                </span>
                                                <span className="text-xs text-blue-600 font-medium px-2 py-0.5 bg-blue-500/10 rounded-full">
                                                    Paiement en attente
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Bouton pour ouvrir le sélecteur de plan */}
                                <Button
                                    variant={showPlanSelector ? "outline" : "default"}
                                    size="sm"
                                    onClick={() => setShowPlanSelector(!showPlanSelector)}
                                    disabled={hasPendingUpgrade}
                                    className="gap-2"
                                >
                                    {showPlanSelector ? (
                                        <>
                                            <ChevronUp className="w-4 h-4" />
                                            Fermer
                                        </>
                                    ) : (
                                        <>
                                            <CreditCard className="w-4 h-4" />
                                            {isSubscriptionExpired
                                                ? "Renouveler l\u2019abonnement"
                                                : "Changer de plan"}
                                        </>
                                    )}
                                </Button>

                                {/* ─── Sélecteur de plan avec prix ─── */}
                                {showPlanSelector && (
                                    <div className="space-y-3 pt-2">
                                        <p className="text-sm text-muted-foreground">
                                            Choisissez un nouveau plan. Le paiement sera traité automatiquement.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {PLANS.map((plan) => {
                                                const isCurrent = plan.key === currentPlan;
                                                const isUpgrade = PLAN_ORDER[plan.key] > PLAN_ORDER[currentPlan];
                                                const isDowngrade = PLAN_ORDER[plan.key] < PLAN_ORDER[currentPlan];
                                                const isProcessing = upgradingPlan && selectedPlan === plan.key;

                                                return (
                                                    <div
                                                        key={plan.key}
                                                        className={`relative rounded-xl border-2 p-4 transition-all ${
                                                            isCurrent
                                                                ? "border-primary bg-primary/5"
                                                                : `${plan.color} hover:shadow-md`
                                                        }`}
                                                    >
                                                        {/* Badge populaire/premium */}
                                                        {plan.badge && (
                                                            <span className={`absolute -top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                                plan.key === "PROFESSIONAL"
                                                                    ? "bg-violet-500 text-white"
                                                                    : "bg-amber-500 text-white"
                                                            }`}>
                                                                {plan.badge}
                                                            </span>
                                                        )}

                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <h4 className="font-semibold">{plan.label}</h4>
                                                                {isCurrent && (
                                                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                                                                        Actuel
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <p className="text-xl font-bold">
                                                                {plan.price === 0
                                                                    ? "Gratuit"
                                                                    : `${plan.price.toLocaleString("fr-FR")} FCFA`}
                                                                {plan.price > 0 && (
                                                                    <span className="text-xs font-normal text-muted-foreground"> / mois</span>
                                                                )}
                                                            </p>

                                                            <ul className="space-y-1">
                                                                {plan.features.map((f, i) => (
                                                                    <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                        <Check className="w-3 h-3 text-green-500 shrink-0" />
                                                                        {f}
                                                                    </li>
                                                                ))}
                                                            </ul>

                                                            {!isCurrent && (
                                                                <Button
                                                                    size="sm"
                                                                    variant={isUpgrade ? "default" : "outline"}
                                                                    className="w-full mt-2 gap-1.5"
                                                                    disabled={upgradingPlan}
                                                                    onClick={() => handleUpgradePlan(plan.key)}
                                                                >
                                                                    {isProcessing ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                                    ) : isUpgrade ? (
                                                                        <>
                                                                            <ArrowUpRight className="w-3.5 h-3.5" />
                                                                            Passer au {plan.label}
                                                                        </>
                                                                    ) : isDowngrade ? (
                                                                        <>
                                                                            <ArrowDownRight className="w-3.5 h-3.5" />
                                                                            Rétrograder
                                                                        </>
                                                                    ) : null}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <p className="text-xs text-muted-foreground mt-2">
                                            * Les frais de transaction (2%) s&apos;appliquent sur les paiements en ligne.
                                            Les changements prennent effet immédiatement après le paiement.
                                        </p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-muted-foreground">
                                    Aucun abonnement défini pour cette organisation.
                                </p>
                                <Button
                                    size="sm"
                                    onClick={() => setShowPlanSelector(true)}
                                    className="gap-2"
                                >
                                    <Zap className="w-4 h-4" />
                                    Souscrire à un abonnement
                                </Button>

                                {showPlanSelector && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                        {PLANS.filter((p) => p.key !== "FREE").map((plan) => {
                                            const isProcessing = upgradingPlan && selectedPlan === plan.key;
                                            return (
                                                <div
                                                    key={plan.key}
                                                    className={`relative rounded-xl border-2 p-4 ${plan.color} hover:shadow-md transition-all`}
                                                >
                                                    {plan.badge && (
                                                        <span className={`absolute -top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                            plan.key === "PROFESSIONAL"
                                                                ? "bg-violet-500 text-white"
                                                                : "bg-amber-500 text-white"
                                                        }`}>
                                                            {plan.badge}
                                                        </span>
                                                    )}
                                                    <h4 className="font-semibold">{plan.label}</h4>
                                                    <p className="text-xl font-bold mt-1">
                                                        {plan.price.toLocaleString("fr-FR")} FCFA
                                                        <span className="text-xs font-normal text-muted-foreground"> / mois</span>
                                                    </p>
                                                    <ul className="space-y-1 mt-2">
                                                        {plan.features.map((f, i) => (
                                                            <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                <Check className="w-3 h-3 text-green-500 shrink-0" />
                                                                {f}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    <Button
                                                        size="sm"
                                                        className="w-full mt-3 gap-1.5"
                                                        disabled={upgradingPlan}
                                                        onClick={() => handleUpgradePlan(plan.key)}
                                                    >
                                                        {isProcessing ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <CreditCard className="w-3.5 h-3.5" />
                                                                Souscrire
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Infos générales */}
                <Card>
                    <CardHeader>
                        <CardTitle>Informations générales</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nom</Label>
                            <Input
                                value={editOrgForm.name}
                                onChange={(e) =>
                                    setEditOrgForm((f) => ({
                                        ...f,
                                        name: e.target.value,
                                    }))
                                }
                                placeholder="Nom de l'organisation"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Adresse (optionnel)</Label>
                            <Input
                                value={editOrgForm.address}
                                onChange={(e) =>
                                    setEditOrgForm((f) => ({
                                        ...f,
                                        address: e.target.value,
                                    }))
                                }
                                placeholder="Adresse"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Logo</Label>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="w-16 h-16 rounded-full border border-border overflow-hidden bg-muted flex items-center justify-center shrink-0">
                                    {loadingLogo ? (
                                        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                                    ) : editOrgForm.logo && !logoImageError ? (
                                        <img
                                            src={editOrgForm.logo}
                                            alt="Logo"
                                            className="w-full h-full object-cover"
                                            onError={() => setLogoImageError(true)}
                                        />
                                    ) : (
                                        <Building2 className="w-8 h-8 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-2">
                                    <input
                                        ref={logoFileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp"
                                        onChange={handleLogoFileSelect}
                                        className="hidden"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => logoFileInputRef.current?.click()}
                                        disabled={loadingLogo}
                                    >
                                        {loadingLogo ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : (
                                            <Building2 className="w-4 h-4 mr-2" />
                                        )}
                                        Choisir une image
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => {
                                            setEditOrgForm((f) => ({ ...f, logo: "" }));
                                            setLogoImageError(false);
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4 mr-1" />
                                        Supprimer le logo
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <Button onClick={handleUpdateOrgInfos} disabled={updatingOrg}>
                            {updatingOrg ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
                            Enregistrer les infos
                        </Button>
                    </CardContent>
                </Card>

                {/* Rôles des membres */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <div className="space-y-1">
                            <CardTitle>Rôles des membres</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Attribuez le rôle <strong>Admin</strong> à un membre pour
                                qu&apos;il puisse tout gérer dans l&apos;organisation
                                (départements, tâches, événements).
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowMembersList((v) => !v)}
                            className="flex items-center gap-1"
                        >
                            {showMembersList ? "Masquer" : "Afficher"}
                            {showMembersList ? (
                                <ChevronUp className="w-4 h-4" />
                            ) : (
                                <ChevronDown className="w-4 h-4" />
                            )}
                        </Button>
                    </CardHeader>
                    {showMembersList && (
                        <CardContent className="space-y-3">
                            {orgMembers.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Chargement des membres...
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {orgMembers.map((m) => (
                                        <div
                                            key={m.id}
                                            className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium truncate">
                                                    {m.name || m.email}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {m.email}
                                                </p>
                                            </div>
                                            {m.role === "OWNER" ? (
                                                <span className="text-xs text-muted-foreground shrink-0">
                                                    Propriétaire
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Select
                                                        value={m.role}
                                                        onValueChange={(val) =>
                                                            handleUpdateMemberRole(
                                                                m.id,
                                                                val as "ADMIN" | "MEMBER"
                                                            )
                                                        }
                                                        disabled={
                                                            updatingRoleUserId === m.id ||
                                                            removingMemberUserId === m.id
                                                        }
                                                    >
                                                        <SelectTrigger className="w-[120px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="MEMBER">
                                                                Membre
                                                            </SelectItem>
                                                            <SelectItem value="ADMIN">
                                                                Admin
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() =>
                                                            handleRemoveMemberFromOrg(
                                                                m.id,
                                                                m.name || m.email
                                                            )
                                                        }
                                                        disabled={removingMemberUserId === m.id}
                                                        title="Supprimer de l'organisation"
                                                    >
                                                        {removingMemberUserId === m.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    )}
                </Card>

                {/* Suppression de l'organisation */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-destructive">
                            Supprimer l&apos;organisation
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Cette action est irréversible. Tous les départements, membres et
                            données seront supprimés.
                        </p>
                        <div className="space-y-2">
                            <Label>
                                Pour confirmer, saisissez le nom :{" "}
                                <strong>{org.name}</strong>
                            </Label>
                            <Input
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="Nom de l'organisation"
                                className="border-destructive/50"
                            />
                        </div>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteOrg}
                            disabled={deletingOrg || deleteConfirmText !== org.name}
                        >
                            {deletingOrg ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
                            Supprimer l&apos;organisation
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

