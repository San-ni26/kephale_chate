'use client';

import { useState, useEffect } from 'react';
import { Link2, X, Play } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface LinkPreviewProps {
    url: string;
    title?: string | null;
    description?: string | null;
    image?: string | null;
    isOwnMessage?: boolean;
    /** compact = aperçu dans l'input avant envoi */
    variant?: 'full' | 'compact';
    onDismiss?: () => void;
}

interface LinkMetadata {
    title: string | null;
    description: string | null;
    image: string | null;
    url: string;
}

function getHostname(url: string) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function getFaviconUrl(url: string) {
    try { const { origin } = new URL(url); return `${origin}/favicon.ico`; } catch { return null; }
}

function isVideoUrl(url: string) {
    return /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com/i.test(url);
}

export function LinkPreview({
    url, title: initialTitle, description: initialDesc, image: initialImage,
    isOwnMessage, variant = 'full', onDismiss,
}: LinkPreviewProps) {
    const [metadata, setMetadata] = useState<LinkMetadata>({
        title: initialTitle || null,
        description: initialDesc || null,
        image: initialImage || null,
        url,
    });
    const [loading, setLoading] = useState(!initialTitle);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        if (initialTitle) return;
        let cancelled = false;
        const fetchMetadata = async () => {
            try {
                const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
                if (!res.ok) throw new Error('Failed');
                const data = await res.json();
                if (!cancelled) setMetadata(data);
            } catch {
                // silently fail
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchMetadata();
        return () => { cancelled = true; };
    }, [url, initialTitle]);

    const hostname = getHostname(url);
    const favicon = getFaviconUrl(url);
    const isVideo = isVideoUrl(url);
    const hasImage = metadata.image && !imgError;

    // ── Compact variant (input preview) ──────────────────────────────────────
    if (variant === 'compact') {
        return (
            <div className="flex items-stretch gap-3 bg-muted/60 rounded-xl border border-border overflow-hidden max-w-full">
                {/* Colored left bar like WhatsApp */}
                <div className="w-1 bg-primary shrink-0" />

                {/* Thumbnail */}
                {loading ? (
                    <div className="w-14 h-14 shrink-0 bg-muted animate-pulse self-center rounded" />
                ) : hasImage ? (
                    <div className="w-14 h-14 shrink-0 self-center relative">
                        <img
                            src={metadata.image!}
                            alt=""
                            className="w-full h-full object-cover rounded"
                            onError={() => setImgError(true)}
                        />
                        {isVideo && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
                                <Play className="w-4 h-4 text-white fill-white" />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="w-14 h-14 shrink-0 bg-muted flex items-center justify-center self-center rounded">
                        <Link2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                )}

                {/* Text */}
                <div className="flex-1 min-w-0 py-2 pr-2">
                    {loading ? (
                        <div className="space-y-1.5">
                            <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
                            <div className="h-2.5 bg-muted rounded w-full animate-pulse" />
                            <div className="h-2.5 bg-muted rounded w-1/2 animate-pulse" />
                        </div>
                    ) : (
                        <>
                            {metadata.title && (
                                <p className="text-sm font-semibold leading-tight line-clamp-1 text-foreground">
                                    {metadata.title}
                                </p>
                            )}
                            {metadata.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                    {metadata.description}
                                </p>
                            )}
                            <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{hostname}</p>
                        </>
                    )}
                </div>

                {/* Dismiss */}
                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        className="p-2 text-muted-foreground hover:text-foreground self-start mt-1 shrink-0"
                        aria-label="Fermer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        );
    }

    // ── Full variant (message bubble) ─────────────────────────────────────────
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                'block rounded-xl overflow-hidden transition-opacity hover:opacity-90 max-w-full',
                isOwnMessage
                    ? 'bg-primary/20'
                    : 'bg-background/20'
            )}
        >
            {/* Image / thumbnail */}
            {loading ? (
                <div className="aspect-video bg-black/20 animate-pulse w-full" />
            ) : hasImage ? (
                <div className="relative aspect-video bg-black/20 w-full overflow-hidden">
                    <img
                        src={metadata.image!}
                        alt={metadata.title || ''}
                        className="w-full h-full object-cover max-w-full"
                        onError={() => setImgError(true)}
                    />
                    {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
                                <Play className="w-7 h-7 text-white fill-white ml-1" />
                            </div>
                        </div>
                    )}
                </div>
            ) : null}

            {/* Info block */}
            <div className="px-3 py-2.5 space-y-0.5">
                {loading ? (
                    <div className="space-y-1.5">
                        <div className={cn('h-4 rounded w-3/4 animate-pulse', isOwnMessage ? 'bg-white/20' : 'bg-muted')} />
                        <div className={cn('h-3 rounded w-full animate-pulse', isOwnMessage ? 'bg-white/20' : 'bg-muted')} />
                    </div>
                ) : (
                    <>
                        {metadata.title && (
                            <p className={cn(
                                'font-bold text-sm leading-snug line-clamp-2',
                                isOwnMessage ? 'text-primary-foreground' : 'text-foreground'
                            )}>
                                {metadata.title}
                            </p>
                        )}
                        {metadata.description && (
                            <p className={cn(
                                'text-xs line-clamp-2',
                                isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'
                            )}>
                                {metadata.description}
                            </p>
                        )}
                        <div className="flex items-center gap-1.5 pt-0.5">
                            {favicon && (
                                <img
                                    src={favicon}
                                    alt=""
                                    className="w-3.5 h-3.5 rounded-sm object-contain shrink-0"
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            )}
                            <span className={cn(
                                'text-xs truncate max-w-[200px]',
                                isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                            )}>
                                {hostname}
                            </span>
                        </div>
                    </>
                )}
            </div>
        </a>
    );
}
