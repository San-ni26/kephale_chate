"use client";

import { useState, useCallback, useEffect } from "react";
import {
    Plus,
    Pencil,
    Trash2,
    StickyNote,
    Loader2,
    Clock,
    Search,
    NotepadText,
    FileDown,
    X,
    Copy,
    UserPlus,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/src/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/src/components/ui/select";
import { NoteEditor } from "@/src/components/notes/NoteEditor";
import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";
import { fetchWithAuth, getUser } from "@/src/lib/auth-client";
import { toast } from "sonner";

/* ───── types ───── */

type Group = {
    id: string;
    name: string | null;
    _count?: { members: number };
};

type NoteShare = {
    id?: string;
    sharedWithId?: string;
    canEdit?: boolean;
    sharedWith: { id: string; name: string | null; email?: string };
};

type Note = {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
    createdAt?: string;
    createdBy?: string;
    creator?: { id: string; name: string | null; email?: string };
    shares?: NoteShare[];
};

type Document = {
    id: string;
    title: string;
    notes: Note[];
    _count?: { notes: number };
};

/* ───── helpers ───── */

function stripHtml(html: string): string {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetchWithAuth(url);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur");
    }
    return res.json();
}

/* ───── page ───── */

export default function GroupsPage() {
    /* groupes */
    const { data: groupsData } = useSWR<{ groups: Group[] }>("/api/groups", fetcher);
    const groups = groupsData?.groups || [];

    /* sélection groupe */
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

    /* documents / notes */
    const [defaultDocId, setDefaultDocId] = useState<string | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [notesLoading, setNotesLoading] = useState(false);
    const [search, setSearch] = useState("");

    /* form note */
    const [formOpen, setFormOpen] = useState(false);
    const [editingNote, setEditingNote] = useState<Note | null>(null);
    const [formTitle, setFormTitle] = useState("");
    const [formContent, setFormContent] = useState("");
    const [formSaving, setFormSaving] = useState(false);

    /* suppression */
    const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
    const [deleting, setDeleting] = useState(false);

    /* vue PDF */
    const [viewNote, setViewNote] = useState<Note | null>(null);

    /* partage */
    const [shareNote, setShareNote] = useState<Note | null>(null);
    const [shareEmail, setShareEmail] = useState("");
    const [shareCanEdit, setShareCanEdit] = useState(true);
    const [shareLoading, setShareLoading] = useState(false);

    const currentUserId = getUser()?.id ?? null;

    /* ── fetch notes ── */
    const loadNotes = useCallback(async (groupId: string): Promise<Note[]> => {
        setNotesLoading(true);
        setNotes([]);
        setDefaultDocId(null);
        try {
            const { documents: docs } = await fetchJson<{ documents: Document[] }>(
                `/api/groups/${groupId}/documents`
            );
            if (docs.length > 0) {
                const docId = docs[0].id;
                setDefaultDocId(docId);
                const { document: fullDoc } = await fetchJson<{ document: Document }>(
                    `/api/groups/${groupId}/documents/${docId}`
                );
                const noteList = fullDoc.notes || [];
                setNotes(noteList);
                return noteList;
            }
            return [];
        } catch (e) {
            console.error(e);
            return [];
        } finally {
            setNotesLoading(false);
        }
    }, []);

    /* auto-load au changement de groupe */
    useEffect(() => {
        if (selectedGroupId) {
            loadNotes(selectedGroupId);
        } else {
            setNotes([]);
            setDefaultDocId(null);
        }
    }, [selectedGroupId, loadNotes]);

    /* auto-select 1er groupe */
    useEffect(() => {
        if (!selectedGroupId && groups.length > 0) {
            setSelectedGroupId(groups[0].id);
        }
    }, [groups, selectedGroupId]);

    /* ── actions ── */
    const openCreateNote = () => {
        setEditingNote(null);
        setFormTitle("");
        setFormContent("");
        setFormOpen(true);
    };

    const openEditNote = (note: Note) => {
        setEditingNote(note);
        setFormTitle(note.title);
        setFormContent(note.content || "");
        setFormOpen(true);
    };

    const saveNote = async () => {
        if (!selectedGroupId || !defaultDocId || !formTitle.trim()) return;
        setFormSaving(true);
        try {
            if (editingNote) {
                await fetchWithAuth(
                    `/api/groups/${selectedGroupId}/documents/${defaultDocId}/notes/${editingNote.id}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title: formTitle.trim(), content: formContent }),
                    }
                );
            } else {
                await fetchWithAuth(
                    `/api/groups/${selectedGroupId}/documents/${defaultDocId}/notes`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title: formTitle.trim(), content: formContent }),
                    }
                );
            }
            setFormOpen(false);
            await loadNotes(selectedGroupId);
        } catch (e) {
            console.error(e);
        } finally {
            setFormSaving(false);
        }
    };

    const shareNoteWithUser = async () => {
        if (!selectedGroupId || !defaultDocId || !shareNote || !shareEmail.trim()) return;
        setShareLoading(true);
        try {
            const res = await fetchWithAuth(
                `/api/groups/${selectedGroupId}/documents/${defaultDocId}/notes/${shareNote.id}/share`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: shareEmail.trim().toLowerCase(), canEdit: shareCanEdit }),
                }
            );
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Erreur de partage");
                return;
            }
            toast.success(`Note partagée avec ${data.sharedWith?.name || data.sharedWith?.email}`);
            setShareEmail("");
            const updated = await loadNotes(selectedGroupId);
            if (viewNote && shareNote && updated) {
                const refreshed = updated.find((n: Note) => n.id === shareNote.id);
                if (refreshed) setViewNote(refreshed);
                setShareNote(refreshed ?? null);
            }
        } catch (e) {
            toast.error("Erreur de partage");
        } finally {
            setShareLoading(false);
        }
    };

    const unshareNote = async (sharedWithId: string) => {
        if (!selectedGroupId || !defaultDocId || !shareNote) return;
        const share = shareNote.shares?.find((s) => s.sharedWith.id === sharedWithId);
        if (!share) return;
        setShareLoading(true);
        try {
            const res = await fetchWithAuth(
                `/api/groups/${selectedGroupId}/documents/${defaultDocId}/notes/${shareNote.id}/share?sharedWithId=${encodeURIComponent(sharedWithId)}`,
                { method: "DELETE" }
            );
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || "Erreur");
                return;
            }
            toast.success("Partage retiré");
            const updated = await loadNotes(selectedGroupId);
            const refreshed = updated.find((n: Note) => n.id === shareNote.id);
            setShareNote(refreshed ?? null);
            if (viewNote && shareNote && refreshed) setViewNote(refreshed);
        } catch (e) {
            toast.error("Erreur");
        } finally {
            setShareLoading(false);
        }
    };

    const updateSharePermission = async (sharedWithId: string, canEdit: boolean) => {
        if (!selectedGroupId || !defaultDocId || !shareNote) return;
        setShareLoading(true);
        try {
            const res = await fetchWithAuth(
                `/api/groups/${selectedGroupId}/documents/${defaultDocId}/notes/${shareNote.id}/share`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sharedWithId, canEdit }),
                }
            );
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || "Erreur");
                return;
            }
            toast.success(canEdit ? "Droit de modification accordé" : "Lecture seule");
            const updated = await loadNotes(selectedGroupId);
            const refreshed = updated.find((n: Note) => n.id === shareNote.id);
            setShareNote(refreshed ?? null);
            if (viewNote && shareNote && refreshed) setViewNote(refreshed);
        } catch (e) {
            toast.error("Erreur");
        } finally {
            setShareLoading(false);
        }
    };

    const confirmDelete = async () => {
        if (!selectedGroupId || !defaultDocId || !deleteTarget) return;
        setDeleting(true);
        try {
            await fetchWithAuth(
                `/api/groups/${selectedGroupId}/documents/${defaultDocId}/notes/${deleteTarget.id}`,
                { method: "DELETE" }
            );
            setDeleteTarget(null);
            await loadNotes(selectedGroupId);
        } catch (e) {
            console.error(e);
        } finally {
            setDeleting(false);
        }
    };

    /* ── filtrage ── */
    const filtered = search.trim()
        ? notes.filter(
            (n) =>
                n.title.toLowerCase().includes(search.toLowerCase()) ||
                stripHtml(n.content).toLowerCase().includes(search.toLowerCase())
        )
        : notes;

    const selectedGroup = groups.find((g) => g.id === selectedGroupId);

    /* ───── render ───── */
    return (
        <div className="flex flex-col min-h-screen sm:min-h-0 sm:h-full pt-14 sm:pt-16 pb-20 sm:pb-4">
            {/* ── header ── */}
            <div className="shrink-0 px-3 sm:px-4 pt-3 sm:pt-4 pb-3 space-y-3 border-b border-border bg-background/80 backdrop-blur-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <NotepadText className="w-5 h-5 text-primary shrink-0" />
                            <h1 className="text-base sm:text-lg font-bold text-foreground">Notes</h1>
                        </div>

                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            className="h-8 gap-1.5 flex-1 sm:flex-initial"
                            onClick={openCreateNote}
                            disabled={!selectedGroupId || notesLoading}
                        >
                            <Plus className="w-4 h-4 shrink-0" />
                            <span>Nouvelle note</span>
                        </Button>
                    </div>
                </div>

                {/* barre de recherche */}
                {selectedGroupId && notes.length > 0 && (
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher une note…"
                            className="pl-8 h-8 text-sm bg-muted border-border w-full"
                        />
                    </div>
                )}
            </div>

            {/* ── contenu ── */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 min-h-0">
                {!selectedGroupId ? (
                    /* aucun groupe sélectionné */
                    <EmptyState
                        icon={<NotepadText className="w-12 h-12 text-muted-foreground/40" />}
                        title="Sélectionnez un groupe"
                        description="Choisissez un groupe dans le menu ci-dessus pour afficher et gérer ses notes."
                    />
                ) : notesLoading ? (
                    /* chargement */
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : filtered.length === 0 ? (
                    /* aucune note */
                    <EmptyState
                        icon={<StickyNote className="w-12 h-12 text-muted-foreground/40" />}
                        title={search ? "Aucun résultat" : "Aucune note"}
                        description={
                            search
                                ? `Aucune note ne correspond à « ${search} ».`
                                : "Ce groupe n'a pas encore de note. Cliquez sur « Nouvelle note » pour en créer une."
                        }
                    />
                ) : (
                    /* liste des notes */
                    <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {filtered.map((note) => (
                            <NoteCard
                                key={note.id}
                                note={note}
                                isCreator={note.creator?.id === currentUserId}
                                isEditable={
                                    note.creator?.id === currentUserId ||
                                    (note.shares?.some((s) => s.sharedWith.id === currentUserId && (s.canEdit ?? true)) ?? false)
                                }
                                onView={() => setViewNote(note)}
                                onEdit={() => openEditNote(note)}
                                onDelete={() => setDeleteTarget(note)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Dialog: Créer / Modifier ── */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="bg-card border-border text-foreground w-[95vw] sm:w-full max-w-2xl max-h-[85vh] sm:max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>
                            {editingNote ? "Modifier la note" : "Nouvelle note"}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            {editingNote
                                ? "Modifiez le titre et le contenu de la note."
                                : "Créez une nouvelle note avec un titre et un contenu."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-1">
                        <div>
                            <label className="text-sm font-medium text-foreground mb-1 block">
                                Titre
                            </label>
                            <Input
                                value={formTitle}
                                onChange={(e) => setFormTitle(e.target.value)}
                                placeholder="Titre de la note"
                                className="bg-muted border-border"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-foreground mb-1 block">
                                Contenu
                            </label>
                            <NoteEditor
                                content={formContent}
                                onChange={setFormContent}
                                editable={true}
                            />
                        </div>
                    </div>
                    <DialogFooter className="pt-3 border-t border-border">
                        <Button variant="outline" onClick={() => setFormOpen(false)}>
                            Annuler
                        </Button>
                        <Button onClick={saveNote} disabled={formSaving || !formTitle.trim()}>
                            {formSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            {editingNote ? "Enregistrer" : "Créer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Dialog: Confirmer suppression ── */}
            <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <DialogContent className="bg-card border-border text-foreground w-[95vw] sm:w-full max-w-md">
                    <DialogHeader>
                        <DialogTitle>Supprimer la note</DialogTitle>
                        <DialogDescription>
                            Êtes-vous sûr de vouloir supprimer « {deleteTarget?.title} » ?
                            Cette action est irréversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                            Annuler
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                            {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Dialog: Partager avec un utilisateur ── */}
            <Dialog open={!!shareNote} onOpenChange={(o) => !o && (setShareNote(null), setShareEmail(""), setShareCanEdit(true))}>
                <DialogContent className="bg-card border-border text-foreground w-[95vw] sm:w-full max-w-md">
                    <DialogHeader>
                        <DialogTitle>Partager la note</DialogTitle>
                        <DialogDescription>
                            Entrez l&apos;email d&apos;un membre du groupe pour lui donner accès. Choisissez s&apos;il peut modifier ou seulement lire.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="flex gap-2">
                            <Input
                                type="email"
                                placeholder="email@exemple.com"
                                value={shareEmail}
                                onChange={(e) => setShareEmail(e.target.value)}
                                className="bg-muted border-border flex-1"
                                autoFocus
                            />
                            <label className="flex items-center gap-1.5 text-sm whitespace-nowrap cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={shareCanEdit}
                                    onChange={(e) => setShareCanEdit(e.target.checked)}
                                    className="rounded border-border"
                                />
                                Peut modifier
                            </label>
                        </div>
                        {shareNote?.shares && shareNote.shares.length > 0 && (
                            <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">Déjà partagée avec :</div>
                                {shareNote.shares.map((s) => (
                                    <div
                                        key={s.id || s.sharedWith.id}
                                        className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-muted/50 border border-border"
                                    >
                                        <span className="text-sm truncate">{s.sharedWith.name || s.sharedWith.email}</span>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => updateSharePermission(s.sharedWith.id, !(s.canEdit ?? true))}
                                                disabled={shareLoading}
                                            >
                                                {(s.canEdit ?? true) ? "Modifier" : "Lecture seule"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                                onClick={() => unshareNote(s.sharedWith.id)}
                                                disabled={shareLoading}
                                                title="Retirer le partage"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => (setShareNote(null), setShareEmail(""), setShareCanEdit(true))}>
                            Annuler
                        </Button>
                        <Button onClick={shareNoteWithUser} disabled={shareLoading || !shareEmail.trim()}>
                            {shareLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Partager
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Vue PDF (lecture document) ── */}
            <NotePdfView
                note={viewNote}
                isCreator={viewNote?.creator?.id === currentUserId}
                isEditable={
                    viewNote?.creator?.id === currentUserId ||
                    (viewNote?.shares?.some((s) => s.sharedWith.id === currentUserId && (s.canEdit ?? true)) ?? false)
                }
                onClose={() => setViewNote(null)}
                onShareClick={() => viewNote && setShareNote(viewNote)}
                onEdit={(n) => {
                    setViewNote(null);
                    openEditNote(n);
                }}
                onDelete={(n) => {
                    setViewNote(null);
                    setDeleteTarget(n);
                }}
                onShare={async (n) => {
                    const text = `${n.title}\n\n${stripHtml(n.content)}`;
                    try {
                        if (navigator.share) {
                            await navigator.share({
                                title: n.title,
                                text,
                            });
                            toast.success("Note partagée");
                        } else {
                            await navigator.clipboard.writeText(text);
                            toast.success("Note copiée dans le presse-papiers");
                        }
                    } catch (err) {
                        try {
                            await navigator.clipboard.writeText(text);
                            toast.success("Note copiée dans le presse-papiers");
                        } catch {
                            toast.error("Impossible de partager");
                        }
                    }
                }}
                onExportPdf={() => {
                    const el = document.getElementById("note-pdf-content");
                    if (!el) return;
                    const printWindow = window.open("", "_blank");
                    if (!printWindow) {
                        toast.error("Autorisez les pop-ups pour exporter en PDF");
                        return;
                    }
                    printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>${viewNote?.title ?? "Note"}</title>
                            <style>
                                body { font-family: system-ui, sans-serif; max-width: 210mm; margin: 0 auto; padding: 20mm; color: #1a1a1a; line-height: 1.6; }
                                h1 { font-size: 1.5rem; margin-bottom: 1rem; }
                                h2 { font-size: 1.25rem; margin: 1rem 0 0.5rem; }
                                h3 { font-size: 1.125rem; margin: 0.75rem 0 0.25rem; }
                                ul:not([data-type="taskList"]) { padding-left: 1.5rem; }
                                ol { padding-left: 1.5rem; }
                                blockquote { border-left: 4px solid #ccc; padding-left: 1rem; margin: 0.5em 0; color: #666; }
                                pre { background: #f4f4f4; padding: 0.75rem; border-radius: 4px; overflow-x: auto; font-size: 0.875rem; }
                                hr { border: none; border-top: 1px solid #ddd; margin: 1em 0; }
                                ul[data-type="taskList"] { list-style: none; padding-left: 0; }
                                ul[data-type="taskList"] li[data-checked="true"] { text-decoration: line-through; opacity: 0.7; }
                            </style>
                        </head>
                        <body>${el.innerHTML}</body>
                        </html>
                    `);
                    printWindow.document.close();
                    printWindow.focus();
                    setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                        toast.success("Fenêtre d'impression ouverte — choisissez « Enregistrer en PDF »");
                    }, 250);
                }}
            />
        </div>
    );
}

