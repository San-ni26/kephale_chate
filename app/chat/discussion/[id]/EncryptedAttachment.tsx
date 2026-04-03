import { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Download, Share2, X } from 'lucide-react';
import { AudioBubbleWhatsApp } from '@/src/components/AudioBubbleWhatsApp';
import { DocumentBubbleWhatsApp } from '@/src/components/DocumentBubbleWhatsApp';
import { DocumentViewerFullScreen } from '@/src/components/DocumentViewerFullScreen';
import { downloadFromDataUrl, shareFileFromDataUrl, canShareFile } from '@/src/lib/download-file';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileAttachmentProps {
    attachment: {
        filename: string;
        type: string;
        data?: string;
    };
    isOwnMessage?: boolean;
    myPrivateKey?: string;
    theirPublicKey?: string;
    currentUserId?: string;
}

// ─── Fonctions pures au niveau module ─────────────────────────────────────────

/** Déchiffre un attachment chiffré E2E (nacl.box) */
async function decryptAttachment(
    encryptedBase64: string,
    myPrivateKey: string,
    theirPublicKey: string,
    mimeType: string
): Promise<string | null> {
    try {
        const { decryptFileData } = await import('@/src/lib/crypto');
        const decryptedData = decryptFileData(encryptedBase64, myPrivateKey, theirPublicKey);
        if (!decryptedData) return null;
        let binary = '';
        const bytes = new Uint8Array(decryptedData.buffer as ArrayBuffer);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return `data:${mimeType};base64,${btoa(binary)}`;
    } catch (err) {
        console.error('[EncryptedAttachment] Déchiffrement échoué:', err);
        return null;
    }
}

/** Cherche la clé privée dans sessionStorage */
function getPrivKeyFromSession(currentUserId?: string): string | null {
    try {
        if (currentUserId) {
            const key = sessionStorage.getItem(`privateKey_${currentUserId}`);
            if (key) return key;
        }
        const match = Object.keys(sessionStorage).find(k => k.startsWith('privateKey_'));
        return match ? sessionStorage.getItem(match) : null;
    } catch {
        return null;
    }
}

/** Force string — retourne '' si la valeur n'est pas une string non-vide */
function safeStr(val: unknown): string {
    return typeof val === 'string' ? val : '';
}

/** Retourne le MIME type à partir du nom de fichier et du type d'attachement */
function resolveMimeType(filename: string, attachType: string): string {
    const ext = (filename || '').split('.').pop()?.toLowerCase() ?? '';
    if (attachType === 'IMAGE') {
        if (ext === 'png')  return 'image/png';
        if (ext === 'gif')  return 'image/gif';
        if (ext === 'webp') return 'image/webp';
        return 'image/jpeg';
    }
    if (attachType === 'AUDIO') {
        if (ext === 'mp3') return 'audio/mpeg';
        if (ext === 'ogg') return 'audio/ogg';
        if (ext === 'wav') return 'audio/wav';
        if (ext === 'm4a') return 'audio/mp4';
        return 'audio/webm';
    }
    if (attachType === 'PDF')  return 'application/pdf';
    if (attachType === 'WORD') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return 'application/octet-stream';
}

/** Retourne une URL displayable à partir de data brut */
function resolveDataUrl(data: string, filename: string, attachType: string): string {
    if (!data) return '';
    if (data.startsWith('https://') || data.startsWith('http://')) return data;
    if (data.startsWith('data:')) return data;
    return `data:${resolveMimeType(filename, attachType)};base64,${data}`;
}

