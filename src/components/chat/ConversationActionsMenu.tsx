'use client';

import { useState } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/src/components/ui/dropdown-menu';
import { Button } from '@/src/components/ui/button';
import { MoreVertical, Trash2, Crown } from 'lucide-react';
import { DeleteConversationDialog } from '@/src/components/chat/DeleteConversationDialog';
import { PurchaseRightsDialog } from '@/src/components/chat/PurchaseRightsDialog';
import { fetchWithAuth } from '@/src/lib/auth-client';
import { toast } from 'sonner';

interface PendingRightsPayment {
    id: string;
    plan: string;
    createdAt: string;
}

interface PendingRightsOrder {
    id: string;
    plan: string;
    amountFcfa: number;
    createdAt: string;
}

interface ConversationActionsMenuProps {
    conversationId: string;
    canDelete: boolean;
    canPurchaseRights: boolean;
    onDeleteSuccess?: () => void;
    onPurchaseSuccess?: () => void;
    pendingRightsPayment?: PendingRightsPayment | null;
    pendingRightsOrder?: PendingRightsOrder | null;
    className?: string;
    size?: 'sm' | 'default' | 'lg' | 'icon';
}

export function ConversationActionsMenu({
    conversationId,
    canDelete,
    canPurchaseRights,
    onDeleteSuccess,
    onPurchaseSuccess,
    pendingRightsPayment,
    pendingRightsOrder,
    className = '',
    size = 'icon',
}: ConversationActionsMenuProps) {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const handleDelete = async () => {
        setDeleteLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}`, {
                method: 'DELETE',
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                if (data.requestSent) {
                    toast.success("Demande de suppression envoyée. L'autre utilisateur doit accepter.");
                } else {
                    toast.success('Discussion supprimée');
                }
                setDeleteDialogOpen(false);
                onDeleteSuccess?.();
            } else {
                toast.error(data.error || 'Impossible de supprimer');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size={size}
                        className={`p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ${className}`}
                        onClick={(e) => e.preventDefault()}
                        title="Options"
                        aria-label="Options de la discussion"
                    >
                        <MoreVertical className="w-4 h-4 text-current" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    {canDelete && (
                        <DropdownMenuItem
                            onClick={(e) => {
                                e.preventDefault();
                                setDeleteDialogOpen(true);
                            }}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                            <Trash2 className="w-4 h-4 mr-2 text-current" />
                            Supprimer
                        </DropdownMenuItem>
                    )}
                    {canPurchaseRights && (
                        <DropdownMenuItem
                            onClick={(e) => {
                                e.preventDefault();
                                setPurchaseDialogOpen(true);
                            }}
                            className="focus:bg-amber-500/10 dark:focus:bg-amber-400/10"
                        >
                            <Crown className="w-4 h-4 mr-2 text-amber-600 dark:text-amber-400" />
                            Acheter les droits de discussion
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <DeleteConversationDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                onConfirm={handleDelete}
                loading={deleteLoading}
            />

            <PurchaseRightsDialog
                open={purchaseDialogOpen}
                onOpenChange={setPurchaseDialogOpen}
                discussionId={conversationId}
                onSuccess={onPurchaseSuccess}
                pendingRightsPayment={pendingRightsPayment}
                pendingRightsOrder={pendingRightsOrder}
            />
        </>
    );
}
