"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/src/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/src/components/ui/dialog";
import {
    Users,
    Search,
    MapPin,
    Ban,
    CheckCircle,
    Globe,
    FileText,
    Building2,
    Settings,
    CreditCard,
    Trash2,
    Eye,
    Mail,
    Phone,
    Activity,
    LogOut,
    MessageSquare,
} from "lucide-react";
import { fetchWithAuth, clearAuth } from "@/src/lib/auth-client";
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
    _count?: { sentMessages: number; orgMemberships: number; deptMemberships: number };
}

interface UserDetails {
    user: User & {
        _count: {
            sentMessages: number;
            orgMemberships: number;
            deptMemberships: number;
            notifications: number;
            invitations: number;
            personalTasks: number;
            financialGoals: number;
            publishedAnnouncements: number;
            createdTasks: number;
            assignedTasks: number;
            createdMeetings: number;
            createdPolls: number;
            createdDecisions: number;
            likes: number;
            comments: number;
            followers: number;
            following: number;
        };
    };
    organizations: Array<{ org: any; role: string }>;
}

interface Stats {
    totalUsers: number;
    onlineUsers: number;
    bannedUsers: number;
    verifiedUsers: number;
}

interface PaymentOrder {
    id: string;
    userId: string;
    plan: string;
    name: string;
    amountFcfa: number;
    status: string;
    createdAt: string;
    user?: { email: string; name: string | null };
}

interface Organization {
    id: string;
    name: string;
    code: string;
    address?: string | null;
    logo?: string | null;
    isSuspended: boolean;
    createdAt: string;
    ownerId: string;
    subscription?: { plan: string; isActive: boolean; maxDepartments: number; maxMembersPerDept: number };
    _count: { members: number; departments: number; events?: number };
    owner?: { email: string; name: string | null; phone?: string };
}

interface OrgDetails {
    organization: Organization & {
        members: Array<{
            user: { id: string; email: string; name: string | null; phone: string | null; isOnline: boolean; lastSeen: Date | null };
            role: string;
        }>;
        departments: Array<{
            id: string;
            name: string;
            _count: { members: number; tasks: number };
            head?: { name: string | null; email: string };
        }>;
        events: Array<{ id: string; title: string; eventDate: string; maxAttendees: number }>;
    };
    owner: { id: string; email: string; name: string | null; phone: string | null; isOnline: boolean; lastSeen: Date | null };
}

interface AdminStats {
    totalUsers: number;
    totalOrgs: number;
    pendingOrders: number;
    activeSubscriptions: number;
    onlineUsers?: number;
}

interface PerformanceStats {
    onlineUsers: number;
    pushSubscriptions: number;
    notificationsLast24h: number;
    messagesLast24h: number;
    notificationsUnread: number;
    redisAvailable: boolean;
    timestamp: string;
}

/** Extrait lat/lng de location ou currentLocation */
function getCoords(loc: { latitude?: number; longitude?: number } | null | undefined): { lat: number; lng: number } | null {
    if (!loc || typeof loc !== "object") return null;
    const lat = (loc as any).latitude ?? (loc as any).lat;
    const lng = (loc as any).longitude ?? (loc as any).lng;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    return { lat, lng };
}

/** Carte mini OpenStreetMap */
function LocationMap({ lat, lng, city, label }: { lat: number; lng: number; city?: string; label?: string }) {
    const delta = 0.01;
    const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
    const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
    const linkUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
    return (
        <div className="rounded-lg overflow-hidden border border-neutral-200">
            {label && <p className="text-xs font-medium text-neutral-500 px-2 py-1 bg-neutral-50">{label}</p>}
            <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
                <iframe
                    title="Position"
                    src={embedUrl}
                    className="w-full h-40 sm:h-48 border-0"
                    allowFullScreen
                />
            </a>
            <div className="px-2 py-1.5 text-xs text-neutral-500 bg-neutral-50">
                {lat.toFixed(5)}, {lng.toFixed(5)}
                {city && ` • ${city}`}
            </div>
        </div>
    );
}

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2 border-b border-neutral-200 last:border-0">
        <span className="text-sm font-medium text-neutral-500 min-w-[140px]">{label}</span>
        <span className="text-sm text-neutral-900">{value ?? "—"}</span>
    </div>
);

