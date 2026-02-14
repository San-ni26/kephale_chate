'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Download, X, FileText, ChevronDown, ExternalLink } from 'lucide-react';
import { dataUrlToBlob } from '@/src/lib/download-file';

interface DocumentViewerFullScreenProps {
    open: boolean;
    onClose: () => void;
    filename: string;
    fileUrl: string;
    type: 'PDF' | 'WORD';
    onDownload: () => void;
    /** Partager (iOS/Android : Enregistrer dans Fichiers) */
    onShare?: () => void;
}

/** Vue en grand style WhatsApp : header noir (titre + OK), document plein écran, footer actions */
export function DocumentViewerFullScreen({
    open,
    onClose,
    filename,
    fileUrl,
    type,
    onDownload,
    onShare,
}: DocumentViewerFullScreenProps) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    // Utiliser une URL blob pour l’iframe (meilleur support Safari/iOS que data URL)
    useEffect(() => {
        if (!open || type !== 'PDF' || !fileUrl) {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
            setBlobUrl(null);
            return;
        }
        const blob = dataUrlToBlob(fileUrl);
        if (blob) {
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            setBlobUrl(url);
            return () => {
                URL.revokeObjectURL(url);
                blobUrlRef.current = null;
                setBlobUrl(null);
            };
        }
        setBlobUrl(null);
    }, [open, type, fileUrl]);

    if (!open) return null;

    const displayName = filename.replace(/\.[^/.]+$/, '') || filename; // "CV.pdf" → "CV"
    const showPdfInIframe = type === 'PDF' && blobUrl;

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
            {/* Header noir : titre + OK (vert) */}
            <header className="flex items-center justify-between h-14 px-4 bg-black border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-white font-semibold truncate text-lg">{displayName}</span>
                    <ChevronDown className="w-5 h-5 text-white/60 shrink-0" aria-hidden />
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="text-green-500 hover:text-green-400 hover:bg-white/10 font-semibold shrink-0"
                >
                    OK
                </Button>
            </header>

            {/* Contenu document : iframe avec blob URL (Safari/iOS) ou fallback */}
            <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-zinc-900">
                {showPdfInIframe ? (
                    <>
                        <iframe
                            key={blobUrl}
                            src={blobUrl}
                            title={filename}
                            className="flex-1 w-full min-h-0 border-0"
                        />
                        <div className="shrink-0 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                            <span>Si le PDF ne s&apos;affiche pas :</span>
                            <button
                                type="button"
                                onClick={() => window.open(blobUrl!, '_blank')}
                                className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 hover:underline"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Ouvrir dans un nouvel onglet
                            </button>
                        </div>
                    </>
                ) : type === 'PDF' ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                        <FileText className="w-14 h-14 text-red-500 mb-4 opacity-80" />
                        <p className="text-sm text-muted-foreground mb-2">Affichage du PDF non disponible dans ce navigateur.</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            <Button onClick={() => window.open(fileUrl, '_blank')} variant="outline" size="sm">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Ouvrir dans un nouvel onglet
                            </Button>
                            <Button onClick={onDownload} variant="outline" size="sm">
                                <Download className="w-4 h-4 mr-2" />
                                Télécharger
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-muted-foreground text-center">
                        <FileText className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-sm mb-4">Document Word : téléchargez pour l&apos;ouvrir.</p>
                        <Button onClick={onDownload} variant="outline" size="sm">
                            <Download className="w-4 h-4 mr-2" />
                            Télécharger
                        </Button>
                    </div>
                )}
            </div>

            {/* Footer : Partager (iOS/Android), Télécharger, Fermer */}
            <footer className="h-14 px-4 flex items-center justify-center gap-6 bg-zinc-900 border-t border-white/10 shrink-0">
                {onShare && (
                    <button
                        type="button"
                        onClick={onShare}
                        className="flex flex-col items-center gap-1 text-green-500 hover:text-green-400 transition"
                        title="Partager / Enregistrer"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        <span className="text-[10px] font-medium">Partager</span>
                    </button>
                )}
                <button
                    type="button"
                    onClick={onDownload}
                    className="flex flex-col items-center gap-1 text-green-500 hover:text-green-400 transition"
                    title="Télécharger"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="text-[10px] font-medium">Télécharger</span>
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition"
                    title="Fermer"
                >
                    <X className="w-6 h-6" />
                    <span className="text-[10px] font-medium">Fermer</span>
                </button>
            </footer>
        </div>
    );
}
