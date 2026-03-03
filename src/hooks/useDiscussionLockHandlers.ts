/**
 * useDiscussionLockHandlers
 * Gère toutes les actions sur le verrouillage d'une discussion privée
 * (définir, changer, désactiver le code de verrouillage ; déverrouiller la session).
 * Extrait de page.tsx pour réduire sa taille (#1).
 */
'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/src/lib/auth-client';

interface UseLockHandlersOptions {
    conversationId: string;
    mutateConversation: () => void;
    setIsUnlockedSession: (v: boolean) => void;
}

export function useDiscussionLockHandlers({
    conversationId,
    mutateConversation,
    setIsUnlockedSession,
}: UseLockHandlersOptions) {
    const [lockActionLoading, setLockActionLoading] = useState(false);
    const [showLockDialog, setShowLockDialog] = useState(false);
    const [showChangeCodeDialog, setShowChangeCodeDialog] = useState(false);
    const [showDisableLockDialog, setShowDisableLockDialog] = useState(false);
    const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
    const [lockCode, setLockCode] = useState('');
    const [currentCodeForChange, setCurrentCodeForChange] = useState('');
    const [newCodeForChange, setNewCodeForChange] = useState('');
    const [showLockCode, setShowLockCode] = useState(false);
    const [showCurrentCode, setShowCurrentCode] = useState(false);
    const [showNewCode, setShowNewCode] = useState(false);
    const [showUnlockOverlayCode, setShowUnlockOverlayCode] = useState(false);

    /** Définit un code de verrouillage sur la discussion */
    const handleSetLock = useCallback(async () => {
        if (!lockCode || lockCode.length !== 4 || !/^\d{4}$/.test(lockCode)) {
            toast.error('Le code doit être composé de 4 chiffres');
            return;
        }
        setLockActionLoading(true);
        try {
            const res = await fetchWithAuth(`/api/conversations/${conversationId}/lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: lockCode }),
            });
            if (res.ok) {
                toast.success('Discussion verrouillée');
                setShowLockDialog(false);
                setLockCode('');
                mutateConversation();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Erreur lors du verrouillage');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setLockActionLoading(false);
        }
    }, [conversationId, lockCode, mutateConversation]);

    /** Vérifie le code de verrouillage pour accéder à la discussion */
    const handleVerifyLockCode = useCallback(
        async (code: string): Promise<boolean> => {
            try {
                const res = await fetchWithAuth(
                    `/api/conversations/${conversationId}/verify-lock-code`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code }),
                    }
                );
                if (res.ok) {
                    setIsUnlockedSession(true);
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem(`unlocked_${conversationId}`, '1');
                    }
                    return true;
                } else {
                    const data = await res.json().catch(() => ({}));
                    toast.error(data.error || 'Code incorrect');
                    return false;
                }
            } catch {
                toast.error('Erreur réseau');
                return false;
            }
        },
        [conversationId, setIsUnlockedSession]
    );

    /** Désactive le verrouillage de la discussion */
    const handleDisableLock = useCallback(
        async (inputCode: string) => {
            if (!inputCode || inputCode.length !== 4) {
                toast.error('Code requis');
                return;
            }
            setLockActionLoading(true);
            try {
                const res = await fetchWithAuth(
                    `/api/conversations/${conversationId}/disable-lock`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: inputCode }),
                    }
                );
                if (res.ok) {
                    toast.success('Verrouillage désactivé');
                    setShowDisableLockDialog(false);
                    mutateConversation();
                } else {
                    const data = await res.json().catch(() => ({}));
                    toast.error(data.error || 'Erreur');
                }
            } catch {
                toast.error('Erreur réseau');
            } finally {
                setLockActionLoading(false);
            }
        },
        [conversationId, mutateConversation]
    );

    /** Change le code de verrouillage */
    const handleChangeLockCode = useCallback(async () => {
        if (currentCodeForChange.length !== 4 || newCodeForChange.length !== 4) {
            toast.error('Les codes doivent comporter 4 chiffres');
            return;
        }
        setLockActionLoading(true);
        try {
            const res = await fetchWithAuth(
                `/api/conversations/${conversationId}/change-lock-code`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        currentCode: currentCodeForChange,
                        newCode: newCodeForChange,
                    }),
                }
            );
            if (res.ok) {
                toast.success('Code modifié');
                setShowChangeCodeDialog(false);
                setCurrentCodeForChange('');
                setNewCodeForChange('');
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Erreur');
            }
        } catch {
            toast.error('Erreur réseau');
        } finally {
            setLockActionLoading(false);
        }
    }, [conversationId, currentCodeForChange, newCodeForChange]);

    return {
        // State
        lockActionLoading,
        showLockDialog, setShowLockDialog,
        showChangeCodeDialog, setShowChangeCodeDialog,
        showDisableLockDialog, setShowDisableLockDialog,
        showDeleteConfirmDialog, setShowDeleteConfirmDialog,
        lockCode, setLockCode,
        currentCodeForChange, setCurrentCodeForChange,
        newCodeForChange, setNewCodeForChange,
        showLockCode, setShowLockCode,
        showCurrentCode, setShowCurrentCode,
        showNewCode, setShowNewCode,
        showUnlockOverlayCode, setShowUnlockOverlayCode,
        // Handlers
        handleSetLock,
        handleVerifyLockCode,
        handleDisableLock,
        handleChangeLockCode,
    };
}
