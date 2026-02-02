"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Users, MapPin, Ban, CheckCircle, Search, Globe } from "lucide-react";
import { toast } from "sonner";

interface User {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    role: string;
    isVerified: boolean;
    isBanned: boolean;
    isOnline: boolean;
    lastSeen: Date | null;
    allowedCountry: string | null;
    location: any;
    currentLocation: any;
    deviceInfo: any;
    createdAt: Date;
    canPublishNotifications: boolean;
}

interface Stats {
    totalUsers: number;
    onlineUsers: number;
    bannedUsers: number;
    verifiedUsers: number;
}

export default function AdminDashboard() {
    const [users, setUsers] = useState<User[]>([]);
    const [stats, setStats] = useState<Stats>({
        totalUsers: 0,
        onlineUsers: 0,
        bannedUsers: 0,
        verifiedUsers: 0,
    });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [countryFilter, setCountryFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "banned">("all");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        fetchUsers();
    }, [page, countryFilter, statusFilter]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: "20",
            });

            if (countryFilter) params.append("country", countryFilter);
            if (statusFilter !== "all") params.append("status", statusFilter);

            const response = await fetch(`/api/admin/users?${params}`);
            const data = await response.json();

            if (response.ok) {
                setUsers(data.users);
                setTotalPages(data.pagination.totalPages);

                // Calculate stats
                setStats({
                    totalUsers: data.pagination.total,
                    onlineUsers: data.users.filter((u: User) => u.isOnline).length,
                    bannedUsers: data.users.filter((u: User) => u.isBanned).length,
                    verifiedUsers: data.users.filter((u: User) => u.isVerified).length,
                });
            }
        } catch (error) {
            toast.error("Erreur lors du chargement des utilisateurs");
        } finally {
            setLoading(false);
        }
    };

    const handleUserAction = async (userId: string, action: string, value?: any) => {
        try {
            const response = await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, action, value }),
            });

            if (response.ok) {
                toast.success("Action effectuée avec succès");
                fetchUsers();
            } else {
                toast.error("Erreur lors de l'action");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        }
    };

    const filteredUsers = users.filter((user) =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Tableau de Bord Admin
                    </h1>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-slate-400">Total Utilisateurs</CardTitle>
                            <Users className="h-4 w-4 text-blue-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalUsers}</div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-slate-400">En Ligne</CardTitle>
                            <CheckCircle className="h-4 w-4 text-green-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-400">{stats.onlineUsers}</div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-slate-400">Bannis</CardTitle>
                            <Ban className="h-4 w-4 text-red-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-400">{stats.bannedUsers}</div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-slate-400">Vérifiés</CardTitle>
                            <Globe className="h-4 w-4 text-purple-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-purple-400">{stats.verifiedUsers}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                        <CardTitle>Filtres</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-4 flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                                <Input
                                    placeholder="Rechercher par email ou nom..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-slate-800 border-slate-700"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant={statusFilter === "all" ? "default" : "outline"}
                                    onClick={() => setStatusFilter("all")}
                                    className="border-slate-700"
                                >
                                    Tous
                                </Button>
                                <Button
                                    variant={statusFilter === "online" ? "default" : "outline"}
                                    onClick={() => setStatusFilter("online")}
                                    className="border-slate-700"
                                >
                                    En ligne
                                </Button>
                                <Button
                                    variant={statusFilter === "offline" ? "default" : "outline"}
                                    onClick={() => setStatusFilter("offline")}
                                    className="border-slate-700"
                                >
                                    Hors ligne
                                </Button>
                                <Button
                                    variant={statusFilter === "banned" ? "default" : "outline"}
                                    onClick={() => setStatusFilter("banned")}
                                    className="border-slate-700"
                                >
                                    Bannis
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Users Table */}
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                        <CardTitle>Utilisateurs</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-center py-8 text-slate-400">Chargement...</div>
                        ) : (
                            <div className="space-y-4">
                                {filteredUsers.map((user) => (
                                    <div
                                        key={user.id}
                                        className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold">{user.name || "Sans nom"}</h3>
                                                {user.isOnline && (
                                                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                                        En ligne
                                                    </Badge>
                                                )}
                                                {user.isBanned && (
                                                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                                        Banni
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-400">{user.email}</p>
                                            <div className="flex gap-4 mt-2 text-xs text-slate-500">
                                                <span>Pays: {user.allowedCountry || "N/A"}</span>
                                                <span>Rôle: {user.role}</span>
                                                {user.currentLocation && (
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="h-3 w-3" />
                                                        GPS actif
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            {!user.isBanned ? (
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => handleUserAction(user.id, "ban")}
                                                >
                                                    Bannir
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleUserAction(user.id, "unban")}
                                                    className="border-green-500 text-green-400"
                                                >
                                                    Débannir
                                                </Button>
                                            )}
                                            {!user.canPublishNotifications && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleUserAction(user.id, "grant-publish")}
                                                    className="border-slate-600"
                                                >
                                                    Autoriser Annonces
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Pagination */}
                        <div className="flex justify-center gap-2 mt-6">
                            <Button
                                variant="outline"
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                                className="border-slate-700"
                            >
                                Précédent
                            </Button>
                            <span className="flex items-center px-4 text-slate-400">
                                Page {page} sur {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                disabled={page === totalPages}
                                onClick={() => setPage(page + 1)}
                                className="border-slate-700"
                            >
                                Suivant
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
