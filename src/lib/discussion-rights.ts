/**
 * Gestion des droits d'une discussion Pro (SERVER ONLY - utilise prisma)
 * - Achat des droits (3, 6, 12 mois)
 * - Contrôle : lock, masquer, supprimer
 */

import { prisma } from '@/src/lib/prisma';
import { isUserProActive } from '@/src/lib/user-pro';
import {
    DISCUSSION_RIGHT_DURATIONS,
    type DiscussionRightDuration,
} from '@/src/lib/discussion-rights-constants';

export type { DiscussionRightDuration };
export { DISCUSSION_RIGHT_DURATIONS };

export function getDiscussionRightPrice(duration: DiscussionRightDuration): number {
    return DISCUSSION_RIGHT_DURATIONS[duration].priceFcfa;
}

export function getExpiresAt(duration: DiscussionRightDuration): Date {
    const config = DISCUSSION_RIGHT_DURATIONS[duration];
    const d = new Date();
    d.setMonth(d.getMonth() + config.months);
    return d;
}

export interface DiscussionRightsInfo {
    rightsOwnerId: string | null;
    sellerId: string | null;
    expiresAt: Date | null;
    isActive: boolean;
}

/**
 * Retourne le propriétaire des droits actifs pour une discussion (Pro/Pro).
 * Si aucun achat, null.
 */
export async function getDiscussionRightsOwner(
    groupId: string
): Promise<DiscussionRightsInfo | null> {
    const purchase = await prisma.discussionRightPurchase.findUnique({
        where: { groupId, isActive: true },
        select: { buyerId: true, sellerId: true, expiresAt: true },
    });
    if (!purchase) return null;
    if (new Date() >= purchase.expiresAt) return null;
    return {
        rightsOwnerId: purchase.buyerId,
        sellerId: purchase.sellerId,
        expiresAt: purchase.expiresAt,
        isActive: true,
    };
}

/**
 * Vérifie si l'utilisateur a le contrôle total sur la discussion :
 * - lock/unlock, change code
 * - masquer/afficher
 * - supprimer
 *
 * Pour Pro+Simple : le Pro a le contrôle
 * Pour Pro+Pro sans achat : les deux ont le contrôle
 * Pour Pro+Pro avec achat : seul le buyer a le contrôle
 */
export async function canUserControlDiscussion(
    groupId: string,
    userId: string
): Promise<boolean> {
    const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { members: true, rightPurchase: true },
    });
    if (!group || !group.isDirect || group.members.length !== 2) return false;

    const memberIds = group.members.map((m) => m.userId);
    const proSubs = await prisma.userProSubscription.findMany({
        where: { userId: { in: memberIds }, isActive: true },
        select: { userId: true, endDate: true },
    });
    const proUserIds = new Set(
        proSubs.filter((s) => isUserProActive(s.endDate)).map((s) => s.userId)
    );

    const currentUserIsPro = proUserIds.has(userId);
    const otherUserIsPro = memberIds.every((id) => id === userId || proUserIds.has(id));

    // Pro + Simple : seul le Pro a le contrôle
    if (currentUserIsPro && !otherUserIsPro) return true;

    // Pro + Pro sans achat : les deux ont le contrôle
    if (currentUserIsPro && otherUserIsPro && !group.rightPurchase) return true;

    // Pro + Pro avec achat : seul le buyer a le contrôle
    if (group.rightPurchase) {
        const isActive = new Date() < group.rightPurchase.expiresAt;
        if (isActive && group.rightPurchase.buyerId === userId) return true;
    }

    return false;
}

/**
 * Vérifie si l'utilisateur peut masquer la discussion.
 * Même logique que canUserControlDiscussion.
 */
export async function canUserHideDiscussion(
    groupId: string,
    userId: string
): Promise<boolean> {
    return canUserControlDiscussion(groupId, userId);
}
