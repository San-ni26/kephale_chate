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
    ArrowLeft,
    StickyNote,
    Pencil,
    Clock,
    Copy,
    FileDown,
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

interface CollabNote {
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

interface CollaborationDocumentsPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    collabId: string;
    groupId: string;
    initialTab?: 'documents' | 'notes';
    openCreateNoteOnMount?: boolean;
}

function getDocDataUrl(doc: Doc): string {
    if (doc.data.startsWith('data:')) return doc.data;
    const mime = doc.type === 'PDF' ? 'application/pdf' : doc.type === 'IMAGE' ? 'image/jpeg' : 'application/octet-stream';
    return `data:${mime};base64,${doc.data}`;
}

export function CollaborationDocumentsPanel({
    open,
    onOpenChange,
    orgId,
    collabId,
    groupId,
    initialTab = 'documents',
    openCreateNoteOnMount = false,
}: CollaborationDocumentsPanelProps) {
    const baseUrl = `/api/organizations/${orgId}/collaborations/${collabId}/groups/${groupId}`;
    const [documents, setDocuments] = useState<Doc[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
    const [pdfPreviewBlobUrl, setPdfPreviewBlobUrl] = useState<string | null>(null);
    const pdfPreviewBlobUrlRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [notes, setNotes] = useState<CollabNote[]>([]);
    const [notesLoading, setNotesLoading] = useState(false);
    const [noteSearch, setNoteSearch] = useState('');
    const [viewNote, setViewNote] = useState<CollabNote | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editingNote, setEditingNote] = useState<CollabNote | null>(null);
    const [formTitle, setFormTitle] = useState('');
    const [formContent, setFormContent] = useState('');
    const [formSaving, setFormSaving] = useState(false);
    const [deleteNoteTarget, setDeleteNoteTarget] = useState<CollabNote | null>(null);
    const [deletingNote, setDeletingNote] = useState(false);
    const [activeTab, setActiveTab] = useState<'documents' | 'notes'>('documents');

    const currentUserId = getUser()?.id ?? null;

    useEffect(() => {
        if (open) setActiveTab(initialTab);
    }, [open, initialTab]);

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
        if (!baseUrl) return;
        setLoading(true);
        try {
            const url = `${baseUrl}/documents${q != null && q !== '' ? `?q=${encodeURIComponent(q)}` : ''}`;
            const res = await fetchWithAuth(url);
            if (res.ok) {
                const data = await res.json();
                setDocuments(data.documents || []);
            } else {
                toast.error('Erreur chargement des documents');
            }
        } catch {
            toast.error('Erreur chargement des documents');
        } finally {
            setLoading(false);
        }
    };

    const fetchNotes = useCallback(async () => {
        if (!baseUrl) return;
        setNotesLoading(true);
        try {
            const res = await fetchWithAuth(`${baseUrl}/notes`);
            if (res.ok) {
                const data = await res.json();
                setNotes(data.notes || []);
            } else {
                toast.error('Erreur chargement des notes');
            }
        } catch {
            toast.error('Erreur chargement des notes');
        } finally {
            setNotesLoading(false);
        }
    }, [baseUrl]);

    useEffect(() => {
        if (open && baseUrl) {
            fetchDocuments(search);
            fetchNotes();
            if (openCreateNoteOnMount) {
                setFormTitle('');
                setFormContent('');
                setFormOpen(true);
                setEditingNote(null);
            }
        }
    }, [open, baseUrl, search, fetchNotes, openCreateNoteOnMount]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value.trim());

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

            const res = await fetchWithAuth(`${baseUrl}/documents`, {
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
        } catch {
            toast.error('Erreur ajout document');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId: string) => {
        if (!confirm('Supprimer ce document ?')) return;
        setDeletingId(docId);
        try {
            const res = await fetchWithAuth(`${baseUrl}/documents/${docId}`, { method: 'DELETE' });
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

    const openCreateNote = () => {
        setEditingNote(null);
        setFormTitle('');
        setFormContent('');
        setFormOpen(true);
    };
    const openEditNote = (n: CollabNote) => {
        setEditingNote(n);
        setFormTitle(n.title);
        setFormContent(n.content || '');
        setFormOpen(true);
    };
    const saveNote = async () => {
        if (!baseUrl || !formTitle.trim()) return;
        setFormSaving(true);
        try {
            if (editingNote) {
                const res = await fetchWithAuth(`${baseUrl}/notes/${editingNote.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: formTitle.trim(), content: formContent }),
                });
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
                const res = await fetchWithAuth(`${baseUrl}/notes`, {
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
        } catch {
            toast.error('Erreur');
        } finally {
            setFormSaving(false);
        }
    };
    const confirmDeleteNote = async () => {
        if (!baseUrl || !deleteNoteTarget) return;
        setDeletingNote(true);
        try {
            const res = await fetchWithAuth(`${baseUrl}/notes/${deleteNoteTarget.id}`, { method: 'DELETE' });
            if (res.ok) {
                setNotes(prev => prev.filter(n => n.id !== deleteNoteTarget.id));
                if (viewNote?.id === deleteNoteTarget.id) setViewNote(null);
                setDeleteNoteTarget(null);
                toast.success('Note supprimée');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erreur');
            }
        } catch {
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
                            Fiches & documents du groupe
                        </DialogTitle>
                        <DialogDescription>
                            Documents partagés et notes du groupe de collaboration. Les notes sont visibles par tous les membres, modifiables uniquement par leur créateur.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'documents' | 'notes')} className="flex flex-col flex-1 min-h-0">
                        <TabsList className="shrink-0">
                            <TabsTrigger value="documents">Documents</TabsTrigger>
                            <TabsTrigger value="notes">Notes</TabsTrigger>
                        </TabsList>

                        <TabsContent value="documents" className="flex flex-col gap-3 flex-1 min-h-0 mt-3">
                            {previewDoc ? (
                                <DocumentViewerInline
                                    doc={previewDoc}
                                    pdfBlobUrl={pdfPreviewBlobUrl}
                                    onClose={() => setPreviewDoc(null)}
                                    getDocDataUrl={getDocDataUrl}
                                />
                            ) : (
                                <>
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
                                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                                            Ajouter
                                        </Button>
                                    </div>

                                    <div className="overflow-y-auto border border-border rounded-lg bg-muted/30 min-h-[200px] flex-1">
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
                                                    <li key={doc.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition">
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
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewDoc(doc)} title="Voir">
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
                                                                {deletingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                            </Button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </>
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

                            <div className="overflow-y-auto flex-1 min-h-0">
                                {notesLoading ? (
                                    <div className="flex justify-center py-12">
                                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                    </div>
                                ) : filteredNotes.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                                        <StickyNote className="w-12 h-12 mb-2 opacity-50" />
                                        <p>Aucune note. Créez une note pour le groupe.</p>
                                        <Button variant="outline" size="sm" className="mt-2" onClick={openCreateNote}>
                                            <Plus className="w-4 h-4 mr-1" />
                                            Nouvelle note
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {filteredNotes.map((note) => (
                                            <NoteCard
                                                key={note.id}
                                                note={note}
                                                isCreator={note.creator?.id === currentUserId}
                                                isEditable={note.creator?.id === currentUserId}
                                                onView={() => setViewNote(note)}
                                                onEdit={() => openEditNote(note)}
                                                onDelete={() => setDeleteNoteTarget(note)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>

                    <Dialog open={formOpen} onOpenChange={setFormOpen}>
                        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-card border-border">
                            <DialogHeader>
                                <DialogTitle>{editingNote ? 'Modifier la note' : 'Nouvelle note'}</DialogTitle>
                                <DialogDescription>
                                    {editingNote ? 'Modifiez le titre et le contenu.' : 'Les membres du groupe pourront consulter cette note.'}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col gap-3 flex-1 min-h-0">
                                <Input placeholder="Titre" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className="bg-muted border-border" />
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

                    <Dialog open={!!deleteNoteTarget} onOpenChange={(o) => !o && setDeleteNoteTarget(null)}>
                        <DialogContent className="bg-card border-border">
                            <DialogHeader>
                                <DialogTitle>Supprimer la note</DialogTitle>
                                <DialogDescription>Cette action est irréversible.</DialogDescription>
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

            {viewNote && (
                <NoteView
                    note={viewNote}
                    isCreator={viewNote.creator?.id === currentUserId}
                    isEditable={viewNote.creator?.id === currentUserId}
                    onClose={() => setViewNote(null)}
                    onEdit={() => {
                        setViewNote(null);
                        openEditNote(viewNote);
                    }}
                    onDelete={() => {
                        setDeleteNoteTarget(viewNote);
                        setViewNote(null);
                    }}
                />
            )}
        </>
    );
}

function DocumentViewerInline({
    doc,
    pdfBlobUrl,
    onClose,
    getDocDataUrl,
}: {
    doc: Doc;
    pdfBlobUrl: string | null;
    onClose: () => void;
    getDocDataUrl: (d: Doc) => string;
}) {
    const [wordHtml, setWordHtml] = useState<string | null>(null);
    const [wordLoading, setWordLoading] = useState(false);
    const [wordError, setWordError] = useState<string | null>(null);

    useEffect(() => {
        if (doc.type !== 'WORD') return;
        setWordHtml(null);
        setWordError(null);
        setWordLoading(true);
        const base64 = doc.data.startsWith('data:') ? doc.data.split(',')[1] : doc.data;
        if (!base64) {
            setWordError('Données invalides');
            setWordLoading(false);
            return;
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        import('mammoth').then((mammoth) => {
            mammoth.default.convertToHtml({ arrayBuffer: bytes.buffer })
                .then((result) => { setWordHtml(result.value); setWordError(null); })
                .catch((err) => { setWordError(err?.message || 'Erreur'); setWordHtml(null); })
                .finally(() => setWordLoading(false));
        }).catch(() => { setWordError('Bibliothèque non disponible'); setWordLoading(false); });
    }, [doc.id, doc.type, doc.data]);

    const handleDownload = () => {
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
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 border border-border rounded-lg overflow-hidden bg-muted/30">
            <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-border bg-muted/50 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} title="Retour">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-medium truncate text-foreground">{doc.filename}</span>
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleDownload} title="Télécharger">
                    <Download className="w-4 h-4" />
                </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-muted/20 flex items-center justify-center p-4">
                {doc.type === 'IMAGE' ? (
                    <img
                        src={doc.data.startsWith('data:') ? doc.data : `data:image/jpeg;base64,${doc.data}`}
                        alt={doc.filename}
                        className="max-w-full max-h-[60vh] object-contain rounded-lg"
                    />
                ) : doc.type === 'PDF' && pdfBlobUrl ? (
                    <iframe src={pdfBlobUrl} title={doc.filename} className="w-full h-full min-h-[300px] border-0 rounded-lg bg-white" />
                ) : doc.type === 'WORD' ? (
                    wordLoading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    ) : wordHtml ? (
                        <div className="docx-preview prose prose-sm dark:prose-invert max-w-none p-6 bg-white dark:bg-zinc-950 rounded-lg" dangerouslySetInnerHTML={{ __html: wordHtml }} />
                    ) : wordError ? (
                        <div className="text-muted-foreground text-sm">
                            <p>{wordError}</p>
                            <Button variant="outline" size="sm" className="mt-2" onClick={handleDownload}>Télécharger</Button>
                        </div>
                    ) : null
                ) : (
                    <div className="text-muted-foreground text-sm">
                        <p>Prévisualisation non disponible.</p>
                        <Button variant="outline" size="sm" className="mt-2" onClick={handleDownload}>Télécharger</Button>
                    </div>
                )}
            </div>
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
    note: CollabNote;
    isCreator: boolean;
    isEditable: boolean;
    onView: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const preview = stripHtml(note.content);
    return (
        <div className="group relative flex flex-col p-3 rounded-xl border border-border bg-card hover:bg-muted/50 cursor-pointer" onClick={onView}>
            <h3 className="font-semibold text-foreground text-sm line-clamp-1">{note.title}</h3>
            {preview && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{preview}</p>}
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{formatDate(note.updatedAt)}</span>
                {note.creator?.name && <span>· {isCreator ? 'Vous' : note.creator.name}</span>}
            </div>
            <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {isEditable && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Modifier">
                        <Pencil className="w-3.5 h-3.5" />
                    </Button>
                )}
                {isCreator && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Supprimer">
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}

function NoteView({
    note,
    isCreator,
    isEditable,
    onClose,
    onEdit,
    onDelete,
}: {
    note: CollabNote;
    isCreator: boolean;
    isEditable: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const handleShare = async () => {
        const text = `${note.title}\n\n${stripHtml(note.content)}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: note.title, text });
                toast.success('Note partagée');
            } else {
                await navigator.clipboard.writeText(text);
                toast.success('Note copiée');
            }
        } catch {
            try {
                await navigator.clipboard.writeText(text);
                toast.success('Note copiée');
            } catch {
                toast.error('Impossible de partager');
            }
        }
    };

    const handleExportPdf = () => {
        const el = document.getElementById('collab-note-pdf-content');
        if (!el) return;
        const w = window.open('', '_blank');
        if (!w) { toast.error('Autorisez les pop-ups'); return; }
        w.document.write(`<!DOCTYPE html><html><head><title>${note.title}</title><style>body{font-family:system-ui;max-width:210mm;margin:0 auto;padding:20mm;}</style></head><body>${el.innerHTML}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); w.close(); toast.success('Impression ouverte'); }, 250);
    };

    return (
        <Dialog open={!!note} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="bg-white dark:bg-zinc-900 border-border w-[95vw] sm:w-full max-w-3xl max-h-[90vh] flex flex-col p-0" showCloseButton={false}>
                <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-border bg-muted/30 shrink-0">
                    <DialogTitle className="font-semibold truncate m-0">{note.title}</DialogTitle>
                    <div className="flex items-center gap-1 shrink-0">
                        {(isEditable ?? isCreator) && (
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onEdit} title="Modifier">
                                <Pencil className="w-4 h-4" />
                                <span className="hidden sm:inline">Modifier</span>
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleShare} title="Copier">
                            <Copy className="w-4 h-4" />
                            <span className="hidden sm:inline">Copier</span>
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleExportPdf} title="Exporter PDF">
                            <FileDown className="w-4 h-4" />
                            <span className="hidden sm:inline">Exporter PDF</span>
                        </Button>
                        {isCreator && (
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-destructive" onClick={onDelete} title="Supprimer">
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Supprimer</span>
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Fermer">
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(note.updatedAt)}
                    {note.creator?.name && <span>· {isCreator ? 'Par vous' : `Par ${note.creator.name}`}</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-6 min-h-0">
                    <div id="collab-note-pdf-content" className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: note.content || '<p></p>' }} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
