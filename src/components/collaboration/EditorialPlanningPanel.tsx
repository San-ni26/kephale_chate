'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/src/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/src/components/ui/select';
import {
    Calendar,
    Plus,
    Loader2,
    Pencil,
    Trash2,
    FileText,
    Image as ImageIcon,
    Video,
    Mic,
    Mail,
    Share2,
    MoreHorizontal,
    ChevronRight,
} from 'lucide-react';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const TYPE_LABELS: Record<string, string> = {
    ARTICLE: 'Article',
    POST: 'Post',
    VIDEO: 'Vidéo',
    STORY: 'Story',
    PODCAST: 'Podcast',
    NEWSLETTER: 'Newsletter',
    OTHER: 'Autre',
};

const TYPE_ICONS: Record<string, React.ElementType> = {
    ARTICLE: FileText,
    POST: Share2,
    VIDEO: Video,
    STORY: ImageIcon,
    PODCAST: Mic,
    NEWSLETTER: Mail,
    OTHER: MoreHorizontal,
};

const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Brouillon',
    IN_PROGRESS: 'En cours',
    REVIEW: 'Révision',
    PUBLISHED: 'Publié',
};

const UNASSIGNED_VALUE = '__none__';

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-muted text-muted-foreground border-muted-foreground/30',
    IN_PROGRESS: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    REVIEW: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    PUBLISHED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
};

interface EditorialItem {
    id: string;
    title: string;
    description: string | null;
    type: string;
    status: string;
    channel: string | null;
    scheduledAt: string | null;
    publishedAt: string | null;
    assigneeId: string | null;
    order: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    creator?: { id: string; name: string | null; email: string };
    assignee?: { id: string; name: string | null; email: string } | null;
}

interface EditorialPlanningPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** URL de base de l'API (ex: /api/organizations/x/departments/y ou /api/organizations/x/collaborations/y/groups/z) */
    baseUrl: string;
    members: Array<{ id: string; user: { id: string; name: string | null; email: string } }>;
}

