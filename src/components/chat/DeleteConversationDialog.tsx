'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';

interface DeleteConversationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void | Promise<void>;
    loading?: boolean;
}

export function DeleteConversationDialog({
    open,
    onOpenChange,
    onConfirm,
    loading = false,
}: DeleteConversationDialogProps) {
    const handleConfirm = async () => {
        await onConfirm();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-md bg-card border-border text-card-foreground shadow-lg"
                showCloseButton={true}
            >
                <DialogHeader>
                    <div className="flex justify-center mb-2">
                        <div className="bg-destructive/10 w-14 h-14 rounded-full flex items-center justify-center">
                            <Trash2 className="w-7 h-7 text-destructive" />
                        </div>
                    </div>
                    <DialogTitle className="text-center text-foreground">
                        Supprimer cette discussion ?
                    </DialogTitle>
                    <DialogDescription className="text-center text-muted-foreground">
                        Les messages seront définitivement effacés. Cette action est irréversible.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-row gap-2 sm:justify-center mt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                        className="border-border text-foreground hover:bg-muted"
                    >
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={loading}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Suppression…
                            </>
                        ) : (
                            <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Supprimer
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