/** Convertit un data: URI ou base64 brut en blob: URL (safe pour CSP media-src) */
function toBlobUrl(dataUrl: string, fallbackMime: string): string | null {
    try {
        let base64 = dataUrl;
        let mime = fallbackMime;
        if (dataUrl.startsWith('data:')) {
            const comma = dataUrl.indexOf(',');
            if (comma === -1) return null;
            const meta = dataUrl.slice(5, comma);
            // data:audio/webm;codecs=opus;base64 → mime = audio/webm
            mime = meta.replace(/;base64$/i, '').split(';')[0] || fallbackMime;
            base64 = dataUrl.slice(comma + 1);
        }
        if (!base64) return null;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch {
        return null;
    }
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function EncryptedAttachment({ attachment, isOwnMessage, myPrivateKey, theirPublicKey, currentUserId }: FileAttachmentProps) {
    // ─── Extraction 100% null-safe des props ─────────────────────────────────
    const attachData     = safeStr(attachment?.data);
    const attachFilename = safeStr(attachment?.filename);
    const attachType     = safeStr(attachment?.type);

    const isImage = attachType === 'IMAGE';
    const isAudio = attachType === 'AUDIO';
    const isPDF   = attachType === 'PDF';

    const isSupabaseUrl  = !!attachData && (attachData.startsWith('https://') || attachData.startsWith('http://'));
    const isEncryptedE2E = !!attachData && attachData.startsWith('enc:') && !isSupabaseUrl;

    // ─── HOOKS ───────────────────────────────────────────────────────────────
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(isSupabaseUrl ? attachData : null);
    const [decryptState, setDecryptState] = useState<'idle' | 'pending' | 'ok' | 'error'>(isSupabaseUrl ? 'ok' : 'idle');
    const [inlineViewOpen, setInlineViewOpen] = useState(false);
    const [imageViewOpen, setImageViewOpen] = useState(false);
    const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
    const attemptRef = useRef(0);

    // Hook 1 : Déchiffrement / résolution URL
    useEffect(() => {
        if (!attachData) {
            setDecryptedUrl('');
            setDecryptState('ok');
            return;
        }
        if (isSupabaseUrl) {
            setDecryptedUrl(attachData);
            setDecryptState('ok');
            return;
        }
        if (!isEncryptedE2E) {
            setDecryptedUrl(resolveDataUrl(attachData, attachFilename, attachType));
            setDecryptState('ok');
            return;
        }

        const privKey = myPrivateKey || getPrivKeyFromSession(currentUserId);
        const pubKey = theirPublicKey;
        if (!privKey || !pubKey) { setDecryptState('pending'); return; }

        const currentAttempt = ++attemptRef.current;
        setDecryptState('pending');
        const nacl64 = attachData.replace(/^enc:/, '');
        const mimeType = resolveMimeType(attachFilename, attachType);

        decryptAttachment(nacl64, privKey, pubKey, mimeType).then(url => {
            if (currentAttempt !== attemptRef.current) return;
            if (url) { setDecryptedUrl(url); setDecryptState('ok'); }
            else     { setDecryptState('error'); }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attachData, attachFilename, attachType, myPrivateKey, theirPublicKey, currentUserId, isEncryptedE2E, isSupabaseUrl]);

    // Hook 2 : Polling sessionStorage (clé privée)
    useEffect(() => {
        if (!isEncryptedE2E || decryptState === 'ok' || decryptState === 'error') return;
        if (myPrivateKey || getPrivKeyFromSession(currentUserId)) return;
        let elapsed = 0;
        const interval = setInterval(() => {
            elapsed += 500;
            if (getPrivKeyFromSession(currentUserId)) { clearInterval(interval); setDecryptState('idle'); }
            else if (elapsed >= 20_000)               { clearInterval(interval); setDecryptState('error'); }
        }, 500);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEncryptedE2E, decryptState, myPrivateKey, currentUserId]);

    // Hook 3 : Lightbox scroll lock
    useEffect(() => {
        if (!imageViewOpen) return;
        document.body.style.overflow = 'hidden';
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setImageViewOpen(false); };
        window.addEventListener('keydown', onKeyDown);
        return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKeyDown); };
    }, [imageViewOpen]);

    // Hook 4 : Convertir audio data:/base64 → blob: URL (CSP bloque data: pour media-src)
    useEffect(() => {
        if (!isAudio || !decryptedUrl) { if (isAudio) setAudioBlobUrl(null); return; }
        // URL Supabase ou blob: → passer directement
        if (decryptedUrl.startsWith('https://') || decryptedUrl.startsWith('http://') || decryptedUrl.startsWith('blob:')) {
            setAudioBlobUrl(decryptedUrl);
            return;
        }
        // data: ou base64 brut → convertir en blob:
        const mime = resolveMimeType(attachFilename, attachType);
        const blobUrl = toBlobUrl(decryptedUrl, mime);
        if (blobUrl) {
            setAudioBlobUrl(blobUrl);
            return () => URL.revokeObjectURL(blobUrl);
        }
        setAudioBlobUrl(null);
    }, [isAudio, decryptedUrl, attachFilename, attachType]);

    // ─── Valeurs dérivées ────────────────────────────────────────────────────
    const fileUrl = decryptedUrl || (!isEncryptedE2E && attachData ? resolveDataUrl(attachData, attachFilename, attachType) : null);

    const handleDownload = async () => {
        const url = fileUrl || (isAudio ? audioBlobUrl : null);
        if (!url) { toast.error('Fichier non disponible'); return; }
        if (url.startsWith('https://') || url.startsWith('http://')) {
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = attachFilename || 'download';
                a.click();
                URL.revokeObjectURL(blobUrl);
                toast.success('Téléchargement démarré');
            } catch { toast.error('Erreur de téléchargement'); }
            return;
        }
        if (url.startsWith('blob:')) {
            const a = document.createElement('a');
            a.href = url;
            a.download = attachFilename || 'audio.webm';
            a.click();
            toast.success('Téléchargement démarré');
            return;
        }
        const ok = await downloadFromDataUrl(url, attachFilename);
        if (ok) toast.success('Téléchargement démarré');
        else toast.error('Erreur de téléchargement');
    };

    const handleShare = async () => {
        if (!fileUrl) { toast.error('Fichier non déchiffré'); return; }
        try {
            const ok = await shareFileFromDataUrl(fileUrl, attachFilename);
            if (ok) toast.success('Partage ouvert');
            else toast.error('Partage non disponible');
        } catch { toast.error('Erreur de partage'); }
    };

    // ─── Rendu conditionnel APRÈS tous les hooks ─────────────────────────────

    // Donnée manquante — rien à afficher
    if (!attachData && !isEncryptedE2E) return null;

    if (decryptState === 'error') {
        return (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                <span>🔒</span>
                <div>
                    <p className="font-medium">Impossible de déchiffrer</p>
                    <p className="text-xs opacity-70">{attachFilename}</p>
                </div>
            </div>
        );
    }

    if (isEncryptedE2E && !decryptedUrl) {
        return (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-muted-foreground text-sm">
                <span className="inline-block animate-spin">🔄</span>
                <span>Déchiffrement de {attachFilename}...</span>
            </div>
        );
    }

    // Image
    if (isImage && fileUrl) {
        return (
            <>
                <div className="relative group max-w-sm">
                    <img
                        src={fileUrl}
                        alt={attachFilename}
                        className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setImageViewOpen(true)}
                        loading="lazy"
                    />
                    <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                    >
                        <Download className="w-4 h-4 mr-1" />
                        Télécharger
                    </Button>
                </div>
                {imageViewOpen && (
                    <div
                        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4"
                        onClick={() => setImageViewOpen(false)}
                        role="dialog"
                        aria-modal="true"
                    >
                        <img
                            src={fileUrl}
                            alt={attachFilename}
                            className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex items-center gap-3 mt-4" onClick={(e) => e.stopPropagation()}>
                            {canShareFile() && (
                                <Button variant="secondary" size="sm" className="gap-2" onClick={(e) => { e.stopPropagation(); handleShare(); }}>
                                    <Share2 className="w-4 h-4" />Partager
                                </Button>
                            )}
                            <Button variant="secondary" size="sm" className="gap-2" onClick={(e) => { e.stopPropagation(); handleDownload(); }}>
                                <Download className="w-4 h-4" />Télécharger
                            </Button>
                            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setImageViewOpen(false)}>
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>
                )}
            </>
        );
    }

    // Audio — blob: URL (autorisé par CSP) ou Supabase URL
    if (isAudio && audioBlobUrl) {
        return <AudioBubbleWhatsApp src={audioBlobUrl} isOwn={isOwnMessage ?? false} />;
    }
    if (isAudio && decryptState === 'ok') {
        // Pas de blob URL dispo (conversion échouée ou data vide) → téléchargement
        return (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-muted-foreground text-sm">
                <span>🎵</span>
                <span className="flex-1 truncate">{attachFilename || 'Audio'}</span>
                <Button size="sm" variant="secondary" onClick={handleDownload}>
                    <Download className="w-4 h-4 mr-1" />Télécharger
                </Button>
            </div>
        );
    }

    // Document (PDF / Word / autre)
    const docType = isPDF ? 'PDF' : 'WORD';
    const showShare = canShareFile();
    return (
        <>
            <DocumentBubbleWhatsApp
                filename={attachFilename}
                fileUrl={fileUrl || ''}
                type={docType}
                data={fileUrl || attachData}
                isOwn={isOwnMessage ?? false}
                onView={() => setInlineViewOpen(true)}
                onDownload={handleDownload}
                onShare={showShare ? handleShare : undefined}
            />
            <DocumentViewerFullScreen
                open={inlineViewOpen}
                onClose={() => setInlineViewOpen(false)}
                filename={attachFilename}
                fileUrl={fileUrl || ''}
                type={docType}
                onDownload={handleDownload}
                onShare={showShare ? handleShare : undefined}
            />
        </>
    );
}
