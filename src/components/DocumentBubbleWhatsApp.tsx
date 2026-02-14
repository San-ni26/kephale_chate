'use client';

import { FileText } from 'lucide-react';
import { cn } from '@/src/lib/utils';

/** Taille approximative en Mo à partir de data URL base64 */
function formatDocSize(data: string): string {
    try {
        const base64 = data.includes(',') ? data.split(',')[1] : data;
        const bytes = Math.floor((base64?.length || 0) * 0.75);
        if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
        if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
        return `${bytes} o`;
    } catch {
        return '';
    }
}

interface DocumentBubbleWhatsAppProps {
    filename: string;
    fileUrl: string;
    type: 'PDF' | 'WORD';
    data: string;
    isOwn?: boolean;
    onView: () => void;
    onDownload: () => void;
    /** Partager (iOS/Android : Enregistrer dans Fichiers) */
    onShare?: () => void;
    className?: string;
}

/** Bulle document style WhatsApp : zone aperçu + badge type + nom + infos */
export function DocumentBubbleWhatsApp({
    filename,
    fileUrl,
    type,
    data,
    isOwn = false,
    onView,
    onDownload,
    onShare,
    className,
}: DocumentBubbleWhatsAppProps) {
    const sizeStr = formatDocSize(data);
    const ext = type === 'PDF' ? 'pdf' : 'doc';

    return (
        <div
            className={cn(
                'rounded-2xl overflow-hidden border shadow-sm max-w-[280px] min-w-[220px]',
                isOwn
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-foreground border-border',
                className
            )}
        >
            {/* Zone aperçu : carte document (iframe PDF non fiable sur Safari/iOS avec data URL) */}
            <button
                type="button"
                onClick={onView}
                className="w-full block text-left focus:outline-none focus:ring-0"
            >
                <div className="bg-white p-4 min-h-[140px] flex items-center justify-center relative rounded-t-2xl">
                    {type === 'PDF' ? (
                        <div className="flex flex-col items-center justify-center gap-2 text-center">
                            <div className="w-16 h-16 rounded-lg bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
                                <FileText className="w-10 h-10 text-red-500" />
                            </div>
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Document PDF</span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-500 truncate max-w-full px-2">{filename}</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
                            <FileText className="w-12 h-12 text-blue-500" />
                            <span className="text-xs font-medium">Document Word</span>
                        </div>
                    )}
                </div>

                {/* Infos fichier (badge + nom + taille) */}
                <div className="px-3 py-2.5 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span
                            className={cn(
                                'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                                type === 'PDF' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                            )}
                        >
                            {type}
                        </span>
                        {sizeStr && (
                            <span className="text-[11px] opacity-90">
                                • {sizeStr} • {ext}
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-semibold truncate pr-1">{filename}</p>
                </div>
            </button>

            {/* Actions : Voir, Télécharger, Partager (iOS/Android) */}
            <div className="px-2 pb-1.5 pt-0 flex flex-wrap justify-end gap-1">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onView(); }}
                    className="text-[11px] opacity-90 hover:opacity-100 underline"
                >
                    Voir
                </button>
                <span className="opacity-70">•</span>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDownload(); }}
                    className="text-[11px] opacity-90 hover:opacity-100 underline"
                >
                    Télécharger
                </button>
                {onShare && (
                    <>
                        <span className="opacity-70">•</span>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onShare(); }}
                            className="text-[11px] opacity-90 hover:opacity-100 underline"
                        >
                            Partager
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
