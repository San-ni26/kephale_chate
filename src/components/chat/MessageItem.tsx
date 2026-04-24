'use client';

/**
 * MessageItem - Composant de message avec swipe actions et support mobile
 * Optimisé pour le tactile avec animations fluides
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Download, 
  Reply, 
  Share2,
  Check,
  CheckCheck,
  X
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/src/components/ui/dropdown-menu';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { useSwipeGesture } from '@/src/hooks/useSwipeGesture';
import { triggerHaptic } from '@/src/lib/haptics';
import { useShare, copyToClipboard } from '@/src/lib/share';
import { isMobileDevice } from '@/src/lib/device';

interface MessageAttachment {
    id?: string;
    type: string;
    filename: string;
    data: string;
    url?: string;
}

interface Message {
    id: string;
    content: string;
    senderId: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    isEdited?: boolean;
    isRead?: boolean;
    replyTo?: {
        id: string;
        content: string;
        senderName: string;
    } | null;
    attachments?: MessageAttachment[];
}

interface MessageItemProps {
    message: Message;
    currentUserId: string;
    senderName?: string;
    myPrivateKey?: string;
    theirPublicKey?: string;
    onEdit?: (messageId: string, newContent: string) => void;
    onDelete?: (messageId: string) => void;
    onReply?: (message: Message) => void;
    onImageClick?: (attachment: MessageAttachment, allAttachments: MessageAttachment[]) => void;
    isLastRead?: boolean;
}

export function MessageItem({
    message,
    currentUserId,
    senderName,
    myPrivateKey,
    theirPublicKey,
    onEdit,
    onDelete,
    onReply,
    onImageClick,
    isLastRead,
}: MessageItemProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(message.content);
    const [canEdit, setCanEdit] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const { isSupported: isShareSupported, shareText } = useShare();
    const isMobile = isMobileDevice();

    const isOwnMessage = message.senderId === currentUserId;

    useEffect(() => {
        // Check if message can still be edited (within 5 minutes)
        const messageAge = Date.now() - new Date(message.createdAt).getTime();
        const fiveMinutes = 5 * 60 * 1000;
        setCanEdit(isOwnMessage && messageAge < fiveMinutes);
    }, [message.createdAt, isOwnMessage]);

    // Swipe handlers
    const handleSwipeRight = useCallback(() => {
        triggerHaptic('SWIPE_ACTION', 'light');
        onReply?.(message);
    }, [message, onReply]);

    const handleSwipeLeft = useCallback(() => {
        triggerHaptic('SWIPE_ACTION', 'medium');
        setShowActions(true);
    }, []);

    const { swipeState, handlers, reset } = useSwipeGesture({
        onSwipeRight: handleSwipeRight,
        onSwipeLeft: handleSwipeLeft,
        threshold: 60,
        maxSwipe: 100,
        elasticity: 0.7,
        direction: 'horizontal',
    });

    const handleEdit = () => {
        if (editedContent.trim() && editedContent !== message.content) {
            onEdit?.(message.id, editedContent);
            setIsEditing(false);
            triggerHaptic('SUCCESS', 'success');
        }
    };

    const handleDelete = () => {
        triggerHaptic('DELETE', 'error');
        onDelete?.(message.id);
        setShowActions(false);
    };

    const handleReply = () => {
        triggerHaptic('SWIPE_ACTION', 'light');
        onReply?.(message);
        setShowActions(false);
        reset();
    };

    const handleShare = async () => {
        const success = await shareText(message.content, 'Message');
        if (success) {
            toast.success('Message partagé');
        } else {
            // Fallback: copier dans le presse-papiers
            const copied = await copyToClipboard(message.content);
            if (copied) {
                toast.success('Message copié');
            }
        }
        setShowActions(false);
    };

    const handleCopy = async () => {
        const copied = await copyToClipboard(message.content);
        if (copied) {
            toast.success('Message copié');
            triggerHaptic('SUCCESS', 'success');
        }
        setShowActions(false);
    };

    const handleDownload = async (attachment: MessageAttachment) => {
        try {
            const url = attachment.data || attachment.url;
            if (!url) return;

            if (url.startsWith('http') || url.startsWith('data:')) {
                const response = await fetch(url);
                const blob = await response.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = attachment.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
                toast.success('Téléchargement réussi');
                triggerHaptic('SUCCESS', 'success');
                return;
            }
        } catch (error) {
            toast.error('Erreur lors du téléchargement');
            triggerHaptic('ERROR', 'error');
        }
    };

    const formatTime = (date: string | Date) => {
        return new Date(date).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Calculer la translation pour l'effet swipe
    const swipeTranslate = swipeState.deltaX;
    const swipeOpacity = Math.min(swipeState.progress * 0.5, 0.5);

    return (
        <div className={cn('relative mb-1', isOwnMessage ? 'pl-12' : 'pr-12')}>
            {/* Indicateur de swipe (icône reply) */}
            {swipeState.deltaX > 20 && (
                <motion.div
                    className={cn(
                        'absolute top-1/2 -translate-y-1/2',
                        isOwnMessage ? 'left-0' : 'left-0'
                    )}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ 
                        opacity: swipeOpacity, 
                        scale: 0.5 + swipeState.progress * 0.5,
                        x: isOwnMessage ? 10 : 10
                    }}
                >
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                        <Reply className="w-5 h-5 text-primary-foreground" />
                    </div>
                </motion.div>
            )}

            {/* Indicateur de swipe (icône actions) */}
            {swipeState.deltaX < -20 && (
                <motion.div
                    className={cn(
                        'absolute top-1/2 -translate-y-1/2',
                        isOwnMessage ? 'right-0' : 'right-0'
                    )}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ 
                        opacity: swipeOpacity, 
                        scale: 0.5 + swipeState.progress * 0.5,
                        x: isOwnMessage ? -10 : -10
                    }}
                >
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <MoreVertical className="w-5 h-5 text-foreground" />
                    </div>
                </motion.div>
            )}

            {/* Message bubble */}
            <motion.div
                {...handlers}
                animate={{ x: swipeTranslate }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className={cn(
                    'flex',
                    isOwnMessage ? 'justify-end' : 'justify-start'
                )}
            >
                <div
                    className={cn(
                        'max-w-[75%] rounded-2xl px-4 py-2.5',
                        'transition-shadow duration-200',
                        isOwnMessage
                            ? 'bg-[var(--message-sent)] text-[var(--message-sent-text)] rounded-br-sm'
                            : 'bg-[var(--message-received)] text-[var(--message-received-text)] border border-border rounded-bl-sm',
                        isLastRead && 'ring-2 ring-primary/20'
                    )}
                >
                    {/* Reply preview */}
                    {message.replyTo && (
                        <div className={cn(
                            'mb-2 pl-3 border-l-2 text-xs',
                            isOwnMessage ? 'border-white/30' : 'border-primary/30'
                        )}>
                            <p className={cn(
                                'font-medium',
                                isOwnMessage ? 'text-white/70' : 'text-muted-foreground'
                            )}>
                                {message.replyTo.senderName}
                            </p>
                            <p className={cn(
                                'truncate',
                                isOwnMessage ? 'text-white/60' : 'text-muted-foreground/70'
                            )}>
                                {message.replyTo.content}
                            </p>
                        </div>
                    )}

                    {isEditing ? (
                        <div className="flex-1 space-y-2">
                            <Input
                                value={editedContent}
                                onChange={(e) => setEditedContent(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleEdit();
                                    if (e.key === 'Escape') setIsEditing(false);
                                }}
                                className="bg-background/50 border-border text-foreground"
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <Button size="sm" onClick={handleEdit}>
                                    Enregistrer
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setIsEditing(false)}
                                >
                                    Annuler
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Sender name (for group chats) */}
                            {!isOwnMessage && senderName && (
                                <p className="text-xs font-medium text-primary mb-1">
                                    {senderName}
                                </p>
                            )}

                            {/* Content */}
                            {message.content && (
                                <p className="text-sm break-words whitespace-pre-wrap">
                                    {message.content}
                                </p>
                            )}

                            {/* Attachments */}
                            {message.attachments && message.attachments.length > 0 && (
                                <div className={cn(
                                    'space-y-2',
                                    message.content ? 'mt-2' : ''
                                )}>
                                    {message.attachments.map((attachment, idx) => (
                                        <div key={attachment.id || idx}>
                                            {attachment.type === 'IMAGE' && (
                                                <div 
                                                    className="rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                                                    onClick={() => onImageClick?.(attachment, message.attachments || [])}
                                                >
                                                    <img
                                                        src={attachment.data || attachment.url}
                                                        alt={attachment.filename}
                                                        className="max-w-[250px] w-full h-auto object-cover"
                                                        loading="lazy"
                                                    />
                                                </div>
                                            )}
                                            
                                            {attachment.type === 'AUDIO' && (
                                                <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg">
                                                    <audio 
                                                        src={attachment.data || attachment.url} 
                                                        controls 
                                                        className="w-full max-w-[200px] h-8"
                                                    />
                                                </div>
                                            )}
                                            
                                            {(attachment.type === 'PDF' || attachment.type === 'WORD') && (
                                                <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg border border-border">
                                                    <span className="text-xs flex-1 truncate">
                                                        {attachment.filename}
                                                    </span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleDownload(attachment)}
                                                        className="h-7 w-7 p-0"
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Footer: time + status */}
                            <div className="flex items-center justify-end gap-1 mt-1">
                                <span className={cn(
                                    'text-[10px]',
                                    isOwnMessage ? 'text-white/70' : 'text-muted-foreground'
                                )}>
                                    {formatTime(message.createdAt)}
                                </span>
                                
                                {message.isEdited && (
                                    <span className={cn(
                                        'text-[10px] italic',
                                        isOwnMessage ? 'text-white/50' : 'text-muted-foreground/60'
                                    )}>
                                        modifié
                                    </span>
                                )}

                                {/* Read receipts (own messages only) */}
                                {isOwnMessage && (
                                    <span className="ml-0.5">
                                        {message.isRead ? (
                                            <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                                        ) : (
                                            <Check className={cn(
                                                'w-3.5 h-3.5',
                                                isOwnMessage ? 'text-white/50' : 'text-muted-foreground'
                                            )} />
                                        )}
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </motion.div>

            {/* Desktop: Dropdown menu */}
            {!isMobile && isOwnMessage && !isEditing && (
                <div className={cn(
                    'absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity',
                    isOwnMessage ? 'right-0' : 'left-0'
                )}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isOwnMessage ? 'end' : 'start'}>
                            {canEdit && (
                                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Modifier
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={handleReply}>
                                <Reply className="mr-2 h-4 w-4" />
                                Répondre
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleCopy}>
                                <Share2 className="mr-2 h-4 w-4" />
                                Copier
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                                onClick={() => onDelete?.(message.id)}
                                className="text-destructive"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Supprimer
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}

            {/* Mobile: Actions modal */}
            <AnimatePresence>
                {showActions && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center"
                        onClick={() => setShowActions(false)}
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="bg-background w-full max-w-md rounded-t-2xl p-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4" />
                            
                            <div className="space-y-1">
                                <button
                                    onClick={handleReply}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted transition-colors text-left"
                                >
                                    <Reply className="w-5 h-5 text-primary" />
                                    <span>Répondre</span>
                                </button>
                                
                                <button
                                    onClick={handleCopy}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted transition-colors text-left"
                                >
                                    <Share2 className="w-5 h-5 text-muted-foreground" />
                                    <span>Copier</span>
                                </button>
                                
                                {canEdit && (
                                    <button
                                        onClick={() => {
                                            setIsEditing(true);
                                            setShowActions(false);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted transition-colors text-left"
                                    >
                                        <Edit2 className="w-5 h-5 text-muted-foreground" />
                                        <span>Modifier</span>
                                    </button>
                                )}
                                
                                {isOwnMessage && (
                                    <button
                                        onClick={handleDelete}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-destructive/10 transition-colors text-left text-destructive"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                        <span>Supprimer</span>
                                    </button>
                                )}
                                
                                <div className="border-t border-border my-2" />
                                
                                <button
                                    onClick={() => setShowActions(false)}
                                    className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg hover:bg-muted transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                    <span>Annuler</span>
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default MessageItem;
