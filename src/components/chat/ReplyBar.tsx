'use client';

/**
 * ReplyBar - Barre de réponse à un message
 * Affiche le message cité au-dessus de l'input
 */

import { X, Reply } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ReplyBarProps {
  replyTo: {
    id: string;
    content: string;
    senderName: string;
    senderId: string;
    attachments?: { type: string; filename: string }[];
  } | null;
  onCancel: () => void;
  currentUserId?: string;
}

export function ReplyBar({ replyTo, onCancel, currentUserId }: ReplyBarProps) {
  if (!replyTo) return null;

  const isOwnMessage = replyTo.senderId === currentUserId;
  
  // Tronquer le contenu si trop long
  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  // Déterminer le type de contenu
  const getContentPreview = () => {
    if (replyTo.attachments && replyTo.attachments.length > 0) {
      const attachment = replyTo.attachments[0];
      if (attachment.type === 'IMAGE') return '📷 Photo';
      if (attachment.type === 'AUDIO') return '🎵 Message vocal';
      if (attachment.type === 'PDF') return '📄 PDF';
      if (attachment.type === 'WORD') return '📝 Document';
      return `📎 ${attachment.filename}`;
    }
    return truncateContent(replyTo.content);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -10, height: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'px-4 py-2 border-t border-border',
          'bg-muted/30'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Icône reply */}
          <div className="mt-0.5 text-primary">
            <Reply className="w-4 h-4" />
          </div>
          
          {/* Contenu */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-xs font-medium',
                isOwnMessage ? 'text-primary' : 'text-muted-foreground'
              )}>
                {isOwnMessage ? 'Vous' : replyTo.senderName}
              </span>
            </div>
            
            <p className="text-sm text-foreground/80 truncate mt-0.5">
              {getContentPreview()}
            </p>
          </div>
          
          {/* Bouton annuler */}
          <button
            onClick={onCancel}
            className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Annuler la réponse"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Ligne de connexion visuelle */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-primary/30 -z-10" />
      </motion.div>
    </AnimatePresence>
  );
}

export default ReplyBar;
