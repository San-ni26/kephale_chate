import { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Download, Image as ImageIcon, FileText, Share2, X } from 'lucide-react';
import { AudioBubbleWhatsApp } from '@/src/components/AudioBubbleWhatsApp';
import { DocumentBubbleWhatsApp } from '@/src/components/DocumentBubbleWhatsApp';
import { DocumentViewerFullScreen } from '@/src/components/DocumentViewerFullScreen';
import { downloadFromDataUrl, shareFileFromDataUrl, canShareFile } from '@/src/lib/download-file';
import { toast } from 'sonner';

interface FileAttachmentProps {
    attachment: {
        filename: string;
        type: string;
        data: string; // Base64-encoded data
    };
    /** Pour le style bulle audio type WhatsApp (chat département) */
    isOwnMessage?: boolean;
}

export function EncryptedAttachment({ attachment, isOwnMessage }: FileAttachmentProps) {
    const isImage = attachment.type === 'IMAGE';
    const isAudio = attachment.type === 'AUDIO';
    const isPDF = attachment.type === 'PDF';
    const isWord = attachment.type === 'WORD';

    // Determine MIME type based on file type and extension
    const getMimeType = () => {
        if (isImage) {
            const ext = attachment.filename.split('.').pop()?.toLowerCase();
            if (ext === 'png') return 'image/png';
            if (ext === 'gif') return 'image/gif';
            if (ext === 'webp') return 'image/webp';
            return 'image/jpeg'; // default
        }
        if (isAudio) {
            const ext = attachment.filename.split('.').pop()?.toLowerCase();
            if (ext === 'mp3') return 'audio/mpeg';
            if (ext === 'ogg') return 'audio/ogg';
            if (ext === 'wav') return 'audio/wav';
            if (ext === 'm4a') return 'audio/mp4';
            return 'audio/webm'; // default
        }
        if (isPDF) return 'application/pdf';
        if (isWord) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        return 'application/octet-stream';
    };

    // Construct data URL from base64 data
    // If data already includes the data URL prefix, use as-is; otherwise, add it
    const getDataUrl = () => {
        if (attachment.data.startsWith('data:')) {
            return attachment.data;
        }
        const mimeType = getMimeType();
        return `data:${mimeType};base64,${attachment.data}`;
    };

    const fileUrl = getDataUrl();

    const handleDownload = () => {
        const ok = downloadFromDataUrl(fileUrl, attachment.filename);
        if (ok) toast.success('Téléchargement démarré');
        else toast.error('Erreur de téléchargement');
    };

    const handleShare = async () => {
        try {
            const ok = await shareFileFromDataUrl(fileUrl, attachment.filename);
            if (ok) toast.success('Partage ouvert');
            else toast.error('Partage non disponible');
        } catch {
            toast.error('Erreur de partage');
        }
    };

    const [inlineViewOpen, setInlineViewOpen] = useState(false);
    const [imageViewOpen, setImageViewOpen] = useState(false);

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

    // Display image inline
    if (isImage) {
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
                {/* Vue centrée au milieu de la page */}
                {imageViewOpen && (
                    <div
                        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4"
                        onClick={() => setImageViewOpen(false)}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Aperçu de l'image"
                    >
                        <img
                            src={fileUrl}
                            alt={attachment.filename}
                            className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div
                            className="flex items-center gap-3 mt-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {canShareFile() && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="gap-2"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleShare();
                                    }}
                                >
                                    <Share2 className="w-4 h-4" />
                                    Partager
                                </Button>
                            )}
                            <Button
                                variant="secondary"
                                size="sm"
                                className="gap-2"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload();
                                }}
                            >
                                <Download className="w-4 h-4" />
                                Télécharger
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-white hover:bg-white/20"
                                onClick={() => setImageViewOpen(false)}
                                aria-label="Fermer"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>
                )}
            </>
        );
    }

    // Display audio: style WhatsApp (bulle) sur toutes les pages de chat
    if (isAudio) {
        return <AudioBubbleWhatsApp src={fileUrl} isOwn={isOwnMessage ?? false} />;
    }

    // Display document: bulle style WhatsApp + vue en grand plein écran
    const docType = isPDF ? 'PDF' : 'WORD';
    const showShare = canShareFile();
    return (
        <>
            <DocumentBubbleWhatsApp
                filename={attachment.filename}
                fileUrl={fileUrl}
                type={docType}
                data={attachment.data}
                isOwn={isOwnMessage ?? false}
                onView={() => setInlineViewOpen(true)}
                onDownload={handleDownload}
                onShare={showShare ? handleShare : undefined}
            />
            <DocumentViewerFullScreen
                open={inlineViewOpen}
                onClose={() => setInlineViewOpen(false)}
                filename={attachment.filename}
                fileUrl={fileUrl}
                type={docType}
                onDownload={handleDownload}
                onShare={showShare ? handleShare : undefined}
            />
        </>
    );
}
