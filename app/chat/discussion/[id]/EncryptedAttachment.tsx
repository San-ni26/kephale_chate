import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/src/components/ui/dialog';
import { Download, Image as ImageIcon, FileText, Eye, X } from 'lucide-react';
import { AudioBubbleWhatsApp } from '@/src/components/AudioBubbleWhatsApp';
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
        try {
            const link = document.createElement('a');
            link.href = fileUrl;
            link.download = attachment.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Téléchargement démarré');
        } catch (error) {
            console.error('Download error:', error);
            toast.error('Erreur de téléchargement');
        }
    };

    const [inlineViewOpen, setInlineViewOpen] = useState(false);

    // Display image inline
    if (isImage) {
        return (
            <div className="relative group max-w-sm">
                <img
                    src={fileUrl}
                    alt={attachment.filename}
                    className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(fileUrl, '_blank')}
                    loading="lazy"
                />
                <Button
                    size="sm"
                    variant="secondary"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleDownload}
                >
                    <Download className="w-4 h-4 mr-1" />
                    Télécharger
                </Button>
            </div>
        );
    }

    // Display audio: style WhatsApp (bulle) sur toutes les pages de chat
    if (isAudio) {
        return <AudioBubbleWhatsApp src={fileUrl} isOwn={isOwnMessage ?? false} />;
    }

    // Display document: visualisation dans la même page (modal) + téléchargement
    return (
        <>
            <div className="flex flex-col gap-2 bg-muted/50 hover:bg-muted transition-colors rounded-lg p-3 max-w-[280px] border border-border">
                <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                        {isPDF ? (
                            <FileText className="w-8 h-8 text-red-500" />
                        ) : (
                            <FileText className="w-8 h-8 text-blue-500" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{attachment.filename}</p>
                        <p className="text-xs text-muted-foreground">{attachment.type}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(isPDF || isWord) && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 min-w-0"
                            onClick={() => setInlineViewOpen(true)}
                        >
                            <Eye className="w-4 h-4 mr-1" />
                            Voir
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleDownload}
                        title="Télécharger ou enregistrer sur l'appareil"
                    >
                        <Download className="w-4 h-4 mr-1" />
                        Télécharger
                    </Button>
                </div>
            </div>

            {/* Visualisation dans la même page (modal) */}
            <Dialog open={inlineViewOpen} onOpenChange={setInlineViewOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-card p-0 gap-0" showCloseButton={true}>
                    <DialogHeader className="px-6 pt-6 pb-2">
                        <DialogTitle className="truncate pr-8">{attachment.filename}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-[60vh] overflow-auto px-6 pb-6">
                        {isPDF ? (
                            <iframe
                                src={fileUrl}
                                title={attachment.filename}
                                className="w-full h-[70vh] min-h-[400px] rounded-lg border border-border"
                            />
                        ) : isWord ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                                <FileText className="w-12 h-12 mb-2 opacity-50" />
                                <p>Document Word : ouvrez-le après téléchargement.</p>
                                <Button variant="outline" size="sm" className="mt-2" onClick={handleDownload}>
                                    <Download className="w-4 h-4 mr-1" />
                                    Télécharger
                                </Button>
                            </div>
                        ) : null}
                    </div>
                    <div className="flex justify-end gap-2 px-6 pb-6">
                        <Button variant="outline" size="sm" onClick={handleDownload}>
                            <Download className="w-4 h-4 mr-1" />
                            Télécharger
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setInlineViewOpen(false)}>
                            <X className="w-4 h-4 mr-1" />
                            Fermer
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
