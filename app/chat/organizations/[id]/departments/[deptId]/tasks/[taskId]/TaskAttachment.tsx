import { Button } from '@/src/components/ui/button';
import { Download, Image as ImageIcon, FileText } from 'lucide-react';
import { AudioBubbleWhatsApp } from '@/src/components/AudioBubbleWhatsApp';

interface TaskAttachmentProps {
    attachment: {
        id: string;
        filename: string;
        url: string; // URL instead of base64
        fileType?: string | null;
        size?: number | null;
    };
    /** Pour le style bulle audio (message envoyé par moi) */
    isOwn?: boolean;
}

export function TaskAttachment({ attachment, isOwn = false }: TaskAttachmentProps) {
    const isImage = attachment.fileType === 'IMAGE';
    const isAudio = attachment.fileType === 'AUDIO';
    const isPDF = attachment.fileType === 'PDF';
    const isWord = attachment.fileType === 'WORD';

    const handleDownload = async () => {
        try {
            const response = await fetch(attachment.url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = attachment.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download error:', error);
            window.open(attachment.url, '_blank');
        }
    };

    // Display image inline
    if (isImage) {
        return (
            <div className="relative group max-w-sm mt-2">
                <img
                    src={attachment.url}
                    alt={attachment.filename}
                    className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity border border-border"
                    onClick={() => window.open(attachment.url, '_blank')}
                    loading="lazy"
                />
                <Button
                    size="sm"
                    variant="secondary"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    onClick={handleDownload}
                >
                    <Download className="w-4 h-4 mr-1" />
                    Télécharger
                </Button>
            </div>
        );
    }

    if (isAudio) {
        return <AudioBubbleWhatsApp src={attachment.url} isOwn={isOwn} />;
    }

    // Display document as file card
    return (
        <div className="flex items-center gap-3 bg-muted/50 hover:bg-muted transition-colors rounded-lg p-3 max-w-[250px] border border-border mt-1">
            <div className="flex-shrink-0">
                {isPDF ? (
                    <FileText className="w-8 h-8 text-red-500" />
                ) : isWord ? (
                    <FileText className="w-8 h-8 text-blue-500" />
                ) : (
                    <FileText className="w-8 h-8 text-gray-500" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground" title={attachment.filename}>
                    {attachment.filename}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{attachment.fileType}</span>
                    {attachment.size && (
                        <span>• {Math.round(attachment.size / 1024)} KB</span>
                    )}
                </div>
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
