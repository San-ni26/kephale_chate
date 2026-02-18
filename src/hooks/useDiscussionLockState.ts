'use client';

import { useMemo } from 'react';

export interface ConversationForLock {
    isLocked?: boolean;
    currentUserIsPro?: boolean;
    isDirect?: boolean;
    members?: unknown[];
}

export interface LockState {
    isLocked: boolean;
    userIsPro: boolean;
    isDirectTwoPerson: boolean;
    canUseLock: boolean;
    showLockIcon: boolean;
    canManageLock: boolean;
}

export function useDiscussionLockState(conversation: ConversationForLock | null): LockState {
    return useMemo(() => {
        const locked = conversation?.isLocked ?? false;
        const userPro = conversation?.currentUserIsPro ?? false;
        const directTwo = !!(conversation?.isDirect && conversation?.members?.length === 2);
        return {
            isLocked: locked,
            userIsPro: userPro,
            isDirectTwoPerson: directTwo,
            canUseLock: directTwo && userPro,
            showLockIcon: !!conversation,
            canManageLock: locked && userPro,
        };
    }, [
        conversation?.isLocked,
        conversation?.currentUserIsPro,
        conversation?.isDirect,
        conversation?.members?.length,
        conversation,
    ]);
}
