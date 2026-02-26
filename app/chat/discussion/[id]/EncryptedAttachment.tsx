import { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Download, Share2, X } from 'lucide-react';
import { AudioBubbleWhatsApp } from '@/src/components/AudioBubbleWhatsApp';
import { DocumentBubbleWhatsApp } from '@/src/components/DocumentBubbleWhatsApp';
import { DocumentViewerFullScreen } from '@/src/components/DocumentViewerFullScreen';
import { downloadFromDataUrl, shareFileFromDataUrl, canShareFile } from '@/src/lib/download-file';
import { toast } from 'sonner';

interface FileAttachmentProps {
    attachment: {
        filename: string;
        type: string;
        data: string;
    };
    isOwnMessage?: boolean;
    myPrivateKey?: string;
    theirPublicKey?: string;
    currentUserId?: string;
}

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

export function EncryptedAttachment({ attachment, isOwnMessage, myPrivateKey, theirPublicKey, currentUserId }: FileAttachmentProps) {
    const isImage = attachment.type === 'IMAGE';
    const isAudio = attachment.type === 'AUDIO';
    const isPDF = attachment.type === 'PDF';
    const isWord = attachment.type === 'WORD';
    const isEncryptedE2E = typeof attachment.data === 'string' && attachment.data.startsWith('enc:');

    // ─── TOUS LES HOOKS EN HAUT — AVANT TOUT RETURN CONDITIONNEL ────────────
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
    const [decryptState, setDecryptState] = useState<'idle' | 'pending' | 'ok' | 'error'>('idle');
    const [inlineViewOpen, setInlineViewOpen] = useState(false);
    const [imageViewOpen, setImageViewOpen] = useState(false);
    const attemptRef = useRef(0);

    const getMimeType = () => {
        if (isImage) {
            const ext = attachment.filename.split('.').pop()?.toLowerCase();
            if (ext === 'png') return 'image/png';
            if (ext === 'gif') return 'image/gif';
            if (ext === 'webp') return 'image/webp';
            return 'image/jpeg';
        }
        if (isAudio) {
            const ext = attachment.filename.split('.').pop()?.toLowerCase();
            if (ext === 'mp3') return 'audio/mpeg';
            if (ext === 'ogg') return 'audio/ogg';
            if (ext === 'wav') return 'audio/wav';
            if (ext === 'm4a') return 'audio/mp4';
            return 'audio/webm';
        }
        if (isPDF) return 'application/pdf';
        if (isWord) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        return 'application/octet-stream';
    };

    const getDataUrl = () => {
        if (attachment.data.startsWith('data:')) return attachment.data;
        return `data:${getMimeType()};base64,${attachment.data}`;
    };

    // Hook 1 : Déchiffrement principal
    useEffect(() => {
        if (!isEncryptedE2E) {
            setDecryptedUrl(getDataUrl());
            setDecryptState('ok');
            return;
        }

        const privKey = myPrivateKey || getPrivKeyFromSession(currentUserId);
        const pubKey = theirPublicKey;

        if (!privKey || !pubKey) {
            setDecryptState('pending');
            return;
        }

        const currentAttempt = ++attemptRef.current;
        setDecryptState('pending');

        const nacl64 = attachment.data.replace(/^enc:/, '');
        const mimeType = getMimeType();

        console.debug('[EncryptedAttachment] Déchiffrement...', {
            filename: attachment.filename,
            privKeyStart: privKey.slice(0, 8) + '...',
            pubKeyStart: pubKey.slice(0, 8) + '...',
        });

        decryptAttachment(nacl64, privKey, pubKey, mimeType).then(url => {
            if (currentAttempt !== attemptRef.current) return;
            if (url) {
                setDecryptedUrl(url);
                setDecryptState('ok');
            } else {
                console.error('[EncryptedAttachment] nacl.box.open a retourné null — clés incorrectes ou données corrompues');
                setDecryptState('error');
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attachment.data, myPrivateKey, theirPublicKey, currentUserId, isEncryptedE2E]);

    // Hook 2 : Polling sessionStorage (clé privée qui arrive après le render)
    useEffect(() => {
        if (!isEncryptedE2E || decryptState === 'ok' || decryptState === 'error') return;
        if (myPrivateKey || getPrivKeyFromSession(currentUserId)) return;

        let elapsed = 0;
        const interval = setInterval(() => {
            elapsed += 500;
            const privKey = getPrivKeyFromSession(currentUserId);
            if (privKey) {
                clearInterval(interval);
                // Force re-exécution du hook principal en changeant un dep fictif via l'état
                setDecryptState('idle');
            } else if (elapsed >= 20_000) {
                clearInterval(interval);
                setDecryptState('error');
            }
        }, 500);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEncryptedE2E, decryptState, myPrivateKey, currentUserId]);

    // Hook 3 : Blocage du scroll body quand la lightbox image est ouverte
    useEffect(() => {
        if (!imageViewOpen) return;
        document.body.style.overflow = 'hidden';
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setImageViewOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [imageViewOpen]);
    // ────────────────────────────────────────────────────────────────────────

    const fileUrl = decryptedUrl || (isEncryptedE2E ? null : getDataUrl());

    const handleDownload = async () => {
        if (!fileUrl) { toast.error('Fichier non déchiffré'); return; }
        const ok = await downloadFromDataUrl(fileUrl, attachment.filename);
        if (ok) toast.success('Téléchargement démarré');
        else toast.error('Erreur de téléchargement');
    };

    const handleShare = async () => {
        if (!fileUrl) { toast.error('Fichier non déchiffré'); return; }
        try {
            const ok = await shareFileFromDataUrl(fileUrl, attachment.filename);
            if (ok) toast.success('Partage ouvert');
            else toast.error('Partage non disponible');
        } catch {
            toast.error('Erreur de partage');
        }
    };

    // ── Returns conditionnels APRÈS tous les hooks ───────────────────────────

    if (decryptState === 'error') {
        return (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                <span>🔒</span>
                <div>
                    <p className="font-medium">Impossible de déchiffrer</p>
                    <p className="text-xs opacity-70">{attachment.filename}</p>
                </div>
            </div>
        );
    }

    if (isEncryptedE2E && !decryptedUrl) {
        return (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-muted-foreground text-sm">
                <span className="inline-block animate-spin">🔄</span>
                <span>Déchiffrement de {attachment.filename}...</span>
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
                        alt={attachment.filename}
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
                            alt={attachment.filename}
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

    // Audio
    if (isAudio && fileUrl) {
        return <AudioBubbleWhatsApp src={fileUrl} isOwn={isOwnMessage ?? false} />;
    }

    // Document (PDF / Word)
    const docType = isPDF ? 'PDF' : 'WORD';
    const showShare = canShareFile();
    return (
        <>
            <DocumentBubbleWhatsApp
                filename={attachment.filename}
                fileUrl={fileUrl || ''}
                type={docType}
                data={fileUrl || attachment.data}
                isOwn={isOwnMessage ?? false}
                onView={() => setInlineViewOpen(true)}
                onDownload={handleDownload}
                onShare={showShare ? handleShare : undefined}
            />
            <DocumentViewerFullScreen
                open={inlineViewOpen}
                onClose={() => setInlineViewOpen(false)}
                filename={attachment.filename}
                fileUrl={fileUrl || ''}
                type={docType}
                onDownload={handleDownload}
                onShare={showShare ? handleShare : undefined}
            />
        </>
    );
}
