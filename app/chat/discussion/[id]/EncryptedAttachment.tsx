import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Download, Image as ImageIcon, FileText } from 'lucide-react';
import { AudioPlayer } from '@/src/components/AudioPlayer';
import { toast } from 'sonner';

interface FileAttachmentProps {
    attachment: {
        filename: string;
        type: string;
        data: string; // Base64-encoded data
    };
}

export function EncryptedAttachment({ attachment }: FileAttachmentProps) {
    console.log('EncryptedAttachment rendering:', attachment);
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

    // Display audio player
    if (isAudio) {
        return <AudioPlayer src={fileUrl} />;
    }

    // Display document as download link
    return (
        <div className="flex items-center gap-3 bg-muted/50 hover:bg-muted transition-colors rounded-lg p-3 max-w-[250px] border border-border">
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
            <Button
                size="sm"
                variant="ghost"
                onClick={handleDownload}
                className="flex-shrink-0"
            >
                <Download className="w-4 h-4" />
            </Button>
        </div>
    );
}
