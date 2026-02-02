import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Download, Image as ImageIcon, FileText } from 'lucide-react';
import { AudioPlayer } from '@/src/components/AudioPlayer';
import { toast } from 'sonner';

interface FileAttachmentProps {
    attachment: {
        filename: string;
        type: string;
        data: string; // URL path to the file
    };
}

export function EncryptedAttachment({ attachment }: FileAttachmentProps) {
    console.log('EncryptedAttachment rendering:', attachment);
    const isImage = attachment.type === 'IMAGE';
    const isAudio = attachment.type === 'AUDIO';
    const fileUrl = attachment.data; // Direct URL to file

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
        <div className="flex items-center gap-3 bg-black/20 hover:bg-black/30 transition-colors rounded-lg p-3 max-w-[250px] border border-white/5">
            <div className="flex-shrink-0">
                {attachment.type === 'PDF' ? (
                    <FileText className="w-8 h-8 text-red-400" />
                ) : (
                    <FileText className="w-8 h-8 text-blue-400" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attachment.filename}</p>
                <p className="text-xs text-slate-400">{attachment.type}</p>
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
