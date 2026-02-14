import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Download, Image as ImageIcon, FileText } from 'lucide-react';
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
                    onClick={(e) => { e.stopPropagation(); handleDownload(); }}
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