/* ───── composants internes ───── */

function NotePdfView({
    note,
    isCreator,
    isEditable,
    onClose,
    onEdit,
    onDelete,
    onShare,
    onShareClick,
    onExportPdf,
}: {
    note: Note | null;
    isCreator?: boolean;
    isEditable?: boolean;
    onClose: () => void;
    onEdit: (n: Note) => void;
    onDelete: (n: Note) => void;
    onShare: (n: Note) => void | Promise<void>;
    onShareClick?: () => void;
    onExportPdf: () => void;
}) {
    if (!note) return null;

    return (
        <Dialog open={!!note} onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                className="bg-white dark:bg-zinc-900 border-border text-foreground w-[95vw] sm:w-full max-w-3xl max-h-[90vh] sm:max-h-[95vh] flex flex-col p-0 print:hidden"
                showCloseButton={false}
            >
                {/* Barre d'outils */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-4 py-3 border-b border-border bg-muted/30 shrink-0">
                    <DialogTitle className="font-semibold text-foreground truncate flex-1 m-0 text-sm sm:text-base">
                        {note.title}
                    </DialogTitle>
                    <div className="flex items-center gap-1 shrink-0 flex-wrap">
                        {(isEditable ?? isCreator) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={() => onEdit(note)}
                                title="Modifier"
                            >
                                <Pencil className="w-4 h-4" />
                                <span className="hidden sm:inline">Modifier</span>
                            </Button>
                        )}
                        {isCreator && onShareClick && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={onShareClick}
                                title="Partager avec un utilisateur"
                            >
                                <UserPlus className="w-4 h-4" />
                                <span className="hidden sm:inline">Partager</span>
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => onShare(note)}
                            title="Copier"
                        >
                            <Copy className="w-4 h-4" />
                            <span className="hidden sm:inline">Copier</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={onExportPdf}
                            title="Exporter en PDF"
                        >
                            <FileDown className="w-4 h-4" />
                            <span className="hidden sm:inline">Exporter PDF</span>
                        </Button>
                        {isCreator && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-destructive hover:text-destructive"
                                onClick={() => onDelete(note)}
                                title="Supprimer"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Supprimer</span>
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={onClose}
                            title="Fermer"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Métadonnées */}
                <div className="px-3 sm:px-4 py-2 border-b border-border flex flex-wrap items-center gap-2 text-xs text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(note.updatedAt)}
                    </span>
                    {note.creator?.name && (
                        <span>{isCreator ? "Par vous" : `Par ${note.creator.name}`}</span>
                    )}
                    {!isCreator && note.creator?.name && (
                        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">
                            Note partagée
                        </span>
                    )}
                </div>

                {/* Contenu style document PDF */}
                <div className="flex-1 overflow-y-auto overflow-x-auto p-3 sm:p-6 md:p-8 min-h-0">
                    <div
                        id="note-pdf-content"
                        className="note-pdf-document max-w-[210mm] mx-auto bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 rounded-lg shadow-sm p-4 sm:p-8 md:p-12 min-w-0 overflow-x-auto"
                        dangerouslySetInnerHTML={{ __html: note.content || "<p></p>" }}
                    />
                </div>
            </DialogContent>
            <style jsx global>{`
                .note-pdf-document h1 { font-size: 1.5rem; font-weight: 700; margin: 0.75em 0 0.25em; }
                .note-pdf-document h2 { font-size: 1.25rem; font-weight: 600; margin: 0.75em 0 0.25em; }
                .note-pdf-document h3 { font-size: 1.125rem; font-weight: 600; margin: 0.5em 0 0.25em; }
                .note-pdf-document p { margin: 0.5em 0; line-height: 1.6; }
                .note-pdf-document ul:not([data-type="taskList"]) { list-style-type: disc; padding-left: 1.5rem; margin: 0.5em 0; }
                .note-pdf-document ol { list-style-type: decimal; padding-left: 1.5rem; margin: 0.5em 0; }
                .note-pdf-document blockquote { border-left: 4px solid var(--border); padding-left: 1rem; margin: 0.5em 0; color: var(--muted-foreground); }
                .note-pdf-document pre { background: var(--muted); padding: 0.75rem 1rem; border-radius: 0.375rem; overflow-x: auto; font-size: 0.875rem; }
                .note-pdf-document hr { border: none; border-top: 1px solid var(--border); margin: 1em 0; }
                .note-pdf-document ul[data-type="taskList"] { list-style: none; padding-left: 0; }
                .note-pdf-document ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
                .note-pdf-document ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; opacity: 0.7; }
            `}</style>
        </Dialog>
    );
}

