"use client";

import { useState } from "react";
import { LogOut, Trash2, Smartphone, Shield, User, Upload } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { clearAuth } from "@/src/lib/auth-client";

export default function SettingsPage() {
    const router = useRouter();
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isChangingDevice, setIsChangingDevice] = useState(false);
    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

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
        <div className="p-4 space-y-6 pt-16">
            <h2 className="text-xl font-bold px-2 text-foreground">Paramètres</h2>

            <div className="flex items-center p-4 bg-card rounded-xl border border-border">
                <Avatar className="h-16 w-16">
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div className="ml-4 flex-1">
                    <h3 className="font-semibold text-lg text-foreground">Jean Dupont</h3>
                    <p className="text-sm text-muted-foreground">jean@exemple.com</p>
                </div>
                <Button variant="outline" size="icon" className="border-border">
                    <Upload className="h-4 w-4" />
                </Button>
            </div>

            <div className="space-y-4">
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
        </div>
    );
}
