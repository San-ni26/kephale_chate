'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/src/components/ui/dialog';
import {
    FileText,
    Search,
    Plus,
    Trash2,
    Download,
    Image as ImageIcon,
    Loader2,
    X,
    ExternalLink,
    Share2,
    StickyNote,
    Pencil,
    Clock,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { fetchWithAuth, getUser } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { dataUrlToBlob, canShareFile, shareFileFromDataUrl } from '@/src/lib/download-file';
import { NoteEditor } from '@/src/components/notes/NoteEditor';

interface Doc {
    id: string;
    filename: string;
    type: string;
    data: string;
    uploadedBy: string;
    createdAt: string;
    uploader?: { id: string; name: string | null; email: string };
}

interface DeptNote {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
    createdAt?: string;
    createdBy?: string;
    creator?: { id: string; name: string | null; email?: string };
}

function stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

interface DepartmentDocumentsPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    deptId: string;
    /** Ouvrir directement l'onglet Notes */
    initialTab?: 'documents' | 'notes';
    /** Ouvrir directement le formulaire de création de note */
    openCreateNoteOnMount?: boolean;
}

function getDocDataUrl(doc: Doc): string {
    if (doc.data.startsWith('data:')) return doc.data;
    const mime = doc.type === 'PDF' ? 'application/pdf' : doc.type === 'IMAGE' ? 'image/jpeg' : 'application/octet-stream';
    return `data:${mime};base64,${doc.data}`;
}

