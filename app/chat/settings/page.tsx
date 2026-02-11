"use client";

import { useState, useEffect } from "react";
import { LogOut, Trash2, Smartphone, Shield, User, Upload, Plus, Copy, Users, Edit, CreditCard, CheckCircle, Mail, ListTodo } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuth, getUser, type AuthUser, getAuthHeader } from "@/src/lib/auth-client";

import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
import { TaskManagement } from "@/src/components/settings/TaskManagement";

export default function SettingsPage() {
    const router = useRouter();
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isChangingDevice, setIsChangingDevice] = useState(false);
    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

    // User & Page State
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isCreatePageOpen, setIsCreatePageOpen] = useState(false);
    const [createPageData, setCreatePageData] = useState({ handle: "", bio: "" });

    // Invitations State
    const [isCreatingInvitation, setIsCreatingInvitation] = useState(false);
    const [expandedInvitation, setExpandedInvitation] = useState<string | null>(null);
    const [invitationDialogOpen, setInvitationDialogOpen] = useState(false);
    const [editingInvitation, setEditingInvitation] = useState<any>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(null);
    const [newInvitation, setNewInvitation] = useState({
        title: "",
        description: "",
        type: "OTHER",
        date: "",
        location: "",
        maxGuests: "",
        imageBase64: "", // Keep imageBase64
        paymentMethod: "Orange Money"
    });

    const calculateCost = () => {
        const baseCost = 2500;
        const guests = parseInt(newInvitation.maxGuests) || 0;
        const extraGuests = Math.max(0, guests - 20);
        const extraCost = extraGuests * 100;
        return baseCost + extraCost;
    };

    useEffect(() => {
        setUser(getUser());
    }, []);

    const { data: userPageData, mutate: mutateUserPage, isLoading: swrLoading } = useSWR(
        user ? '/api/user-page' : null,
        fetcher
    );

    const { data: invitationsData, mutate: mutateInvitations, isLoading: invitationsLoading } = useSWR(
        user ? '/api/invitations/list' : null,
        fetcher
    );

    const invitations = invitationsData?.invitations || [];

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                toast.error("L'image est trop volumineuse (Max 2MB).");
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewInvitation(prev => ({ ...prev, imageBase64: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCreateOrUpdateInvitation = async () => {
        if (!newInvitation.title || !newInvitation.date || !newInvitation.location) {
            toast.error("Veuillez remplir les champs obligatoires (Titre, Date, Lieu)");
            return;
        }

        const totalAmount = calculateCost();
        // Prompt for payment confirmation
        if (!confirm(`Montant total: ${totalAmount.toLocaleString()} FCFA. Confirmer le paiement via ${newInvitation.paymentMethod} ?`)) return;

        setIsCreatingInvitation(true);

        const url = editingInvitation
            ? `/api/invitations/${editingInvitation.token}/update`
            : "/api/invitations/create";

        const method = editingInvitation ? "PUT" : "POST";

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify({
                    ...newInvitation,
                    totalAmount,
                    paymentMethod: newInvitation.paymentMethod
                })
            });

            if (response.ok) {
                toast.success(editingInvitation ? "Invitation modifiée !" : "Invitation créée et facture envoyée !");
                mutateInvitations();
                setInvitationDialogOpen(false);
                setEditingInvitation(null);
                setNewInvitation({
                    title: "", description: "", type: "OTHER", date: "", location: "", maxGuests: "", imageBase64: "", paymentMethod: "Orange Money"
                });
            } else {
                const data = await response.json();
                toast.error(data.error || "Erreur lors de l'opération");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        } finally {
            setIsCreatingInvitation(false);
        }
    };

    const handleDeleteInvitation = async (token: string) => {
        try {
            const res = await fetch(`/api/invitations/${token}/delete`, {
                method: "DELETE",
                headers: { ...getAuthHeader() }
            });
            if (res.ok) {
                toast.success("Invitation supprimée");
                mutateInvitations();
                setDeleteConfirmOpen(null);
            } else {
                toast.error("Erreur lors de la suppression");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        }
    };

    // UI Helpers
    const openEditDialog = (inv: any) => {
        setEditingInvitation(inv);
        setNewInvitation({
            title: inv.title,
            description: inv.description || "",
            type: inv.type,
            date: new Date(inv.date).toISOString().slice(0, 16),
            location: inv.location,
            maxGuests: inv.maxGuests ? inv.maxGuests.toString() : "",
            imageBase64: inv.imageBase64 || "",
            paymentMethod: "Orange Money"
        });
        setInvitationDialogOpen(true);
    };

    const openCreateDialog = () => {
        setEditingInvitation(null);
        setNewInvitation({
            title: "", description: "", type: "OTHER", date: "", location: "", maxGuests: "", imageBase64: "", paymentMethod: "Orange Money"
        });
        setInvitationDialogOpen(true);
    };

    const copyLink = (token: string) => {
        const url = `${window.location.origin}/invite/${token}`;
        navigator.clipboard.writeText(url);
        toast.success("Lien copié !");
    };

    const toggleDetails = (id: string) => {
        setExpandedInvitation(expandedInvitation === id ? null : id);
    };

    const userPage = userPageData?.userPage;
    const isLoadingPage = swrLoading;

    const handleCreatePage = async () => {
        if (!createPageData.handle.startsWith("@")) {
            toast.error("Le nom d'utilisateur doit commencer par @");
            return;
        }

        try {
            const response = await fetch("/api/user-page", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify(createPageData),
            });

            if (response.ok) {
                const data = await response.json();
                mutateUserPage();
                setIsCreatePageOpen(false);
                toast.success("Page créée avec succès !");
            } else {
                const data = await response.json();
                toast.error(data.error || "Erreur lors de la création de la page");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        }
    };

    const handleLogout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            clearAuth(); // Clear token and user data
            toast.success("Déconnexion réussie.");
            router.push("/login");
        } catch (error) {
            toast.error("Erreur lors de la déconnexion");
        }
    };

    const handleChangePassword = async () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error("Les mots de passe ne correspondent pas");
            return;
        }

        if (passwordData.newPassword.length < 8) {
            toast.error("Le mot de passe doit contenir au moins 8 caractères");
            return;
        }

        try {
            const response = await fetch("/api/users/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword: passwordData.currentPassword,
                    newPassword: passwordData.newPassword,
                }),
            });

            if (response.ok) {
                toast.success("Mot de passe modifié avec succès");
                setIsChangingPassword(false);
                setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
            } else {
                const data = await response.json();
                toast.error(data.error || "Erreur lors du changement de mot de passe");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        }
    };

    const handleChangeDevice = async () => {
        if (!confirm("Êtes-vous sûr de vouloir changer d'appareil ? Vous serez déconnecté.")) {
            return;
        }

        try {
            const response = await fetch("/api/users/device", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reset" }),
            });

            if (response.ok) {
                toast.success("Appareil réinitialisé. Vous pouvez maintenant vous connecter depuis un nouvel appareil.");
                handleLogout();
            } else {
                toast.error("Erreur lors du changement d'appareil");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        }
    };

    const handleDeleteAccount = async () => {
        const confirmation = prompt(
            'Pour confirmer la suppression de votre compte, tapez "SUPPRIMER" (en majuscules):'
        );

        if (confirmation !== "SUPPRIMER") {
            toast.error("Suppression annulée");
            return;
        }

        try {
            const response = await fetch("/api/users/delete", {
                method: "DELETE",
            });

            if (response.ok) {
                toast.success("Compte supprimé avec succès");
                router.push("/");
            } else {
                toast.error("Erreur lors de la suppression du compte");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        }
    };

    return (
        <div className="p-4 space-y-6 pt-16 pb-20">
            <h2 className="text-xl font-bold px-2 text-foreground">Paramètres</h2>

            <div className="flex items-center p-4 bg-card rounded-xl border border-border">
                <Avatar className="h-16 w-16">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.name || 'User'}`} />
                    <AvatarFallback>{user?.name?.substring(0, 2).toUpperCase() || 'JD'}</AvatarFallback>
                </Avatar>
                <div className="ml-4 flex-1">
                    <h3 className="font-semibold text-lg text-foreground">{user?.name || 'Chargement...'}</h3>
                    <p className="text-sm text-muted-foreground">{user?.email || '...'}</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Public Page Section */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-sm uppercase text-muted-foreground font-bold">Page Publique</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isLoadingPage ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                    <Skeleton className="h-8 w-16" />
                                </div>
                            </div>
                        ) : userPage ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                    <div>
                                        <p className="font-medium text-foreground">{userPage.handle}</p>
                                        <p className="text-xs text-muted-foreground">{userPage.bio || "Pas de bio"}</p>
                                    </div>
                                    <Button onClick={() => router.push("/chat/my-page")} size="sm" variant="secondary">
                                        Gérer
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Dialog open={isCreatePageOpen} onOpenChange={setIsCreatePageOpen}>
                                <DialogTrigger asChild>
                                    <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white">
                                        <User className="mr-2 h-4 w-4" /> Créer ma Page Publique
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-card border-border text-foreground">
                                    <DialogHeader>
                                        <DialogTitle>Créer votre Page</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 pt-4">
                                        <div>
                                            <Label htmlFor="handle">Nom d'utilisateur (commence par @)</Label>
                                            <Input
                                                id="handle"
                                                placeholder="@monnom"
                                                value={createPageData.handle}
                                                onChange={(e) => setCreatePageData({ ...createPageData, handle: e.target.value })}
                                                className="bg-muted border-border"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="bio">Biographie</Label>
                                            <Input
                                                id="bio"
                                                placeholder="Petite description..."
                                                value={createPageData.bio}
                                                onChange={(e) => setCreatePageData({ ...createPageData, bio: e.target.value })}
                                                className="bg-muted border-border"
                                            />
                                        </div>
                                        <Button onClick={handleCreatePage} className="w-full">
                                            Créer la page
                                        </Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-sm uppercase text-muted-foreground font-bold">Sécurité</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Change Password Dialog */}
                        <Dialog open={isChangingPassword} onOpenChange={setIsChangingPassword}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full justify-start border-border hover:bg-muted text-foreground">
                                    <Shield className="mr-2 h-4 w-4" /> Changer de Mot de Passe
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-card border-border text-foreground">
                                <DialogHeader>
                                    <DialogTitle>Changer le Mot de Passe</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-4">
                                    <div>
                                        <Label htmlFor="current">Mot de passe actuel</Label>
                                        <Input
                                            id="current"
                                            type="password"
                                            value={passwordData.currentPassword}
                                            onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                            className="bg-muted border-border"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="new">Nouveau mot de passe</Label>
                                        <Input
                                            id="new"
                                            type="password"
                                            value={passwordData.newPassword}
                                            onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                            className="bg-muted border-border"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                                        <Input
                                            id="confirm"
                                            type="password"
                                            value={passwordData.confirmPassword}
                                            onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                            className="bg-muted border-border"
                                        />
                                    </div>
                                    <Button onClick={handleChangePassword} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                                        Modifier
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>

                        {/* Change Device */}
                        <Button
                            onClick={handleChangeDevice}
                            variant="outline"
                            className="w-full justify-start border-border hover:bg-muted text-foreground"
                        >
                            <Smartphone className="mr-2 h-4 w-4" /> Changer d'Appareil
                        </Button>
                    </CardContent>
                </Card>



                {/* Tâches */}
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold px-2 flex items-center gap-2">
                        <ListTodo className="h-4 w-4" />
                        Tâches
                    </h2>
                    <TaskManagement />
                </div>

                {/* Invitations Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold">Mes Invitations</h2>
                        <Dialog open={invitationDialogOpen} onOpenChange={setInvitationDialogOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={openCreateDialog} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                                    <Plus className="mr-2 h-4 w-4" /> Nouvelle Invitation
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-card border-border text-foreground max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>{editingInvitation ? "Modifier l'invitation" : "Créer une invitation"}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    {/* Image Upload */}
                                    <div className="flex items-center justify-center w-full">
                                        <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80 border-border">
                                            {newInvitation.imageBase64 ? (
                                                <img src={newInvitation.imageBase64} alt="Preview" className="h-full object-contain" />
                                            ) : (
                                                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-muted-foreground">
                                                    <Upload className="w-8 h-8 mb-2" />
                                                    <p className="text-sm">Cliquez pour ajouter une image (Max 2MB)</p>
                                                </div>
                                            )}
                                            <input id="dropzone-file" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                        </label>
                                    </div>

                                    {/* Form Fields */}
                                    <div className="grid gap-2">
                                        <Label>Titre de l'événement *</Label>
                                        <Input value={newInvitation.title} onChange={(e) => setNewInvitation({ ...newInvitation, title: e.target.value })} placeholder="Ex: Mariage de Paul & Sophie" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Type</Label>
                                            <Select value={newInvitation.type} onValueChange={(val) => setNewInvitation({ ...newInvitation, type: val })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="WEDDING">Mariage</SelectItem>
                                                    <SelectItem value="DINNER">Dîner</SelectItem>
                                                    <SelectItem value="BIRTHDAY">Anniversaire</SelectItem>
                                                    <SelectItem value="PARTY">Fête</SelectItem>
                                                    <SelectItem value="OTHER">Autre</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Date & Heure *</Label>
                                            <Input type="datetime-local" value={newInvitation.date} onChange={(e) => setNewInvitation({ ...newInvitation, date: e.target.value })} />
                                        </div>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>Lieu *</Label>
                                        <Input value={newInvitation.location} onChange={(e) => setNewInvitation({ ...newInvitation, location: e.target.value })} placeholder="Ex: Hôtel Ivoire, Abidjan" />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>Description</Label>
                                        <Textarea value={newInvitation.description} onChange={(e) => setNewInvitation({ ...newInvitation, description: e.target.value })} placeholder="Détails supplémentaires..." />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>Limite d'invités (Optionnel)</Label>
                                        <Input type="number" value={newInvitation.maxGuests} onChange={(e) => setNewInvitation({ ...newInvitation, maxGuests: e.target.value })} placeholder="Ex: 50" />
                                        <p className="text-xs text-muted-foreground">Au-delà de 20 invités, supplément de 100 F par invité.</p>
                                    </div>

                                    {/* Billing Section */}
                                    <div className="bg-muted/50 p-3 rounded-lg border border-border space-y-2">
                                        <div className="flex justify-between items-center text-sm font-medium">
                                            <span>Coût Total :</span>
                                            <span className="text-primary text-lg">{calculateCost().toLocaleString()} FCFA</span>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs">Moyen de Paiement</Label>
                                            <Select value={newInvitation.paymentMethod} onValueChange={(val) => setNewInvitation({ ...newInvitation, paymentMethod: val })}>
                                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Orange Money">Orange Money</SelectItem>
                                                    <SelectItem value="Moov Money">Moov Money</SelectItem>
                                                    <SelectItem value="Wave">Wave</SelectItem>
                                                    <SelectItem value="Carte Bancaire">Carte Bancaire</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <Button onClick={handleCreateOrUpdateInvitation} disabled={isCreatingInvitation} className="w-full">
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        {isCreatingInvitation ? "Traitement..." : (editingInvitation ? "Payer et Mettre à jour" : "Payer et Créer")}
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    {/* Invitations List */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {invitationsLoading ? (
                            [1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)
                        ) : invitationsData?.invitations?.length > 0 ? (
                            invitationsData.invitations.map((inv: any) => (
                                <Card key={inv.id} className="relative overflow-hidden hover:shadow-md transition-shadow">
                                    <div className="absolute top- right-2 flex gap-1 bg-background/80 rounded-lg p-1 backdrop-blur-sm z-10 shadow-sm">
                                        <Dialog open={deleteConfirmOpen === inv.token} onOpenChange={(open) => setDeleteConfirmOpen(open ? inv.token : null)}>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Supprimer l'invitation ?</DialogTitle>
                                                </DialogHeader>
                                                <div className="py-4">
                                                    Cette action est irréversible. Le lien ne fonctionnera plus.
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" onClick={() => setDeleteConfirmOpen(null)}>Annuler</Button>
                                                    <Button variant="destructive" onClick={() => handleDeleteInvitation(inv.token)}>Supprimer</Button>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={() => openEditDialog(inv)}>
                                            <Edit className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                    <div className="h-24 bg-muted w-full relative">
                                        {inv.imageBase64 ? (
                                            <img src={inv.imageBase64} className="w-full h-full object-cover" alt="Cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                                                <Mail className="h-8 w-8 text-gray-400" />
                                            </div>
                                        )}
                                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-black/50 text-white backdrop-blur-md">
                                            {inv.type}
                                        </div>
                                    </div>
                                    <CardHeader className="pb-2 pt-3 px-4">
                                        <CardTitle className="text-base line-clamp-1">{inv.title}</CardTitle>
                                        <p className="text-xs text-muted-foreground">{new Date(inv.date).toLocaleDateString()} • {inv.location}</p>
                                    </CardHeader>
                                    <CardContent className="px-4 pb-4">
                                        <div className="flex justify-between items-center text-sm mt-1">
                                            <div className="flex items-center space-x-2">
                                                <p className="text-muted-foreground flex items-center text-xs">
                                                    <Users className="h-3 w-3 mr-1" />
                                                    <span className="font-semibold text-foreground mr-1">{inv._count?.guests || 0}</span>
                                                    {inv.maxGuests ? `/ ${inv.maxGuests}` : 'invités'}
                                                </p>
                                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleDetails(inv.id)}>
                                                    <Users className={`h-3 w-3 ${expandedInvitation === inv.id ? "text-primary fill-primary" : ""}`} />
                                                </Button>
                                            </div>
                                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copyLink(inv.token)}>
                                                Copier
                                            </Button>
                                        </div>
                                        {expandedInvitation === inv.id && (
                                            <div className="mt-3 pt-3 border-t border-border/50 text-sm max-h-40 overflow-y-auto">
                                                <p className="font-semibold mb-2 text-xs uppercase text-muted-foreground">Liste des invités :</p>
                                                {inv.guests && inv.guests.length > 0 ? (
                                                    <ul className="space-y-2">
                                                        {inv.guests.map((guest: any) => (
                                                            <li key={guest.id} className="flex justify-between items-center text-xs bg-muted/30 p-2 rounded">
                                                                <span className="font-medium">{guest.name}</span>
                                                                <span className="text-muted-foreground">{guest.phone}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground italic">Aucun invité confimé pour le moment.</p>
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))
                        ) : (
                            <div className="col-span-full text-center py-10 text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border">
                                <Mail className="mx-auto h-10 w-10 opacity-20 mb-2" />
                                <p>Aucune invitation créée</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions Section */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-sm uppercase text-muted-foreground font-bold">Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button onClick={handleLogout} variant="ghost" className="w-full justify-start text-foreground hover:text-foreground hover:bg-muted">
                            <LogOut className="mr-2 h-4 w-4" /> Déconnexion
                        </Button>
                        <Button onClick={handleDeleteAccount} variant="ghost" className="w-full justify-start text-destructive hover:text-destructive/80 hover:bg-destructive/10">
                            <Trash2 className="mr-2 h-4 w-4" /> Supprimer mon Compte
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div >
    );
}