export function EditorialPlanningPanel({
    open,
    onOpenChange,
    baseUrl,
    members,
}: EditorialPlanningPanelProps) {
    const [items, setItems] = useState<EditorialItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<EditorialItem | null>(null);
    const [formTitle, setFormTitle] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formType, setFormType] = useState<string>('POST');
    const [formStatus, setFormStatus] = useState<string>('DRAFT');
    const [formChannel, setFormChannel] = useState('');
    const [formScheduledAt, setFormScheduledAt] = useState('');
    const [formAssigneeId, setFormAssigneeId] = useState<string>(UNASSIGNED_VALUE);
    const [formSaving, setFormSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<EditorialItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
    const [selectedMonth, setSelectedMonth] = useState<string>(() => format(new Date(), 'yyyy-MM'));
    const [selectedColumn, setSelectedColumn] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        if (!baseUrl) return;
        setLoading(true);
        try {
            const url = selectedMonth === 'all' ? `${baseUrl}/editorial` : `${baseUrl}/editorial?month=${selectedMonth}`;
            const res = await fetchWithAuth(url);
            if (res.ok) {
                const data = await res.json();
                setItems(data.items || []);
            } else {
                toast.error('Erreur chargement du planning');
            }
        } catch {
            toast.error('Erreur chargement du planning');
        } finally {
            setLoading(false);
        }
    }, [baseUrl, selectedMonth]);

    useEffect(() => {
        if (open) fetchItems();
    }, [open, fetchItems]);

    useEffect(() => {
        if (!open) setSelectedColumn(null);
    }, [open]);

    const resetForm = () => {
        setEditingItem(null);
        setFormTitle('');
        setFormDescription('');
        setFormType('POST');
        setFormStatus('DRAFT');
        setFormChannel('');
        setFormScheduledAt('');
        setFormAssigneeId(UNASSIGNED_VALUE);
    };

    const openCreate = () => {
        resetForm();
        setFormOpen(true);
    };

    const openEdit = (item: EditorialItem) => {
        setEditingItem(item);
        setFormTitle(item.title);
        setFormDescription(item.description || '');
        setFormType(item.type);
        setFormStatus(item.status);
        setFormChannel(item.channel || '');
        setFormScheduledAt(item.scheduledAt ? item.scheduledAt.slice(0, 16) : '');
        setFormAssigneeId(item.assigneeId || UNASSIGNED_VALUE);
        setFormOpen(true);
    };

    const saveItem = async () => {
        if (!baseUrl || !formTitle.trim()) return;
        setFormSaving(true);
        try {
            const payload = {
                title: formTitle.trim(),
                description: formDescription.trim() || null,
                type: formType,
                status: formStatus,
                channel: formChannel.trim() || null,
                scheduledAt: formScheduledAt ? new Date(formScheduledAt).toISOString() : null,
                assigneeId: formAssigneeId && formAssigneeId !== UNASSIGNED_VALUE ? formAssigneeId : null,
            };

            if (editingItem) {
                const res = await fetchWithAuth(`${baseUrl}/editorial/${editingItem.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (res.ok) {
                    const data = await res.json();
                    setItems((prev) => prev.map((i) => (i.id === editingItem.id ? data.item : i)));
                    toast.success('Contenu mis à jour');
                    setFormOpen(false);
                } else {
                    const err = await res.json();
                    toast.error(err.error || 'Erreur');
                }
            } else {
                const res = await fetchWithAuth(`${baseUrl}/editorial`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (res.ok) {
                    const data = await res.json();
                    setItems((prev) => [data.item, ...prev]);
                    toast.success('Contenu ajouté au planning');
                    setFormOpen(false);
                } else {
                    const err = await res.json();
                    toast.error(err.error || 'Erreur');
                }
            }
        } catch {
            toast.error('Erreur');
        } finally {
            setFormSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!baseUrl || !deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetchWithAuth(`${baseUrl}/editorial/${deleteTarget.id}`, { method: 'DELETE' });
            if (res.ok) {
                setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
                setDeleteTarget(null);
                toast.success('Contenu supprimé');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch {
            toast.error('Erreur');
        } finally {
            setDeleting(false);
        }
    };

    const columns = ['DRAFT', 'IN_PROGRESS', 'REVIEW', 'PUBLISHED'] as const;
    const itemsByStatus = columns.reduce((acc, s) => {
        acc[s] = items.filter((i) => i.status === s);
        return acc;
    }, {} as Record<string, EditorialItem[]>);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-6xl max-h-[90vh] w-[95vw] sm:w-full flex flex-col bg-card border-border overflow-hidden" showCloseButton>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5" />
                            Planning éditorial
                        </DialogTitle>
                        <DialogDescription>
                            Planifiez vos contenus (articles, posts, vidéos…) et suivez leur avancement. Tous les membres du groupe peuvent créer et modifier.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-3 sm:gap-4 flex-1 min-h-0 overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 shrink-0">
                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                    <SelectTrigger className="w-full sm:w-[180px] min-w-0">
                                        <SelectValue placeholder="Mois" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tous les contenus</SelectItem>
                                        {[-2, -1, 0, 1, 2].map((delta) => {
                                            const d = new Date();
                                            d.setMonth(d.getMonth() + delta);
                                            const val = format(d, 'yyyy-MM');
                                            return (
                                                <SelectItem key={val} value={val}>
                                                    {format(d, 'MMMM yyyy', { locale: fr })}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                                <div className="flex rounded-lg border border-border p-0.5">
                                    <Button
                                        variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className="flex-1 sm:flex-none"
                                        onClick={() => { setViewMode('kanban'); setSelectedColumn(null); }}
                                    >
                                        Colonnes
                                    </Button>
                                    <Button
                                        variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className="flex-1 sm:flex-none"
                                        onClick={() => { setViewMode('list'); setSelectedColumn(null); }}
                                    >
                                        Liste
                                    </Button>
                                </div>
                            </div>
                            <Button onClick={openCreate} size="sm" className="w-full sm:w-auto shrink-0 bg-primary text-primary-foreground hover:bg-primary/90">
                                <Plus className="w-4 h-4 mr-2" />
                                Nouveau contenu
                            </Button>
                        </div>

                        <div className="flex-1 min-h-[280px] overflow-auto -mx-1 px-1">
                            {loading ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : viewMode === 'kanban' ? (
                                <div className="flex flex-col gap-3 h-full">
                                    {selectedColumn ? (
                                        <>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedColumn(null)}
                                                >
                                                    ← Toutes les colonnes
                                                </Button>
                                                <span className="text-sm text-muted-foreground">
                                                    {STATUS_LABELS[selectedColumn]} ({itemsByStatus[selectedColumn]?.length || 0})
                                                </span>
                                            </div>
                                            <div className="flex-1 overflow-y-auto min-h-0">
                                                <div className="space-y-2">
                                                    {(itemsByStatus[selectedColumn] || []).map((item) => (
                                                        <EditorialCard
                                                            key={item.id}
                                                            item={item}
                                                            onEdit={() => openEdit(item)}
                                                            onDelete={() => setDeleteTarget(item)}
                                                        />
                                                    ))}
                                                    {(itemsByStatus[selectedColumn]?.length || 0) === 0 && (
                                                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                                                            <p>Aucun contenu dans cette colonne</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-x-visible">
                                            {columns.map((status) => (
                                                <div
                                                    key={status}
                                                    className={cn(
                                                        "flex flex-col rounded-xl border min-h-[200px] min-w-[260px] sm:min-w-0 shrink-0 sm:shrink transition",
                                                        "border-border bg-muted/30 hover:border-primary/50"
                                                    )}
                                                >
                                                    <div
                                                        className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0 cursor-pointer hover:bg-muted/50 rounded-t-xl transition"
                                                        onClick={() => setSelectedColumn(status)}
                                                        title="Cliquer pour afficher le contenu de cette colonne"
                                                    >
                                                        <span className="text-sm font-medium text-foreground truncate">
                                                            {STATUS_LABELS[status]}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                            <span className="text-xs text-muted-foreground">
                                                                {itemsByStatus[status]?.length || 0}
                                                            </span>
                                                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-0">
                                                        {(itemsByStatus[status] || []).map((item) => (
                                                            <EditorialCard
                                                                key={item.id}
                                                                item={item}
                                                                onEdit={() => openEdit(item)}
                                                                onDelete={() => setDeleteTarget(item)}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {items.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm">
                                            <Calendar className="w-12 h-12 mb-2 opacity-50" />
                                            <p>Aucun contenu planifié</p>
                                            <Button variant="outline" size="sm" className="mt-2" onClick={openCreate}>
                                                <Plus className="w-4 h-4 mr-2" />
                                                Ajouter un contenu
                                            </Button>
                                        </div>
                                    ) : (
                                        items.map((item) => (
                                            <EditorialListRow
                                                key={item.id}
                                                item={item}
                                                onEdit={() => openEdit(item)}
                                                onDelete={() => setDeleteTarget(item)}
                                            />
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] flex flex-col bg-card border-border p-4 sm:p-6 overflow-hidden">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="text-base sm:text-lg">{editingItem ? 'Modifier le contenu' : 'Nouveau contenu'}</DialogTitle>
                        <DialogDescription className="text-sm">
                            Définissez le titre, le type, la date de publication et assignez un responsable.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2 overflow-y-auto min-h-0 flex-1 -mx-1 px-1">
                        <div>
                            <label className="text-sm font-medium">Titre *</label>
                            <Input
                                value={formTitle}
                                onChange={(e) => setFormTitle(e.target.value)}
                                placeholder="Ex: Article blog mars"
                                className="mt-1 w-full min-w-0"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Description</label>
                            <Textarea
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                placeholder="Résumé ou notes..."
                                className="mt-1 min-h-[80px] w-full min-w-0 resize-none"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="min-w-0">
                                <label className="text-sm font-medium">Type</label>
                                <Select value={formType} onValueChange={setFormType}>
                                    <SelectTrigger className="mt-1 w-full min-w-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(TYPE_LABELS).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="min-w-0">
                                <label className="text-sm font-medium">Statut</label>
                                <Select value={formStatus} onValueChange={setFormStatus}>
                                    <SelectTrigger className="mt-1 w-full min-w-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="min-w-0">
                                <label className="text-sm font-medium">Canal</label>
                                <Input
                                    value={formChannel}
                                    onChange={(e) => setFormChannel(e.target.value)}
                                    placeholder="Instagram, LinkedIn..."
                                    className="mt-1 w-full min-w-0"
                                />
                            </div>
                            <div className="min-w-0">
                                <label className="text-sm font-medium">Date prévue</label>
                                <Input
                                    type="datetime-local"
                                    value={formScheduledAt}
                                    onChange={(e) => setFormScheduledAt(e.target.value)}
                                    className="mt-1 w-full min-w-0"
                                />
                            </div>
                        </div>
                        <div className="min-w-0">
                            <label className="text-sm font-medium">Assigné à</label>
                            <Select value={formAssigneeId} onValueChange={setFormAssigneeId}>
                                <SelectTrigger className="mt-1 w-full min-w-0">
                                    <SelectValue placeholder="Non assigné" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={UNASSIGNED_VALUE}>Non assigné</SelectItem>
                                    {members.map((m) => (
                                        <SelectItem key={m.id} value={m.user.id}>
                                            {m.user.name || m.user.email}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="shrink-0 pt-2">
                        <Button variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">
                            Annuler
                        </Button>
                        <Button onClick={saveItem} disabled={formSaving || !formTitle.trim()} className="w-full sm:w-auto">
                            {formSaving && <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />}
                            {editingItem ? 'Enregistrer' : 'Créer'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>Supprimer ce contenu</DialogTitle>
                        <DialogDescription>
                            Cette action est irréversible. Le contenu sera définitivement supprimé du planning.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                            {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function EditorialCard({
    item,
    onEdit,
    onDelete,
}: {
    item: EditorialItem;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const TypeIcon = TYPE_ICONS[item.type] || FileText;
    return (
        <div
            className="group rounded-lg border border-border bg-card p-2.5 sm:p-3 hover:border-primary/50 transition cursor-pointer"
            onClick={onEdit}
        >
            <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mb-1">
                        <TypeIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0', STATUS_COLORS[item.status])}>
                            {STATUS_LABELS[item.status]}
                        </span>
                    </div>
                    <p className="font-medium text-sm text-foreground line-clamp-2 break-words">{item.title}</p>
                    {item.channel && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.channel}</p>
                    )}
                    {item.scheduledAt && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            {format(new Date(item.scheduledAt), 'd MMM yyyy', { locale: fr })}
                        </p>
                    )}
                    {item.assignee && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            → {item.assignee.name || item.assignee.email}
                        </p>
                    )}
                </div>
                <div className="flex gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    <Button variant="ghost" size="icon" className="h-7 w-7 min-w-7" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                        <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 min-w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

function EditorialListRow({
    item,
    onEdit,
    onDelete,
}: {
    item: EditorialItem;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const TypeIcon = TYPE_ICONS[item.type] || FileText;
    return (
        <div
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition cursor-pointer group"
            onClick={onEdit}
        >
            <div className="flex items-start sm:items-center gap-2 sm:gap-4 min-w-0 flex-1">
                <TypeIcon className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5 sm:mt-0" />
                <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="font-medium text-foreground truncate">{item.title}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                        <span className="shrink-0">{TYPE_LABELS[item.type]}</span>
                        {item.channel && <span className="truncate">• {item.channel}</span>}
                        {item.scheduledAt && (
                            <span className="shrink-0">• {format(new Date(item.scheduledAt), 'd MMM yyyy', { locale: fr })}</span>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 shrink-0 flex-wrap sm:flex-nowrap">
                <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded border shrink-0', STATUS_COLORS[item.status])}>
                    {STATUS_LABELS[item.status]}
                </span>
                {item.assignee && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[100px]">
                        {item.assignee.name || item.assignee.email}
                    </span>
                )}
                <div className="flex gap-0.5 ml-auto sm:ml-0 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    <Button variant="ghost" size="icon" className="h-8 w-8 min-w-8" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                        <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 min-w-8 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