export function DepartmentDocumentsPanel({
    open,
    onOpenChange,
    orgId,
    deptId,
    initialTab = 'documents',
    openCreateNoteOnMount = false,
}: DepartmentDocumentsPanelProps) {
    const [documents, setDocuments] = useState<Doc[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
    const [pdfPreviewBlobUrl, setPdfPreviewBlobUrl] = useState<string | null>(null);
    const pdfPreviewBlobUrlRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /* Notes */
    const [notes, setNotes] = useState<DeptNote[]>([]);
    const [notesLoading, setNotesLoading] = useState(false);
    const [noteSearch, setNoteSearch] = useState('');
    const [viewNote, setViewNote] = useState<DeptNote | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editingNote, setEditingNote] = useState<DeptNote | null>(null);
    const [formTitle, setFormTitle] = useState('');
    const [formContent, setFormContent] = useState('');
    const [formSaving, setFormSaving] = useState(false);
    const [deleteNoteTarget, setDeleteNoteTarget] = useState<DeptNote | null>(null);
    const [deletingNote, setDeletingNote] = useState(false);
    const [activeTab, setActiveTab] = useState<'documents' | 'notes'>('documents');

    const currentUserId = getUser()?.id ?? null;

    useEffect(() => {
        if (open) {
            setActiveTab(initialTab);
        }
    }, [open, initialTab]);

    // Blob URL pour l’aperçu PDF (évite data URL dans iframe, incompatible Safari/iOS)
    useEffect(() => {
        if (!previewDoc || previewDoc.type !== 'PDF') {
            if (pdfPreviewBlobUrlRef.current) {
                URL.revokeObjectURL(pdfPreviewBlobUrlRef.current);
                pdfPreviewBlobUrlRef.current = null;
            }
            setPdfPreviewBlobUrl(null);
            return;
        }
        const dataUrl = previewDoc.data.startsWith('data:') ? previewDoc.data : `data:application/pdf;base64,${previewDoc.data}`;
        const blob = dataUrlToBlob(dataUrl);
        if (blob) {
            const url = URL.createObjectURL(blob);
            pdfPreviewBlobUrlRef.current = url;
            setPdfPreviewBlobUrl(url);
            return () => {
                URL.revokeObjectURL(url);
                pdfPreviewBlobUrlRef.current = null;
                setPdfPreviewBlobUrl(null);
            };
        }
        setPdfPreviewBlobUrl(null);
    }, [previewDoc?.id, previewDoc?.type]);

    const fetchDocuments = async (q?: string) => {
        if (!orgId || !deptId) return;
        setLoading(true);
        try {
            const url = `/api/organizations/${orgId}/departments/${deptId}/documents${q != null && q !== '' ? `?q=${encodeURIComponent(q)}` : ''}`;
            const res = await fetchWithAuth(url);
            if (res.ok) {
                const data = await res.json();
                setDocuments(data.documents || []);
            } else {
                toast.error('Erreur chargement des documents');
            }
        } catch (e) {
            toast.error('Erreur chargement des documents');
        } finally {
            setLoading(false);
        }
    };

    const fetchNotes = useCallback(async () => {
        if (!orgId || !deptId) return;
        setNotesLoading(true);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/notes`);
            if (res.ok) {
                const data = await res.json();
                setNotes(data.notes || []);
            } else {
                toast.error('Erreur chargement des notes');
            }
        } catch (e) {
            toast.error('Erreur chargement des notes');
        } finally {
            setNotesLoading(false);
        }
    }, [orgId, deptId]);

    useEffect(() => {
        if (open) {
            fetchDocuments(search);
            fetchNotes();
            if (openCreateNoteOnMount) {
                setFormTitle('');
                setFormContent('');
                setFormOpen(true);
                setEditingNote(null);
            }
        }
    }, [open, orgId, deptId, search, fetchNotes, openCreateNoteOnMount]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value.trim());
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;

        const file = files[0];
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!validTypes.includes(file.type)) {
            toast.error('Type non autorisé (images, PDF, Word)');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error('Fichier trop volumineux (max 10 Mo)');
            return;
        }

        setUploading(true);
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            let fileType = 'OTHER';
            if (['jpeg', 'jpg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'IMAGE';
            else if (ext === 'pdf') fileType = 'PDF';
            else if (['doc', 'docx'].includes(ext)) fileType = 'WORD';

            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, type: fileType, data: base64 }),
            });

            if (res.ok) {
                const data = await res.json();
                setDocuments(prev => [data.document, ...prev]);
                toast.success('Document ajouté');
                if (fileInputRef.current) fileInputRef.current.value = '';
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur ajout');
            }
        } catch (err) {
            toast.error('Erreur ajout document');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId: string) => {
        if (!confirm('Supprimer ce document ?')) return;
        setDeletingId(docId);
        try {
            const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/documents/${docId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setDocuments(prev => prev.filter(d => d.id !== docId));
                if (previewDoc?.id === docId) setPreviewDoc(null);
                toast.success('Document supprimé');
            } else {
                toast.error('Impossible de supprimer');
            }
        } catch {
            toast.error('Erreur suppression');
        } finally {
            setDeletingId(null);
        }
    };

    /* Note handlers */
    const openCreateNote = () => {
        setEditingNote(null);
        setFormTitle('');
        setFormContent('');
        setFormOpen(true);
    };
    const openEditNote = (n: DeptNote) => {
        setEditingNote(n);
        setFormTitle(n.title);
        setFormContent(n.content || '');
        setFormOpen(true);
    };
    const saveNote = async () => {
        if (!orgId || !deptId || !formTitle.trim()) return;
        setFormSaving(true);
        try {
            if (editingNote) {
                const res = await fetchWithAuth(
                    `/api/organizations/${orgId}/departments/${deptId}/notes/${editingNote.id}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: formTitle.trim(), content: formContent }),
                    }
                );
                if (!res.ok) {
                    const err = await res.json();
                    toast.error(err.error || 'Erreur');
                    return;
                }
                toast.success('Note mise à jour');
                setFormOpen(false);
                fetchNotes();
                if (viewNote?.id === editingNote.id) {
                    const data = await res.json();
                    setViewNote(data.note);
                }
            } else {
                const res = await fetchWithAuth(`/api/organizations/${orgId}/departments/${deptId}/notes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: formTitle.trim(), content: formContent }),
                });
                if (!res.ok) {
                    const err = await res.json();
                    toast.error(err.error || 'Erreur');
                    return;
                }
                const data = await res.json();
                toast.success('Note créée');
                setFormOpen(false);
                setNotes(prev => [data.note, ...prev]);
            }
        } catch (e) {
            toast.error('Erreur');
        } finally {
            setFormSaving(false);
        }
    };
    const confirmDeleteNote = async () => {
        if (!orgId || !deptId || !deleteNoteTarget) return;
        setDeletingNote(true);
        try {
            const res = await fetchWithAuth(
                `/api/organizations/${orgId}/departments/${deptId}/notes/${deleteNoteTarget.id}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                setNotes(prev => prev.filter(n => n.id !== deleteNoteTarget.id));
                if (viewNote?.id === deleteNoteTarget.id) setViewNote(null);
                setDeleteNoteTarget(null);
                toast.success('Note supprimée');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch (e) {
            toast.error('Erreur');
        } finally {
            setDeletingNote(false);
        }
    };

    const filtered = documents;
    const filteredNotes = noteSearch.trim()
        ? notes.filter(
              n =>
                  n.title.toLowerCase().includes(noteSearch.toLowerCase()) ||
                  stripHtml(n.content).toLowerCase().includes(noteSearch.toLowerCase())
          )
        : notes;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="max-w-2xl max-h-[90vh] flex flex-col bg-card border-border"
                    showCloseButton={true}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            Fiches & documents du département
                        </DialogTitle>
                        <DialogDescription>
                            Documents partagés et notes du département. Les notes sont visibles par tous les membres, modifiables uniquement par leur créateur.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'documents' | 'notes')} className="flex flex-col flex-1 min-h-0">
                        <TabsList className="shrink-0">
                            <TabsTrigger value="documents">Documents</TabsTrigger>
                            <TabsTrigger value="notes">Notes</TabsTrigger>
                        </TabsList>

                        <TabsContent value="documents" className="flex flex-col gap-3 flex-1 min-h-0 mt-3">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Rechercher un document..."
                                    value={search}
                                    onChange={handleSearch}
                                    className="pl-9 bg-muted border-border"
                                />
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.pdf,.doc,.docx"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="shrink-0"
                            >
                                {uploading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Plus className="w-4 h-4 mr-1" />
                                )}
                                Ajouter
                            </Button>
                        </div>

                        <div className={cn('overflow-y-auto border border-border rounded-lg bg-muted/30 min-h-[200px]', previewDoc ? 'flex-1 max-h-[40vh]' : 'flex-1')}>
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                                    <FileText className="w-12 h-12 mb-2 opacity-50" />
                                    <p>Aucun document. Ajoutez une fiche ou un fichier.</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-border p-2">
                                    {filtered.map((doc) => (
                                        <li
                                            key={doc.id}
                                            className={cn(
                                                'flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition',
                                                previewDoc?.id === doc.id && 'bg-primary/10'
                                            )}
                                        >
                                            <div className="flex-shrink-0">
                                                {doc.type === 'IMAGE' ? (
                                                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                                                ) : (
                                                    <FileText className="w-8 h-8 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate text-foreground">{doc.filename}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {doc.uploader?.name || doc.uploader?.email || 'Inconnu'} · {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => setPreviewDoc(doc)}
                                                    title="Voir dans la page"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Button>
                                                {canShareFile() && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground"
                                                        onClick={async () => {
                                                            const dataUrl = doc.data.startsWith('data:') ? doc.data : getDocDataUrl(doc);
                                                            const ok = await shareFileFromDataUrl(dataUrl, doc.filename);
                                                            if (ok) toast.success('Partage ouvert');
                                                            else toast.error('Partage non disponible');
                                                        }}
                                                        title="Partager"
                                                    >
                                                        <Share2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground"
                                                    onClick={() => {
                                                        try {
                                                            const url = doc.data.startsWith('data:') ? doc.data : `data:application/octet-stream;base64,${doc.data}`;
                                                            const a = document.createElement('a');
                                                            a.href = url;
                                                            a.download = doc.filename;
                                                            a.click();
                                                            toast.success('Téléchargement démarré');
                                                        } catch {
                                                            toast.error('Erreur téléchargement');
                                                        }
                                                    }}
                                                    title="Télécharger"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleDelete(doc.id)}
                                                    disabled={deletingId === doc.id}
                                                    title="Supprimer"
                                                >
                                                    {deletingId === doc.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Aperçu du document dans la même page (inline) */}
                        {previewDoc && (
                            <div className="border-t border-border pt-3 flex flex-col gap-2 flex-1 min-h-0">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium truncate text-foreground">{previewDoc.filename}</p>
                                    <div className="flex gap-1 shrink-0">
                                        {canShareFile() && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={async () => {
                                                    const dataUrl = previewDoc.data.startsWith('data:') ? previewDoc.data : getDocDataUrl(previewDoc);
                                                    const ok = await shareFileFromDataUrl(dataUrl, previewDoc.filename);
                                                    if (ok) toast.success('Partage ouvert');
                                                    else toast.error('Partage non disponible');
                                                }}
                                            >
                                                <Share2 className="w-4 h-4 mr-1" />
                                                Partager
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const url = previewDoc.data.startsWith('data:') ? previewDoc.data : `data:application/octet-stream;base64,${previewDoc.data}`;
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = previewDoc.filename;
                                                a.click();
                                                toast.success('Téléchargement démarré');
                                            }}
                                        >
                                            <Download className="w-4 h-4 mr-1" />
                                            Télécharger
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setPreviewDoc(null)}>
                                            <X className="w-4 h-4 mr-1" />
                                            Fermer l&apos;aperçu
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-[240px] max-h-[50vh] rounded-lg border border-border bg-muted/20 overflow-auto">
                                    {previewDoc.type === 'IMAGE' ? (
                                        <img
                                            src={previewDoc.data.startsWith('data:') ? previewDoc.data : `data:image/jpeg;base64,${previewDoc.data}`}
                                            alt={previewDoc.filename}
                                            className="max-w-full h-auto object-contain"
                                        />
                                    ) : previewDoc.type === 'PDF' ? (
                                        pdfPreviewBlobUrl ? (
                                            <iframe
                                                key={pdfPreviewBlobUrl}
                                                src={pdfPreviewBlobUrl}
                                                title={previewDoc.filename}
                                                className="w-full h-full min-h-[400px] border-0"
                                            />
                                        ) : (
                                            <div className="p-4 flex flex-col items-center justify-center text-muted-foreground text-sm min-h-[240px]">
                                                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                                <p>Chargement de l&apos;aperçu…</p>
                                                <Button variant="outline" size="sm" className="mt-2" asChild>
                                                    <a
                                                        href={previewDoc.data.startsWith('data:') ? previewDoc.data : `data:application/pdf;base64,${previewDoc.data}`}
                                                        download={previewDoc.filename}
                                                    >
                                                        <Download className="w-4 h-4 mr-1" />
                                                        Télécharger le PDF
                                                    </a>
                                                </Button>
                                            </div>
                                        )
                                    ) : (
                                        <div className="p-4 flex flex-col items-center justify-center text-muted-foreground text-sm">
                                            <FileText className="w-12 h-12 mb-2 opacity-50" />
                                            <p>Ce type de fichier ne peut pas être prévisualisé ici.</p>
                                            <Button variant="outline" size="sm" className="mt-2" asChild>
                                                <a
                                                    href={previewDoc.data.startsWith('data:') ? previewDoc.data : `data:application/octet-stream;base64,${previewDoc.data}`}
                                                    download={previewDoc.filename}
                                                >
                                                    <Download className="w-4 h-4 mr-1" />
                                                    Télécharger pour ouvrir
                                                </a>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        </TabsContent>

                        <TabsContent value="notes" className="flex flex-col gap-3 flex-1 min-h-0 mt-3">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Rechercher une note..."
                                        value={noteSearch}
                                        onChange={(e) => setNoteSearch(e.target.value)}
                                        className="pl-9 bg-muted border-border"
                                    />
                                </div>
                                <Button variant="outline" size="sm" onClick={openCreateNote} className="shrink-0">
                                    <Plus className="w-4 h-4 mr-1" />
                                    Nouvelle note
                                </Button>
                            </div>

                            {viewNote ? (
                                <div className="flex flex-col gap-2 flex-1 min-h-0 border border-border rounded-lg bg-muted/30 overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50 shrink-0">
                                        <h3 className="font-semibold truncate">{viewNote.title}</h3>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {viewNote.creator?.id === currentUserId && (
                                                <>
                                                    <Button variant="ghost" size="sm" onClick={() => openEditNote(viewNote)}>
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive"
                                                        onClick={() => setDeleteNoteTarget(viewNote)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </>
                                            )}
                                            <Button variant="ghost" size="sm" onClick={() => setViewNote(null)}>
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3">
                                        <div
                                            className="prose prose-sm dark:prose-invert max-w-none [&_ul]:list-disc [&_ol]:list-decimal"
                                            dangerouslySetInnerHTML={{ __html: viewNote.content || '' }}
                                        />
                                    </div>
                                    <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border">
                                        Par {viewNote.creator?.name || viewNote.creator?.email || 'Inconnu'} · {formatDate(viewNote.updatedAt)}
                                    </div>
                                </div>
                            ) : (
                                <div className={cn('overflow-y-auto border border-border rounded-lg bg-muted/30 min-h-[200px] flex-1')}>
                                    {notesLoading ? (
                                        <div className="flex justify-center py-12">
                                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : filteredNotes.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                                            <StickyNote className="w-12 h-12 mb-2 opacity-50" />
                                            <p>Aucune note. Créez une note pour le département.</p>
                                            <Button variant="outline" size="sm" className="mt-2" onClick={openCreateNote}>
                                                <Plus className="w-4 h-4 mr-1" />
                                                Nouvelle note
                                            </Button>
                                        </div>
                                    ) : (
                                        <ul className="divide-y divide-border p-2">
                                            {filteredNotes.map((note) => (
                                                <li
                                                    key={note.id}
                                                    className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition cursor-pointer"
                                                    onClick={() => setViewNote(note)}
                                                >
                                                    <StickyNote className="w-8 h-8 text-muted-foreground shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium truncate text-foreground">{note.title}</p>
                                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {formatDate(note.updatedAt)}
                                                            {note.creator?.name && (
                                                                <> · {note.creator.name}</>
                                                            )}
                                                        </p>
                                                    </div>
                                                    {note.creator?.id === currentUserId && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 shrink-0"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openEditNote(note);
                                                            }}
                                                            title="Modifier"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>

                    {/* Dialog: créer/éditer note */}
                    <Dialog open={formOpen} onOpenChange={setFormOpen}>
                        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-card border-border">
                            <DialogHeader>
                                <DialogTitle>{editingNote ? 'Modifier la note' : 'Nouvelle note'}</DialogTitle>
                                <DialogDescription>
                                    {editingNote ? 'Modifiez le titre et le contenu.' : 'Les membres du département pourront consulter cette note (lecture seule).'}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col gap-3 flex-1 min-h-0">
                                <Input
                                    placeholder="Titre"
                                    value={formTitle}
                                    onChange={(e) => setFormTitle(e.target.value)}
                                    className="bg-muted border-border"
                                />
                                <div className="flex-1 min-h-[200px] border border-border rounded-lg overflow-hidden">
                                    <NoteEditor content={formContent} onChange={setFormContent} editable={true} />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setFormOpen(false)}>Annuler</Button>
                                <Button onClick={saveNote} disabled={formSaving || !formTitle.trim()}>
                                    {formSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                    {editingNote ? 'Enregistrer' : 'Créer'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Dialog: confirmer suppression note */}
                    <Dialog open={!!deleteNoteTarget} onOpenChange={(o) => !o && setDeleteNoteTarget(null)}>
                        <DialogContent className="bg-card border-border">
                            <DialogHeader>
                                <DialogTitle>Supprimer la note</DialogTitle>
                                <DialogDescription>
                                    Cette action est irréversible. La note sera définitivement supprimée.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDeleteNoteTarget(null)}>Annuler</Button>
                                <Button variant="destructive" onClick={confirmDeleteNote} disabled={deletingNote}>
                                    {deletingNote && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                    Supprimer
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </DialogContent>
            </Dialog>
        </>
    );
}