export default function AdminDashboard() {
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [stats, setStats] = useState<Stats>({
        totalUsers: 0,
        onlineUsers: 0,
        bannedUsers: 0,
        verifiedUsers: 0,
    });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [orgSearchQuery, setOrgSearchQuery] = useState("");
    const [countryFilter, setCountryFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "banned">("all");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [orders, setOrders] = useState<PaymentOrder[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [paymentMode, setPaymentMode] = useState<string>("CINETPAY");
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [orgsLoading, setOrgsLoading] = useState(false);
    const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
    const [activeTab, setActiveTab] = useState("users");

    // Modals
    const [userDetail, setUserDetail] = useState<UserDetails | null>(null);
    const [userDetailLoading, setUserDetailLoading] = useState(false);
    const [orgDetail, setOrgDetail] = useState<OrgDetails | null>(null);
    const [orgDetailLoading, setOrgDetailLoading] = useState(false);
    const [deleteUser, setDeleteUser] = useState<User | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
    const [deletingOrg, setDeletingOrg] = useState(false);

    const [showAllUsers, setShowAllUsers] = useState(false);
    const [orgsLoaded, setOrgsLoaded] = useState(false); // true après clic sur "Afficher les organisations" ou après recherche
    const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
    const [performanceLoading, setPerformanceLoading] = useState(false);

    // Charger les users: recherche (min 2 car.) ou "afficher tous" (all=1)
    useEffect(() => {
        if (activeTab !== "users") return;
        if (!showAllUsers && searchQuery.trim().length < 2) {
            setUsers([]);
            setTotalPages(0);
            return;
        }
        fetchUsers();
    }, [activeTab, searchQuery, page, countryFilter, statusFilter, showAllUsers]);

    useEffect(() => {
        if (activeTab === "orders") fetchOrders();
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === "settings") fetchPaymentMode();
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === "performance") fetchPerformance();
    }, [activeTab]);

    const fetchPerformance = async () => {
        setPerformanceLoading(true);
        try {
            const res = await fetchWithAuth("/api/admin/performance");
            const data = await res.json();
            if (res.ok) setPerformanceStats(data);
        } catch {
            toast.error("Erreur chargement des performances");
        } finally {
            setPerformanceLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchWithAuth("/api/admin/stats")
            .then((r) => r.json())
            .then((d) => setAdminStats(d))
            .catch(() => { });
    }, []);

    const fetchOrganizations = async (search?: string) => {
        setOrgsLoading(true);
        try {
            const q = search !== undefined ? search : orgSearchQuery.trim();
            const params = q.length >= 2 ? `?search=${encodeURIComponent(q)}` : "";
            const res = await fetchWithAuth(`/api/admin/organizations${params}`);
            const data = await res.json();
            if (res.ok) {
                setOrganizations(data.organizations || []);
                setOrgsLoaded(true);
            }
        } catch {
            toast.error("Erreur chargement des organisations");
        } finally {
            setOrgsLoading(false);
        }
    };

    const fetchOrders = async () => {
        setOrdersLoading(true);
        try {
            const res = await fetchWithAuth("/api/admin/payment-orders");
            const data = await res.json();
            if (res.ok) setOrders(data.orders || []);
        } catch {
            toast.error("Erreur chargement des ordres");
        } finally {
            setOrdersLoading(false);
        }
    };

    const fetchPaymentMode = async () => {
        try {
            const res = await fetchWithAuth("/api/admin/payment-mode");
            const data = await res.json();
            if (res.ok) setPaymentMode(data.mode || "CINETPAY");
        } catch { /* ignore */ }
    };

    const handleOrderAction = async (orderId: string, action: "approve" | "reject") => {
        try {
            const res = await fetchWithAuth(`/api/admin/payment-orders/${orderId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            if (res.ok) {
                toast.success(action === "approve" ? "Ordre approuvé, organisation créée" : "Ordre rejeté");
                fetchOrders();
            } else {
                toast.error("Erreur");
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const handleLogout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            clearAuth();
            toast.success("Déconnexion réussie.");
            router.push("/login");
        } catch {
            toast.error("Erreur lors de la déconnexion");
        }
    };

    const handlePaymentModeChange = async (mode: string) => {
        try {
            const res = await fetchWithAuth("/api/admin/payment-mode", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode }),
            });
            if (res.ok) {
                setPaymentMode(mode);
                toast.success(`Mode de paiement: ${mode === "CINETPAY" ? "CinetPay (en ligne)" : "Manuel (ordre)"}`);
            } else {
                toast.error("Erreur");
            }
        } catch {
            toast.error("Erreur réseau");
        }
    };

    const fetchUsers = async () => {
        if (!showAllUsers && searchQuery.trim().length < 2) return;
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: "30",
            });
            if (showAllUsers) params.append("all", "1");
            if (searchQuery.trim().length >= 2) params.append("search", searchQuery.trim());
            if (countryFilter) params.append("country", countryFilter);
            if (statusFilter !== "all") params.append("status", statusFilter);

            const response = await fetchWithAuth(`/api/admin/users?${params}`);
            const data = await response.json();

            if (response.ok) {
                setUsers(data.users);
                setTotalPages(data.pagination?.totalPages ?? 1);
                setStats({
                    totalUsers: data.pagination?.total ?? 0,
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

    const handleDeleteOrg = async () => {
        if (!deleteOrg) return;
        setDeletingOrg(true);
        try {
            const res = await fetchWithAuth(`/api/admin/organizations/${deleteOrg.id}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                toast.success("Organisation supprimée");
                setDeleteOrg(null);
                setOrgDetail(null);
                fetchOrganizations();
            } else {
                toast.error(data.error || "Erreur lors de la suppression");
            }
        } catch {
            toast.error("Erreur réseau");
        } finally {
            setDeletingOrg(false);
        }
    };

    const handleUserAction = async (userId: string, action: string, value?: any) => {
        try {
            const response = await fetchWithAuth("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, action, value }),
            });

            if (response.ok) {
                toast.success("Action effectuée avec succès");
                fetchUsers();
                if (userDetail?.user.id === userId) setUserDetail(null);
            } else {
                toast.error("Erreur lors de l'action");
            }
        } catch (error) {
            toast.error("Erreur réseau");
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteUser) return;
        setDeleting(true);
        try {
            const res = await fetchWithAuth(`/api/admin/users/${deleteUser.id}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                toast.success("Utilisateur supprimé");
                setDeleteUser(null);
                setUserDetail(null);
                fetchUsers();
            } else {
                toast.error(data.error || "Erreur lors de la suppression");
            }
        } catch {
            toast.error("Erreur réseau");
        } finally {
            setDeleting(false);
        }
    };

    const openUserDetail = async (user: User) => {
        setUserDetailLoading(true);
        setUserDetail(null);
        try {
            const res = await fetchWithAuth(`/api/admin/users/${user.id}`);
            const data = await res.json();
            if (res.ok) setUserDetail(data);
        } catch {
            toast.error("Erreur chargement des détails");
        } finally {
            setUserDetailLoading(false);
        }
    };

    const openOrgDetail = async (org: Organization) => {
        setOrgDetailLoading(true);
        setOrgDetail(null);
        try {
            const res = await fetchWithAuth(`/api/admin/organizations/${org.id}`);
            const data = await res.json();
            if (res.ok) setOrgDetail(data);
        } catch {
            toast.error("Erreur chargement des détails");
        } finally {
            setOrgDetailLoading(false);
        }
    };

    const navItems: Array<{
        id: "users" | "organizations" | "orders" | "performance" | "settings";
        icon: typeof Users;
        label: string;
        count?: number;
        subCount?: number;
        pending?: boolean;
    }> = [
        { id: "users", icon: Users, label: "Utilisateurs", count: adminStats?.totalUsers, subCount: adminStats?.onlineUsers },
        { id: "organizations", icon: Building2, label: "Organisations", count: adminStats?.totalOrgs },
        { id: "orders", icon: CreditCard, label: "Ordres", count: orders.filter((o) => o.status === "PENDING").length, pending: true },
        { id: "performance", icon: Activity, label: "Performances" },
        { id: "settings", icon: Settings, label: "Paramètres" },
    ];

    return (
        <div className="min-h-screen bg-neutral-950 text-white">
            {/* Nav bar fixe */}
            <nav className="sticky top-0 z-50 bg-neutral-950/95 backdrop-blur border-b border-neutral-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white shrink-0">
                            Tableau de Bord Kephale
                        </h1>
                        <div className="flex items-center gap-1 sm:gap-2">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={`relative flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors ${
                                        activeTab === item.id
                                            ? "bg-white text-black"
                                            : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                                    }`}
                                    title={item.label}
                                >
                                    <item.icon className="w-5 h-5 shrink-0" />
                                    <span className="text-xs sm:text-sm font-medium hidden sm:inline">{item.label}</span>
                                    {item.count != null && item.id !== "orders" && (
                                        <span className="text-xs font-bold">{item.count}</span>
                                    )}
                                    {item.id === "orders" && (
                                        <span className={`text-xs font-bold ${(item.count ?? 0) > 0 ? "text-amber-400" : ""}`}>
                                            {item.count ?? 0}
                                        </span>
                                    )}
                                    {item.subCount != null && (
                                        <span className="text-[10px] text-green-400 hidden lg:inline">({item.subCount})</span>
                                    )}
                                    {item.pending && (item.count ?? 0) > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Recherche utilisateurs (visible sur onglet Users) */}
                    {activeTab === "users" && (
                        <div className="flex flex-col sm:flex-row gap-3 pb-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                                <Input
                                    placeholder={showAllUsers ? "Filtrer par email ou nom..." : "Rechercher par email ou nom (min. 2 caractères)..."}
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                                    className="pl-10 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
                                <SelectTrigger className="w-full sm:w-[180px] bg-neutral-900 border-neutral-700 text-white">
                                    <SelectValue placeholder="Statut" />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-700">
                                    <SelectItem value="all" className="text-white focus:bg-neutral-800">Tous</SelectItem>
                                    <SelectItem value="online" className="text-white focus:bg-neutral-800">En ligne</SelectItem>
                                    <SelectItem value="offline" className="text-white focus:bg-neutral-800">Hors ligne</SelectItem>
                                    <SelectItem value="banned" className="text-white focus:bg-neutral-800">Bannis</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                variant={showAllUsers ? "default" : "outline"}
                                className={showAllUsers ? "bg-white text-black hover:bg-neutral-200" : "border-neutral-600"}
                                onClick={() => { setShowAllUsers(!showAllUsers); setPage(1); }}
                            >
                                <Users className="w-4 h-4 mr-2" />
                                {showAllUsers ? "Tous les utilisateurs" : "Afficher tous"}
                            </Button>
                        </div>
                    )}
                    {/* Organisations : pas de chargement auto, bouton + recherche */}
                    {activeTab === "organizations" && (
                        <div className="flex flex-col sm:flex-row gap-3 pb-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                                <Input
                                    placeholder="Rechercher par nom ou code (min. 2 caractères)..."
                                    value={orgSearchQuery}
                                    onChange={(e) => setOrgSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && orgSearchQuery.trim().length >= 2 && fetchOrganizations(orgSearchQuery.trim())}
                                    className="pl-10 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
                                />
                            </div>
                            <Button variant="outline" className="border-neutral-600" onClick={() => fetchOrganizations("")}>
                                Afficher les organisations
                            </Button>
                            {orgSearchQuery.trim().length >= 2 && (
                                <Button variant="default" className="bg-white text-black hover:bg-neutral-200" onClick={() => fetchOrganizations(orgSearchQuery.trim())}>
                                <Search className="w-4 h-4 mr-2" />
                                Rechercher
                            </Button>
                            )}
                        </div>
                    )}
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">

                    {/* Settings */}
                    <TabsContent value="settings" className="mt-4">
                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white">Mode de paiement des abonnements</CardTitle>
                                <p className="text-sm text-neutral-400">Choisissez comment les utilisateurs paient pour créer une organisation</p>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-wrap gap-3">
                                    <Button
                                        variant={paymentMode === "CINETPAY" ? "default" : "outline"}
                                        onClick={() => handlePaymentModeChange("CINETPAY")}
                                        className="border-neutral-600 data-[variant=default]:bg-white data-[variant=default]:text-black"
                                    >
                                        <Globe className="w-4 h-4 mr-2" />
                                        CinetPay
                                    </Button>
                                    <Button
                                        variant={paymentMode === "MANUAL" ? "default" : "outline"}
                                        onClick={() => handlePaymentModeChange("MANUAL")}
                                        className="border-neutral-600 data-[variant=default]:bg-white data-[variant=default]:text-black"
                                    >
                                        <FileText className="w-4 h-4 mr-2" />
                                        Manuel
                                    </Button>
                                </div>
                                <p className="text-xs text-neutral-500">
                                    Mode actuel: <strong>{paymentMode === "CINETPAY" ? "CinetPay" : "Manuel"}</strong>
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white">Navigation</CardTitle>
                                <p className="text-sm text-neutral-400">Retour au chat ou déconnexion</p>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Button asChild variant="outline" className="w-full justify-start bg-white text-black border-white hover:bg-neutral-200 hover:text-black">
                                    <Link href="/chat">
                                        <MessageSquare className="mr-2 h-4 w-4" /> Aller dans chat
                                    </Link>
                                </Button>
                                <Button onClick={handleLogout} variant="destructive" className="w-full justify-start bg-red-600 text-white hover:bg-red-700 hover:text-white">
                                    <LogOut className="mr-2 h-4 w-4" /> Déconnexion
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Orders */}
                    <TabsContent value="orders" className="mt-4">
                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white">Ordres de paiement en attente</CardTitle>
                                <p className="text-sm text-neutral-400">Validez ou rejetez les ordres pour créer les organisations</p>
                            </CardHeader>
                            <CardContent>
                                {ordersLoading ? (
                                    <div className="text-center py-8 text-neutral-400">Chargement...</div>
                                ) : orders.filter((o) => o.status === "PENDING").length === 0 ? (
                                    <div className="text-center py-8 text-neutral-400">Aucun ordre en attente</div>
                                ) : (
                                    <div className="space-y-4">
                                        {orders.filter((o) => o.status === "PENDING").map((order) => (
                                            <div key={order.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-neutral-800/50 rounded-lg border border-neutral-700">
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-white truncate">{order.name} • Plan {order.plan}</p>
                                                    <p className="text-sm text-neutral-400 truncate">
                                                        {order.user?.email || order.userId} • {order.amountFcfa?.toLocaleString("fr-FR")} FCFA
                                                    </p>
                                                    <p className="text-xs text-neutral-500">
                                                        {new Date(order.createdAt).toLocaleString("fr-FR")}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    <Button size="sm" variant="outline" className="border-red-500 text-red-400 hover:bg-red-500/10" onClick={() => handleOrderAction(order.id, "reject")}>
                                                        Rejeter
                                                    </Button>
                                                    <Button size="sm" className="bg-white text-black hover:bg-neutral-200" onClick={() => handleOrderAction(order.id, "approve")}>
                                                        Valider
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Performances / Ressources système */}
                    <TabsContent value="performance" className="mt-4">
                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <Activity className="w-5 h-5" />
                                    Performances et ressources
                                </CardTitle>
                                <p className="text-sm text-neutral-400">
                                    Utilisation en temps réel : présence, notifications, push, messages. Rafraîchir pour mettre à jour.
                                </p>
                            </CardHeader>
                            <CardContent>
                                {performanceLoading ? (
                                    <div className="text-center py-8 text-neutral-400">Chargement...</div>
                                ) : !performanceStats ? (
                                    <div className="text-center py-8 text-neutral-400">Aucune donnée</div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Utilisateurs en ligne</p>
                                            <p className="text-2xl font-bold text-green-400 mt-1">{performanceStats.onlineUsers}</p>
                                            <p className="text-xs text-neutral-500 mt-0.5">Présence Redis (heartbeat)</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Abonnements Push</p>
                                            <p className="text-2xl font-bold text-white mt-1">{performanceStats.pushSubscriptions}</p>
                                            <p className="text-xs text-neutral-500 mt-0.5">Appareils notifiables (Web Push)</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Notifications (24h)</p>
                                            <p className="text-2xl font-bold text-white mt-1">{performanceStats.notificationsLast24h}</p>
                                            <p className="text-xs text-neutral-500 mt-0.5">Créées dans les dernières 24h</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Messages (24h)</p>
                                            <p className="text-2xl font-bold text-white mt-1">{performanceStats.messagesLast24h}</p>
                                            <p className="text-xs text-neutral-500 mt-0.5">Envoyés dans les dernières 24h</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Notifications non lues</p>
                                            <p className="text-2xl font-bold text-amber-400 mt-1">{performanceStats.notificationsUnread}</p>
                                            <p className="text-xs text-neutral-500 mt-0.5">Total en base</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700 flex flex-col justify-center">
                                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Redis (présence)</p>
                                            <p className={`text-lg font-semibold mt-1 ${performanceStats.redisAvailable ? "text-green-400" : "text-red-400"}`}>
                                                {performanceStats.redisAvailable ? "Disponible" : "Indisponible"}
                                            </p>
                                            <p className="text-xs text-neutral-500 mt-0.5">
                                                {performanceStats.redisAvailable ? "Présence et appels en attente OK" : "Configurer UPSTASH_REDIS_*"}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {performanceStats && (
                                    <p className="text-xs text-neutral-500 mt-4">
                                        Dernière mise à jour : {new Date(performanceStats.timestamp).toLocaleString("fr-FR")}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Organizations */}
                    <TabsContent value="organizations" className="mt-4">
                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white">Organisations</CardTitle>
                                <p className="text-sm text-neutral-400">
                                    Cliquez sur &quot;Afficher les organisations&quot; pour charger la liste, ou recherchez par nom ou code.
                                </p>
                            </CardHeader>
                            <CardContent>
                                {!orgsLoaded && !orgsLoading ? (
                                    <div className="text-center py-12 text-neutral-500">
                                        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p className="font-medium">Aucune liste chargée</p>
                                        <p className="text-sm mt-1">Cliquez sur &quot;Afficher les organisations&quot; pour afficher toutes les organisations, ou saisissez une recherche puis &quot;Rechercher&quot;</p>
                                    </div>
                                ) : orgsLoading ? (
                                    <div className="text-center py-8 text-neutral-400">Chargement...</div>
                                ) : organizations.length === 0 ? (
                                    <div className="text-center py-8 text-neutral-400">Aucune organisation trouvée</div>
                                ) : (
                                    <div className="space-y-4">
                                        {organizations.map((org) => (
                                            <div key={org.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-neutral-800/50 rounded-lg border border-neutral-700">
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-semibold text-white truncate">{org.name}</p>
                                                    <p className="text-sm text-neutral-400 truncate">
                                                        Code: {org.code} • {org.owner?.email || org.owner?.name || "N/A"}
                                                    </p>
                                                    <p className="text-xs text-neutral-500">
                                                        {org._count?.departments ?? 0} départements • {org._count?.members ?? 0} membres
                                                        {org.subscription && ` • Plan ${org.subscription.plan}`}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Badge className="bg-neutral-700 text-neutral-300">{org.subscription?.plan || "N/A"}</Badge>
                                                    <Button size="sm" variant="outline" className="border-neutral-600" onClick={() => openOrgDetail(org)}>
                                                        <Eye className="w-4 h-4 mr-1" />
                                                        Détails
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="border-red-500 text-red-400 hover:bg-red-500/10" onClick={() => setDeleteOrg(org)} title="Supprimer l'organisation">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Users */}
                    <TabsContent value="users" className="mt-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <Card className="bg-neutral-900 border-neutral-800">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-neutral-400">Total</CardTitle>
                                    <Users className="h-4 w-4 text-neutral-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xl sm:text-2xl font-bold text-white">
                                        {searchQuery.trim().length >= 2 ? stats.totalUsers : (adminStats?.totalUsers ?? "—")}
                                    </div>
                                    {searchQuery.trim().length >= 2 && <p className="text-xs text-neutral-500 mt-1">résultats</p>}
                                </CardContent>
                            </Card>
                            <Card className="bg-neutral-900 border-neutral-800">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-neutral-400">En Ligne</CardTitle>
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xl sm:text-2xl font-bold text-green-400">
                                        {searchQuery.trim().length >= 2 ? stats.onlineUsers : (adminStats?.onlineUsers ?? "—")}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-neutral-900 border-neutral-800">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-neutral-400">Bannis</CardTitle>
                                    <Ban className="h-4 w-4 text-red-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xl sm:text-2xl font-bold text-red-400">
                                        {searchQuery.trim().length >= 2 ? stats.bannedUsers : "—"}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-neutral-900 border-neutral-800">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-neutral-400">Vérifiés</CardTitle>
                                    <Globe className="h-4 w-4 text-neutral-400" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xl sm:text-2xl font-bold text-white">
                                        {searchQuery.trim().length >= 2 ? stats.verifiedUsers : "—"}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="bg-neutral-900 border-neutral-800">
                            <CardHeader>
                                <CardTitle className="text-white">Utilisateurs</CardTitle>
                                <p className="text-sm text-neutral-400">Résultats de la recherche</p>
                            </CardHeader>
                            <CardContent>
                                {!showAllUsers && searchQuery.trim().length < 2 ? (
                                    <div className="text-center py-12 text-neutral-500">
                                        <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p className="font-medium">Recherchez un utilisateur</p>
                                        <p className="text-sm mt-1">Saisissez au moins 2 caractères (email ou nom) ou cliquez sur &quot;Afficher tous&quot;</p>
                                    </div>
                                ) : loading ? (
                                    <div className="text-center py-8 text-neutral-400">Chargement...</div>
                                ) : users.length === 0 ? (
                                    <div className="text-center py-8 text-neutral-400">Aucun utilisateur trouvé</div>
                                ) : (
                                    <div className="space-y-4">
                                        {users.map((user) => {
                                            const hasLiveLoc = !!getCoords(user.currentLocation);
                                            const hasLastLoc = !!getCoords(user.location);
                                            return (
                                            <div
                                                key={user.id}
                                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-neutral-800/50 rounded-lg border border-neutral-700"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="font-semibold text-white truncate">{user.name || "Sans nom"}</h3>
                                                        {user.isOnline ? (
                                                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                                                En ligne
                                                            </Badge>
                                                        ) : (
                                                            <Badge className="bg-neutral-600/30 text-neutral-400 border-neutral-600">Hors ligne</Badge>
                                                        )}
                                                        {user.isBanned && (
                                                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Banni</Badge>
                                                        )}
                                                        {hasLiveLoc && (
                                                            <span className="flex items-center gap-1 text-green-400" title="Position en direct partagée">
                                                                <MapPin className="h-3.5 w-3.5" />
                                                                <span className="text-xs">Position live</span>
                                                            </span>
                                                        )}
                                                        {!hasLiveLoc && hasLastLoc && (
                                                            <span className="flex items-center gap-1 text-neutral-500" title="Dernière position enregistrée">
                                                                <MapPin className="h-3.5 w-3.5" />
                                                                <span className="text-xs">Position enregistrée</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-neutral-400 truncate">{user.email}</p>
                                                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-neutral-500">
                                                        <span>Pays: {user.allowedCountry || "N/A"}</span>
                                                        <span>Rôle: {user.role}</span>
                                                        {user.lastSeen && (
                                                            <span>Dernière connexion: {new Date(user.lastSeen).toLocaleString("fr-FR")}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2 shrink-0">
                                                    <Button size="sm" variant="outline" className="border-neutral-600" onClick={() => openUserDetail(user)}>
                                                        <Eye className="w-4 h-4 mr-1" />
                                                        Détails
                                                    </Button>
                                                    {!user.isBanned ? (
                                                        <Button size="sm" variant="outline" className="border-red-500 text-red-400" onClick={() => handleUserAction(user.id, "ban")}>
                                                            Bannir
                                                        </Button>
                                                    ) : (
                                                        <Button size="sm" variant="outline" className="border-green-500 text-green-400" onClick={() => handleUserAction(user.id, "unban")}>
                                                            Débannir
                                                        </Button>
                                                    )}
                                                    {!user.canPublishNotifications && (
                                                        <Button size="sm" variant="outline" className="border-neutral-600" onClick={() => handleUserAction(user.id, "grant-publish")}>
                                                            Annonces
                                                        </Button>
                                                    )}
                                                    {user.role !== "SUPER_ADMIN" && (
                                                        <Button size="sm" variant="outline" className="border-red-500 text-red-400" onClick={() => setDeleteUser(user)}>
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                        })}
                                    </div>
                                )}

                                {(showAllUsers || searchQuery.trim().length >= 2) && users.length > 0 && totalPages > 1 && (
                                    <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
                                        <Button
                                            variant="outline"
                                            disabled={page === 1}
                                            onClick={() => setPage(page - 1)}
                                            className="border-neutral-600"
                                        >
                                            Précédent
                                        </Button>
                                        <span className="px-4 text-neutral-400 text-sm">
                                            Page {page} sur {totalPages}
                                        </span>
                                        <Button
                                            variant="outline"
                                            disabled={page === totalPages}
                                            onClick={() => setPage(page + 1)}
                                            className="border-neutral-600"
                                        >
                                            Suivant
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* User Detail Modal */}
            <Dialog open={!!userDetail || userDetailLoading} onOpenChange={(open) => !open && setUserDetail(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white text-black border-neutral-200">
                    {userDetailLoading ? (
                        <>
                            <DialogTitle className="sr-only">Chargement des détails utilisateur</DialogTitle>
                            <div className="py-12 text-center text-neutral-500">Chargement...</div>
                        </>
                    ) : userDetail ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Activity className="w-5 h-5" />
                                    Détails de l&apos;utilisateur
                                </DialogTitle>
                                <DialogDescription>Informations complètes et activité dans l&apos;application</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6">
                                <section>
                                    <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3">Identité</h3>
                                    <div className="space-y-0 divide-y divide-neutral-200">
                                        <InfoRow label="Nom" value={userDetail.user.name} />
                                        <InfoRow label="Email" value={<span className="flex items-center gap-1"><Mail className="w-3 h-3" />{userDetail.user.email}</span>} />
                                        <InfoRow label="Téléphone" value={userDetail.user.phone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{userDetail.user.phone}</span> : null} />
                                        <InfoRow label="Rôle" value={userDetail.user.role} />
                                        <InfoRow label="Pays autorisé" value={userDetail.user.allowedCountry} />
                                        <InfoRow label="Inscription" value={new Date(userDetail.user.createdAt).toLocaleString("fr-FR")} />
                                        <InfoRow label="Dernière connexion" value={userDetail.user.lastSeen ? new Date(userDetail.user.lastSeen).toLocaleString("fr-FR") : null} />
                                        <InfoRow label="Statut" value={
                                            userDetail.user.isBanned ? <Badge variant="destructive">Banni</Badge> :
                                            userDetail.user.isOnline ? <Badge className="bg-green-500/20 text-green-700">En ligne</Badge> :
                                            <span className="text-neutral-500">Hors ligne</span>
                                        } />
                                    </div>
                                </section>

                                {(() => {
                                    const liveCoords = getCoords(userDetail.user.currentLocation);
                                    const lastCoords = getCoords(userDetail.user.location);
                                    const loc = liveCoords ?? lastCoords;
                                    const city = (userDetail.user.location as any)?.city;
                                    if (loc) return (
                                        <section>
                                            <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-2">
                                                <MapPin className="w-4 h-4" />
                                                Position {liveCoords ? "(en direct)" : "(dernière enregistrée)"}
                                            </h3>
                                            <LocationMap
                                                lat={loc.lat}
                                                lng={loc.lng}
                                                city={city}
                                                label={liveCoords ? "Position actuelle partagée" : "Dernière position connue"}
                                            />
                                        </section>
                                    );
                                    return null;
                                })()}

                                <section>
                                    <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3">Activité dans l&apos;app</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {[
                                            { label: "Messages envoyés", value: userDetail.user._count?.sentMessages },
                                            { label: "Orgs membre", value: userDetail.user._count?.orgMemberships },
                                            { label: "Départements", value: userDetail.user._count?.deptMemberships },
                                            { label: "Notifications", value: userDetail.user._count?.notifications },
                                            { label: "Invitations", value: userDetail.user._count?.invitations },
                                            { label: "Tâches perso", value: userDetail.user._count?.personalTasks },
                                            { label: "Objectifs finan.", value: userDetail.user._count?.financialGoals },
                                            { label: "Annonces publiées", value: userDetail.user._count?.publishedAnnouncements },
                                            { label: "Tâches créées", value: userDetail.user._count?.createdTasks },
                                            { label: "Tâches assignées", value: userDetail.user._count?.assignedTasks },
                                            { label: "Réunions créées", value: userDetail.user._count?.createdMeetings },
                                            { label: "Sondages créés", value: userDetail.user._count?.createdPolls },
                                            { label: "Décisions créées", value: userDetail.user._count?.createdDecisions },
                                            { label: "Likes", value: userDetail.user._count?.likes },
                                            { label: "Commentaires", value: userDetail.user._count?.comments },
                                            { label: "Abonnés", value: userDetail.user._count?.followers },
                                            { label: "Abonnements", value: userDetail.user._count?.following },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="p-3 rounded-lg bg-neutral-100">
                                                <div className="text-2xl font-bold text-neutral-900">{value ?? 0}</div>
                                                <div className="text-xs text-neutral-500">{label}</div>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {userDetail.organizations?.length > 0 && (
                                    <section>
                                        <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3">Organisations</h3>
                                        <div className="space-y-2">
                                            {userDetail.organizations.map(({ org, role }) => (
                                                <div key={org.id} className="flex items-center justify-between p-3 rounded-lg bg-neutral-100">
                                                    <span className="font-medium">{org.name}</span>
                                                    <Badge variant="secondary">{role}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                <div className="flex flex-wrap gap-2 pt-4 border-t">
                                    {!userDetail.user.isBanned ? (
                                        <Button size="sm" variant="destructive" onClick={() => handleUserAction(userDetail.user.id, "ban")}>Bannir</Button>
                                    ) : (
                                        <Button size="sm" variant="outline" className="border-green-500 text-green-600" onClick={() => handleUserAction(userDetail.user.id, "unban")}>Débannir</Button>
                                    )}
                                    {userDetail.user.role !== "SUPER_ADMIN" && (
                                        <Button size="sm" variant="outline" className="border-red-500 text-red-600" onClick={() => { setDeleteUser(userDetail.user); setUserDetail(null); }}>Supprimer</Button>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <DialogTitle className="sr-only">Détails utilisateur</DialogTitle>
                    )}
                </DialogContent>
            </Dialog>

            {/* Org Detail Modal */}
            <Dialog open={!!orgDetail || orgDetailLoading} onOpenChange={(open) => !open && setOrgDetail(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white text-black border-neutral-200">
                    {orgDetailLoading ? (
                        <>
                            <DialogTitle className="sr-only">Chargement des détails organisation</DialogTitle>
                            <div className="py-12 text-center text-neutral-500">Chargement...</div>
                        </>
                    ) : orgDetail ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Building2 className="w-5 h-5" />
                                    {orgDetail.organization.name}
                                </DialogTitle>
                                <DialogDescription>Informations complètes de l&apos;organisation</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6">
                                <section>
                                    <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3">Identité</h3>
                                    <div className="space-y-0 divide-y divide-neutral-200">
                                        <InfoRow label="Nom" value={orgDetail.organization.name} />
                                        <InfoRow label="Code" value={orgDetail.organization.code} />
                                        <InfoRow label="Adresse" value={orgDetail.organization.address} />
                                        <InfoRow label="Créée le" value={new Date(orgDetail.organization.createdAt).toLocaleString("fr-FR")} />
                                        <InfoRow label="Suspendue" value={orgDetail.organization.isSuspended ? "Oui" : "Non"} />
                                    </div>
                                </section>

                                {orgDetail.owner && (
                                    <section>
                                        <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3">Propriétaire</h3>
                                        <div className="space-y-0 divide-y divide-neutral-200">
                                            <InfoRow label="Nom" value={orgDetail.owner.name} />
                                            <InfoRow label="Email" value={orgDetail.owner.email} />
                                            <InfoRow label="Téléphone" value={orgDetail.owner.phone} />
                                            <InfoRow label="En ligne" value={orgDetail.owner.isOnline ? "Oui" : "Non"} />
                                            <InfoRow label="Dernière connexion" value={orgDetail.owner.lastSeen ? new Date(orgDetail.owner.lastSeen).toLocaleString("fr-FR") : null} />
                                        </div>
                                    </section>
                                )}

                                {orgDetail.organization.subscription && (
                                    <section>
                                        <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3">Abonnement</h3>
                                        <div className="space-y-0 divide-y divide-neutral-200">
                                            <InfoRow label="Plan" value={orgDetail.organization.subscription.plan} />
                                            <InfoRow label="Actif" value={orgDetail.organization.subscription.isActive ? "Oui" : "Non"} />
                                            <InfoRow label="Départements max" value={orgDetail.organization.subscription.maxDepartments} />
                                            <InfoRow label="Membres max/dépt" value={orgDetail.organization.subscription.maxMembersPerDept} />
                                        </div>
                                    </section>
                                )}

                                {orgDetail.organization.departments?.length > 0 && (
                                    <section>
                                        <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3">Départements</h3>
                                        <div className="space-y-2">
                                            {orgDetail.organization.departments.map((dept) => (
                                                <div key={dept.id} className="flex items-center justify-between p-3 rounded-lg bg-neutral-100">
                                                    <div>
                                                        <span className="font-medium">{dept.name}</span>
                                                        <span className="text-sm text-neutral-500 ml-2">({dept._count.members} membres, {dept._count.tasks} tâches)</span>
                                                    </div>
                                                    {dept.head && <Badge variant="secondary">{dept.head.name || dept.head.email}</Badge>}
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {orgDetail.organization.members?.length > 0 && (
                                    <section>
                                        <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3">Membres</h3>
                                        <div className="space-y-2">
                                            {orgDetail.organization.members.map((m) => (
                                                <div key={m.user.id} className="flex items-center justify-between p-3 rounded-lg bg-neutral-100">
                                                    <span className="font-medium">{m.user.name || m.user.email}</span>
                                                    <Badge variant="secondary">{m.role}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {orgDetail.organization.events?.length > 0 && (
                                    <section>
                                        <h3 className="font-semibold text-sm uppercase tracking-wider text-neutral-500 mb-3">Événements</h3>
                                        <div className="space-y-2">
                                            {orgDetail.organization.events.map((ev) => (
                                                <div key={ev.id} className="flex items-center justify-between p-3 rounded-lg bg-neutral-100">
                                                    <span className="font-medium">{ev.title}</span>
                                                    <span className="text-sm text-neutral-500">
                                                        {new Date(ev.eventDate).toLocaleDateString("fr-FR")} • {ev.maxAttendees} places
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                <div className="flex flex-wrap gap-2 pt-4 border-t">
                                    <p className="text-sm text-neutral-500 w-full">
                                        {orgDetail.organization._count?.members ?? 0} membres • {orgDetail.organization._count?.departments ?? 0} départements • {orgDetail.organization._count?.events ?? 0} événements
                                    </p>
                                    <Button size="sm" variant="outline" className="border-red-500 text-red-600" onClick={() => { setDeleteOrg(orgDetail.organization as Organization); setOrgDetail(null); }}>
                                        <Trash2 className="w-4 h-4 mr-1" />
                                        Supprimer l&apos;organisation
                                    </Button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <DialogTitle className="sr-only">Détails organisation</DialogTitle>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete org confirmation */}
            <Dialog open={!!deleteOrg} onOpenChange={(open) => !open && setDeleteOrg(null)}>
                <DialogContent className="max-w-md bg-white text-black border-neutral-200">
                    <DialogHeader>
                        <DialogTitle>Supprimer l&apos;organisation ?</DialogTitle>
                        <DialogDescription>
                            Cette action est irréversible. L&apos;organisation &quot;{deleteOrg?.name}&quot; et toutes ses données (départements, membres, tâches, etc.) seront supprimées définitivement.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setDeleteOrg(null)}>Annuler</Button>
                        <Button variant="destructive" onClick={handleDeleteOrg} disabled={deletingOrg}>
                            {deletingOrg ? "Suppression..." : "Supprimer"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete User Confirmation */}
            <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
                <DialogContent className="max-w-md bg-white text-black border-neutral-200">
                    <DialogHeader>
                        <DialogTitle>Supprimer l&apos;utilisateur ?</DialogTitle>
                        <DialogDescription>
                            Cette action est irréversible. Toutes les données de {deleteUser?.name || deleteUser?.email} seront supprimées définitivement.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setDeleteUser(null)}>Annuler</Button>
                        <Button variant="destructive" onClick={handleDeleteUser} disabled={deleting}>
                            {deleting ? "Suppression..." : "Supprimer"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
