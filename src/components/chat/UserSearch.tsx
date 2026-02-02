"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, User, Phone, Mail } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetchWithAuth } from "@/src/lib/auth-client";

interface SearchResult {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    publicKey: string;
    isOnline: boolean;
    lastSeen: Date | null;
}

export function UserSearch() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Close search when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    // Search users with debounce
    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setLoading(true);
            try {
                const response = await fetchWithAuth(`/api/users/search?q=${encodeURIComponent(query)}`);
                const data = await response.json();

                if (response.ok) {
                    setResults(data.users || []);
                } else {
                    toast.error(data.error || "Erreur de recherche");
                }
            } catch (error) {
                toast.error("Erreur réseau");
            } finally {
                setLoading(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timeoutId);
    }, [query]);

    const handleSelectUser = async (user: SearchResult) => {
        try {
            // Create or get conversation with this user
            const response = await fetchWithAuth("/api/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    participantId: user.id,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                // Handle both new conversation and existing conversation responses
                const conversationId = data.conversation?.id || data.conversationId;
                if (conversationId) {
                    router.push(`/chat/discussion/${conversationId}`);
                    setIsOpen(false);
                    setQuery("");
                } else {
                    toast.error("ID de conversation manquant");
                }
            } else {
                toast.error(data.error || "Erreur lors de la création de la conversation");
            }
        } catch (error) {
            console.error("Create conversation error:", error);
            toast.error("Erreur réseau");
        }
    };

    return (
        <div className="relative" ref={searchRef}>
            {/* Search Button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(!isOpen)}
                className="text-slate-400 hover:text-slate-100"
            >
                <Search className="h-5 w-5" />
            </Button>

            {/* Search Dropdown */}
            {isOpen && (
                <div className="absolute top-12 right-0 w-96 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl z-50">
                    <div className="p-4 border-b border-slate-800">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Rechercher par email, téléphone ou nom..."
                                className="pl-10 bg-slate-800 border-slate-700"
                                autoFocus
                            />
                            {query && (
                                <button
                                    onClick={() => setQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="p-8 text-center text-slate-400">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                <p className="mt-2 text-sm">Recherche...</p>
                            </div>
                        ) : query.length < 2 ? (
                            <div className="p-8 text-center text-slate-400">
                                <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Tapez au moins 2 caractères pour rechercher</p>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Aucun utilisateur trouvé</p>
                            </div>
                        ) : (
                            <div className="py-2">
                                {results.map((user) => (
                                    <button
                                        key={user.id}
                                        onClick={() => handleSelectUser(user)}
                                        className="w-full px-4 py-3 hover:bg-slate-800 transition-colors text-left flex items-center gap-3"
                                    >
                                        <div className="flex-shrink-0">
                                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                                                {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-slate-100 truncate">
                                                    {user.name || "Sans nom"}
                                                </p>
                                                {user.isOnline && (
                                                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                                                        En ligne
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-xs text-slate-400 flex items-center gap-1 truncate">
                                                    <Mail className="h-3 w-3" />
                                                    {user.email}
                                                </span>
                                                {user.phone && (
                                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                                        <Phone className="h-3 w-3" />
                                                        {user.phone}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
