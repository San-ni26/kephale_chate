"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Search, MapPin, Briefcase, Clock, Users, Filter, ChevronDown,
    Building2, Globe, ChevronLeft, ChevronRight, Loader2, X, SlidersHorizontal
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Badge } from "@/src/components/ui/badge";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
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
const CONTRACT_COLORS: Record<string, string> = {
    CDI: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    CDD: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    STAGE: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    FREELANCE: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    FULL_TIME: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    PART_TIME: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

function JobCard({ job, onClick }: { job: any; onClick: () => void }) {
    const isDeadlineSoon = job.deadline && new Date(job.deadline).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
    const isExpired = job.deadline && new Date(job.deadline) < new Date();

    return (
        <article
            onClick={onClick}
            className="group bg-card border border-border rounded-2xl p-4 md:p-5 cursor-pointer hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
        >
            <div className="flex items-start gap-4">
                {/* Logo entreprise */}
                <div className="shrink-0">
                    {job.companyLogo ? (
                        <img src={job.companyLogo} alt={job.companyName}
                            className="w-14 h-14 object-cover rounded-xl border border-border group-hover:scale-105 transition-transform" />
                    ) : (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold text-primary bg-primary/10 group-hover:bg-primary/20 transition-colors">
                            {job.companyName?.[0]?.toUpperCase() || "?"}
                        </div>
                    )}
                </div>

                {/* Contenu */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h2 className="font-bold text-foreground group-hover:text-primary transition-colors truncate text-base">
                                {job.title}
                            </h2>
                            <p className="text-sm text-muted-foreground font-medium">{job.companyName}</p>
                        </div>
                        {isDeadlineSoon && !isExpired && (
                            <span className="shrink-0 text-xs px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-full font-medium animate-pulse">
                                Urgent
                            </span>
                        )}
                    </div>

                    {/* Tags */}
                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONTRACT_COLORS[job.contractType] || "bg-muted text-muted-foreground"}`}>
                            {CONTRACT_LABELS[job.contractType] || job.contractType}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${WORKMODE_COLORS[job.workMode] || "bg-muted text-muted-foreground"}`}>
                            {WORKMODE_LABELS[job.workMode] || job.workMode}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {job.location}
                        </span>
                    </div>

                    {/* Compétences preview */}
                    {job.skills && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                            🔧 {job.skills}
                        </p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {job.salary && <span className="text-green-600 dark:text-green-400 font-medium">💰 {job.salary}</span>}
                            <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {job.positionsCount} poste{job.positionsCount > 1 ? 's' : ''}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {job.publishedAt
                                    ? format(new Date(job.publishedAt), "d MMM", { locale: fr })
                                    : "Récent"
                                }
                            </span>
                        </div>
                        {job.deadline && (
                            <span className={`text-xs ${isExpired ? "text-red-500" : isDeadlineSoon ? "text-amber-500" : "text-muted-foreground"}`}>
                                {isExpired ? "❌ Expiré" : `Jusqu'au ${format(new Date(job.deadline), "d MMM", { locale: fr })}`}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

export default function JobSearchPage() {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [city, setCity] = useState("");
    const [contractType, setContractType] = useState("");
    const [workMode, setWorkMode] = useState("");
    const [page, setPage] = useState(1);
    const [showFilters, setShowFilters] = useState(false);

    const buildUrl = () => {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (city) params.set("city", city);
        if (contractType) params.set("contractType", contractType);
        if (workMode) params.set("workMode", workMode);
        params.set("page", String(page));
        params.set("limit", "15");
        return `/api/jobs?${params.toString()}`;
    };

    const { data, isLoading } = useSWR(buildUrl(), fetcher);
    const jobs = data?.jobs || [];
    const pagination = data?.pagination;

    const handleSearch = () => {
        setSearch(searchInput);
        setPage(1);
    };

    const clearFilters = () => {
        setSearch(""); setSearchInput(""); setCity("");
        setContractType(""); setWorkMode(""); setPage(1);
    };

    const hasFilters = search || city || contractType || workMode;

    return (
        <div className="flex flex-col min-h-screen sm:h-full pt-14 sm:pt-16 pb-20 sm:pb-4 bg-background">
            {/* Hero header */}
            <div className="shrink-0 bg-gradient-to-br from-primary/10 via-background to-background border-b border-border px-4 pt-5 pb-4 space-y-4">
                <div className="max-w-3xl mx-auto">


                    {/* Barre de recherche principale */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleSearch()}
                                placeholder="Poste, compétence, entreprise..."
                                className="pl-9 border-border"
                            />
                        </div>
                        <Button onClick={handleSearch} className="gap-1 shrink-0">
                            <Search className="w-4 h-4" />
                            <span className="hidden sm:inline">Rechercher</span>
                        </Button>
                        <Button
                            variant="outline" size="icon"
                            onClick={() => setShowFilters(!showFilters)}
                            className={showFilters || hasFilters ? "border-primary text-primary" : ""}
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Filtres avancés */}
                    {showFilters && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    value={city}
                                    onChange={e => { setCity(e.target.value); setPage(1); }}
                                    placeholder="Ville..."
                                    className="pl-9"
                                />
                            </div>
                            <Select value={contractType || undefined} onValueChange={v => { setContractType(v === "ALL" ? "" : v); setPage(1); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Type de contrat" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Tous les contrats</SelectItem>
                                    {Object.entries(CONTRACT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={workMode || undefined} onValueChange={v => { setWorkMode(v === "ALL" ? "" : v); setPage(1); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Mode de travail" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Tous les modes</SelectItem>
                                    {Object.entries(WORKMODE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {hasFilters && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">Filtres actifs :</span>
                            {search && <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{search}</span>}
                            {city && <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">📍 {city}</span>}
                            {contractType && <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{CONTRACT_LABELS[contractType]}</span>}
                            {workMode && <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{WORKMODE_LABELS[workMode]}</span>}
                            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                                <X className="w-3 h-3" /> Effacer
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Liste des offres */}
            <div className="flex-1 overflow-y-auto min-h-0">
                <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : jobs.length === 0 ? (
                        <div className="text-center py-16">
                            <Briefcase className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Aucune offre trouvée</h3>
                            <p className="text-muted-foreground text-sm">
                                {hasFilters
                                    ? "Essayez des filtres différents ou effacez la recherche."
                                    : "Aucune offre d'emploi disponible pour le moment."}
                            </p>
                            {hasFilters && (
                                <Button variant="outline" className="mt-4 gap-2" onClick={clearFilters}>
                                    <X className="w-4 h-4" /> Effacer les filtres
                                </Button>
                            )}
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground">
                                {pagination?.total} offre{(pagination?.total || 0) > 1 ? 's' : ''} trouvée{(pagination?.total || 0) > 1 ? 's' : ''}
                            </p>
                            {jobs.map((job: any) => (
                                <JobCard
                                    key={job.id}
                                    job={job}
                                    onClick={() => router.push(`/chat/jobs/${job.id}`)}
                                />
                            ))}

                            {/* Pagination */}
                            {pagination && pagination.totalPages > 1 && (
                                <div className="flex items-center justify-center gap-3 pt-4">
                                    <Button
                                        variant="outline" size="icon"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1 || isLoading}
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                    <span className="text-sm text-muted-foreground">
                                        Page {page} sur {pagination.totalPages}
                                    </span>
                                    <Button
                                        variant="outline" size="icon"
                                        onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                        disabled={page === pagination.totalPages || isLoading}
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
