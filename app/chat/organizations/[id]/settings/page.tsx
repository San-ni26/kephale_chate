"use client";

import { useEffect, useRef, useState } from "react";
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
import { Loader2, Building2, Trash2, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

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

    const [editOrgForm, setEditOrgForm] = useState({ name: "", logo: "", address: "" });
    const [newPlan, setNewPlan] = useState<string>("");
    const [updatingOrg, setUpdatingOrg] = useState(false);
    const [deletingOrg, setDeletingOrg] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [logoImageError, setLogoImageError] = useState(false);
    const [loadingLogo, setLoadingLogo] = useState(false);
    const logoFileInputRef = useRef<HTMLInputElement>(null);

    const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
    const [removingMemberUserId, setRemovingMemberUserId] = useState<string | null>(null);
    const [showMembersList, setShowMembersList] = useState(true);

    useEffect(() => {
        if (!org) return;
        setEditOrgForm({
            name: org.name,
            logo: org.logo || "",
            address: org.address || "",
        });
        setNewPlan(org.subscription?.plan || "FREE");
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

    const handleChangePlan = async () => {
        if (!orgId || !newPlan) return;
        setUpdatingOrg(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: newPlan }),
            });
            if (res.ok) {
                toast.success("Abonnement mis à jour");
                mutateOrg();
            } else {
                const err = await res.json();
                toast.error(err.error || "Erreur");
            }
        } catch (e) {
            console.error("Change plan error:", e);
            toast.error("Erreur serveur");
        } finally {
            setUpdatingOrg(false);
        }
    };

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

    const isSubscriptionExpired = Boolean(
        org.subscription?.endDate &&
        new Date(org.subscription.endDate) < new Date()
    );

    return (
        <div className="min-h-screen bg-background mt-14 md:mt-16 pb-20 md:pb-6 ">
            <div className="mx-auto w-full max-w-4xl px-4 md:px-6 lg:px-8 py-6 space-y-6 pb-25">


                {/* Abonnement */}
                <Card>
                    <CardHeader>
                        <CardTitle>Abonnement</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        {org.subscription ? (
                            <>
                                <div className="rounded-lg border border-border p-3 space-y-1">
                                    <p>
                                        <span className="text-muted-foreground">
                                            Plan actuel :
                                        </span>{" "}
                                        <strong>{org.subscription.plan}</strong>
                                    </p>
                                    <p>
                                        <span className="text-muted-foreground">
                                            Début :
                                        </span>{" "}
                                        {org.subscription.startDate
                                            ? format(
                                                new Date(org.subscription.startDate),
                                                "d MMMM yyyy",
                                                { locale: fr }
                                            )
                                            : "—"}
                                    </p>
                                    <p>
                                        <span className="text-muted-foreground">
                                            Fin :
                                        </span>{" "}
                                        {org.subscription.endDate
                                            ? format(
                                                new Date(org.subscription.endDate),
                                                "d MMMM yyyy",
                                                { locale: fr }
                                            )
                                            : "Sans fin"}
                                    </p>
                                    <p>
                                        <span className="text-muted-foreground">
                                            Départements :
                                        </span>{" "}
                                        {org._count.departments} /{" "}
                                        {org.subscription.maxDepartments}
                                    </p>
                                    <p>
                                        <span className="text-muted-foreground">
                                            Membres max/dépt :
                                        </span>{" "}
                                        {org.subscription.maxMembersPerDept}
                                    </p>
                                    {isSubscriptionExpired && (
                                        <p className="text-destructive font-medium mt-2">
                                            Abonnement expiré. Mettez à jour pour
                                            continuer à utiliser les fonctionnalités.
                                        </p>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select value={newPlan} onValueChange={setNewPlan}>
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue placeholder="Changer de plan" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="FREE">Gratuit</SelectItem>
                                            <SelectItem value="BASIC">Basic</SelectItem>
                                            <SelectItem value="PROFESSIONAL">
                                                Professional
                                            </SelectItem>
                                            <SelectItem value="ENTERPRISE">
                                                Enterprise
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        size="sm"
                                        onClick={handleChangePlan}
                                        disabled={
                                            updatingOrg ||
                                            newPlan ===
                                            (org.subscription?.plan || "FREE")
                                        }
                                    >
                                        {updatingOrg ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : null}
                                        Mettre à jour l&apos;abonnement
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <p className="text-muted-foreground">
                                Aucun abonnement défini pour cette organisation.
                            </p>
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

