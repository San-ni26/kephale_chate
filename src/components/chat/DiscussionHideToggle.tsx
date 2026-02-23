'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Archive, ArchiveRestore } from 'lucide-react';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

interface DiscussionHideToggleProps {
    discussionId: string;
    hiddenByUserId: string | null | undefined;
    currentUserId: string | undefined;
    onSuccess?: () => void;
}

export function DiscussionHideToggle({
    discussionId,
    hiddenByUserId,
    currentUserId,
    onSuccess,
}: DiscussionHideToggleProps) {
    const [loading, setLoading] = useState(false);
    const isHiddenByMe = hiddenByUserId === currentUserId;

    const handleToggle = async () => {
        if (!discussionId || loading) return;
        setLoading(true);
        try {
            const endpoint = isHiddenByMe ? 'unhide' : 'hide';
            const res = await fetchWithAuth(`/api/conversations/${discussionId}/${endpoint}`, {
                method: 'POST',
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast.success(data.message || (isHiddenByMe ? 'Discussion affichée' : 'Discussion masquée'));
                onSuccess?.();
            } else {
                toast.error(data.error || 'Erreur');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleToggle}
            disabled={loading}
            title={isHiddenByMe ? 'Afficher la discussion pour l\'autre' : 'Masquer la discussion pour l\'autre'}
            className={cn(
                'hover:bg-primary/10',
                isHiddenByMe ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
        >
            {isHiddenByMe ? (
                <ArchiveRestore className="w-5 h-5" />
            ) : (
                <Archive className="w-5 h-5" />
            )}
        </Button>
    );
}
