'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
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
} from 'lucide-react';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

interface Doc {
    id: string;
    filename: string;
    type: string;
    data: string;
    uploadedBy: string;
    createdAt: string;
    uploader?: { id: string; name: string | null; email: string };
}

interface DepartmentDocumentsPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    deptId: string;
}

export function DepartmentDocumentsPanel({
    open,
    onOpenChange,
    orgId,
    deptId,
}: DepartmentDocumentsPanelProps) {
    const [documents, setDocuments] = useState<Doc[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    useEffect(() => {
        if (open) {
            fetchDocuments(search);
        }
    }, [open, orgId, deptId, search]);

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

    const filtered = documents;

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
                    </DialogHeader>

                    <div className="flex flex-col gap-3 flex-1 min-h-0">
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
                                        <iframe
                                            src={previewDoc.data.startsWith('data:') ? previewDoc.data : `data:application/pdf;base64,${previewDoc.data}`}
                                            title={previewDoc.filename}
                                            className="w-full h-full min-h-[400px] border-0"
                                        />
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
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