function EmptyState({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-12 sm:py-20 px-4 text-center gap-3">
            {icon}
            <h3 className="text-sm sm:text-base font-semibold text-foreground">{title}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xs">{description}</p>
        </div>
    );
}

function NoteCard({
    note,
    isCreator,
    isEditable,
    onView,
    onEdit,
    onDelete,
}: {
    note: Note;
    isCreator: boolean;
    isEditable: boolean;
    onView: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const preview = stripHtml(note.content);
    const isShared = note.shares && note.shares.length > 0;

    return (
        <div
            className="group relative flex flex-col p-3 sm:p-4 rounded-xl border border-border bg-card hover:bg-muted/50 active:bg-muted/70 transition-colors cursor-pointer touch-manipulation"
            onClick={onView}
        >
            {/* titre + badge */}
            <div className="flex items-center gap-1.5 pr-20 sm:pr-16">
                <h3 className="font-semibold text-foreground text-sm line-clamp-1 flex-1 min-w-0">
                    {note.title}
                </h3>
                {!isCreator && (
                    <span className="shrink-0 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">
                        Partagée
                    </span>
                )}
                {isCreator && isShared && (
                    <span className="shrink-0 bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-[10px]">
                        Partagée
                    </span>
                )}
            </div>

            {/* aperçu du contenu */}
            {preview && (
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 sm:line-clamp-3 leading-relaxed">
                    {preview}
                </p>
            )}

            {/* pied : date + auteur */}
            <div className="mt-2 sm:mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                <Clock className="w-3 h-3 shrink-0" />
                <span className="truncate">{formatDate(note.updatedAt)}</span>
                {note.creator?.name && (
                    <>
                        <span className="mx-0.5 shrink-0">·</span>
                        <span className="truncate">{isCreator ? "Vous" : note.creator.name}</span>
                    </>
                )}
            </div>

            {/* actions : visibles sur mobile, au survol sur desktop */}
            <div className="absolute top-2 sm:top-3 right-2 sm:right-3 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {isEditable && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                        title="Modifier"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </Button>
                )}
                {isCreator && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        title="Supprimer"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}
