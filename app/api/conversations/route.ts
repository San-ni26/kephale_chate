import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { getOnlineUserIds } from '@/src/lib/presence';
import { getUsersInCall } from '@/src/lib/call-redis';
import { isUserProActive } from '@/src/lib/user-pro';
import { hashForSearch, decryptPII } from '@/src/lib/server-crypto';

// GET: Get all conversations for the authenticated user
export async function GET(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        // Get all groups where user is a member, with unread counts and rights
        const conversations = await prisma.group.findMany({
            where: {
                members: {
                    some: {
                        userId: user.userId,
                    },
                },
            },
            include: {
                rightPurchase: {
                    select: { buyerId: true, expiresAt: true },
                },
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                avatarUrl: true,
                                publicKey: true,
                                isOnline: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
                messages: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1,
                    include: {
                        sender: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                department: {
                    select: {
                        id: true,
                        name: true,
                        publicKey: true,
                    },
                },
                deletionRequest: {
                    include: {
                        requester: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        // Calculate unread counts and merge Redis presence + statut appel + statut Pro
        const memberUserIds = [...new Set(conversations.flatMap(c => c.members.map(m => m.user.id)))];
        const [presenceMap, callMap, proSubscriptions] = await Promise.all([
            getOnlineUserIds(memberUserIds),
            getUsersInCall(memberUserIds),
            prisma.userProSubscription.findMany({
                where: { userId: { in: memberUserIds }, isActive: true },
                select: { userId: true, endDate: true },
            }),
        ]);

        const proUserIds = new Set(
            proSubscriptions.filter(s => isUserProActive(s.endDate)).map(s => s.userId)
        );

        // ─── Fix #3 : Élimination des N+1 queries ─────────────────────────────────
        // AVANT : N requêtes prisma.message.count() + 2N requêtes pour les paiements
        // APRÈS : 1 requête SQL groupée pour les unread counts + 2 findMany batchés
        // ──────────────────────────────────────────────────────────────────────────

        // 1. Construire la map lastReadAt pour chaque conversation de l'utilisateur
        const memberLastReadMap = new Map<string, Date>();
        for (const conv of conversations) {
            const membership = conv.members.find(m => m.userId === user.userId);
            if (membership) {
                memberLastReadMap.set(conv.id, membership.lastReadAt || membership.joinedAt || new Date(0));
            }
        }
        const convIds = conversations.map(c => c.id);

        // 2. Fix #3 : Unread counts — une seule requête SQL brute avec GROUP BY
        // Remplace N prisma.message.count() individuels → 1 query totale
        type UnreadRow = { groupId: string; count: bigint };
        const unreadRows = convIds.length > 0
            ? await prisma.$queryRaw<UnreadRow[]>`
                SELECT m."groupId", COUNT(*)::int8 AS count
                FROM "Message" m
                WHERE m."groupId" = ANY(${convIds})
                  AND m."senderId" != ${user.userId}
                  AND m."createdAt" > (
                      SELECT COALESCE(gm."lastReadAt", gm."joinedAt", TIMESTAMP '1970-01-01')
                      FROM "GroupMember" gm
                      WHERE gm."groupId" = m."groupId"
                        AND gm."userId" = ${user.userId}
                  )
                GROUP BY m."groupId"
            `
            : [];
        const unreadCountMap = new Map<string, number>(
            unreadRows.map(r => [r.groupId, Number(r.count)])
        );

        // 3. Fix #3 : Pending payments — 2 findMany batchés pour TOUS les groupIds éligibles
        // D'abord déterminer quels groupIds ont canPurchaseRights = true
        const currentPro = proUserIds.has(user.userId);
        const eligibleConvIds = conversations
            .filter(conv => {
                const otherMember = conv.members.find(m => m.userId !== user.userId);
                const otherPro = otherMember ? proUserIds.has(otherMember.userId) : false;
                const isDirectTwo = conv.isDirect && conv.members.length === 2;
                const activeRights = conv.rightPurchase && new Date() < conv.rightPurchase.expiresAt;
                return isDirectTwo && currentPro && otherPro && !activeRights;
            })
            .map(conv => conv.id);

        // 2 requêtes batch au lieu de 2N requêtes individuelles
        const [pendingPaymentsBatch, pendingOrdersBatch] = eligibleConvIds.length > 0
            ? await Promise.all([
                prisma.pendingSubscriptionPayment.findMany({
                    where: {
                        userId: user.userId,
                        type: 'DISCUSSION_RIGHTS',
                        groupId: { in: eligibleConvIds },
                    },
                    select: { id: true, plan: true, createdAt: true, groupId: true },
                }),
                prisma.paymentOrder.findMany({
                    where: {
                        userId: user.userId,
                        type: 'DISCUSSION_RIGHTS',
                        groupId: { in: eligibleConvIds },
                        status: 'PENDING',
                    },
                    select: { id: true, plan: true, amountFcfa: true, createdAt: true, groupId: true },
                }),
            ])
            : [[], []];

        // Indexer par groupId pour un accès O(1)
        const pendingPaymentMap = new Map(pendingPaymentsBatch.map(p => [p.groupId, p]));
        const pendingOrderMap = new Map(pendingOrdersBatch.map(o => [o.groupId, o]));

        // 4. Assemblage final — pur JS, 0 query supplémentaire
        const conversationsWithUnread = conversations.map(conv => {
            const unreadCount = unreadCountMap.get(conv.id) ?? 0;

            // Merge Redis presence + statut appel + statut Pro
            const membersWithPresence = conv.members.map(m => ({
                ...m,
                user: {
                    ...m.user,
                    isOnline: presenceMap[m.user.id] ?? m.user.isOnline,
                    inCall: !!callMap[m.user.id],
                    isPro: proUserIds.has(m.user.id),
                },
            }));

            const otherMember = conv.members.find(m => m.userId !== user.userId);
            const otherPro = otherMember ? proUserIds.has(otherMember.userId) : false;
            const isDirectTwo = conv.isDirect && conv.members.length === 2;
            const activeRights = conv.rightPurchase && new Date() < conv.rightPurchase.expiresAt;
            const canPurchaseRights = isDirectTwo && currentPro && otherPro && !activeRights;
            const canDelete = !(otherPro && !currentPro);

            let pendingRightsPayment: { id: string; plan: string; createdAt: string } | null = null;
            let pendingRightsOrder: { id: string; plan: string; amountFcfa: number; createdAt: string } | null = null;

            if (canPurchaseRights) {
                const pendingPay = pendingPaymentMap.get(conv.id);
                const pendingOrd = pendingOrderMap.get(conv.id);
                if (pendingPay) {
                    pendingRightsPayment = {
                        id: pendingPay.id,
                        plan: pendingPay.plan,
                        createdAt: pendingPay.createdAt.toISOString(),
                    };
                }
                if (pendingOrd) {
                    pendingRightsOrder = {
                        id: pendingOrd.id,
                        plan: pendingOrd.plan,
                        amountFcfa: pendingOrd.amountFcfa,
                        createdAt: pendingOrd.createdAt.toISOString(),
                    };
                }
            }

            return {
                ...conv,
                members: membersWithPresence,
                unreadCount,
                canPurchaseRights,
                canDelete,
                pendingRightsPayment,
                pendingRightsOrder,
            };
        });


        // Déchiffrer les emails des membres dans chaque conversation
        const conversationsWithUnreadAndDecryptedEmails = conversationsWithUnread.map(conv => ({
            ...conv,
            members: conv.members.map(m => ({
                ...m,
                user: {
                    ...m.user,
                    email: decryptPII(m.user.email) || m.user.email,
                },
            })),
        }));

        return NextResponse.json({ conversations: conversationsWithUnreadAndDecryptedEmails }, { status: 200 });

    } catch (error) {
        console.error('Get conversations error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des conversations' },
            { status: 500 }
        );
    }
}

// POST: Create a new direct conversation
export async function POST(request: NextRequest) {
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const { otherUserEmail, participantId } = body;

        if (!otherUserEmail && !participantId) {
            return NextResponse.json(
                { error: 'Email ou ID de l\'autre utilisateur requis' },
                { status: 400 }
            );
        }

        // Find the other user by ID or email
        let otherUser;
        if (participantId) {
            otherUser = await prisma.user.findUnique({
                where: { id: participantId },
            });
        } else {
            // Lookup par HMAC (chiffré) puis fallback en clair (legacy)
            const emailHash = hashForSearch(otherUserEmail);
            otherUser = await prisma.user.findFirst({ where: { emailHash } });
            if (!otherUser) {
                otherUser = await prisma.user.findUnique({ where: { email: otherUserEmail } });
            }
        }

        if (!otherUser) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        if (otherUser.id === user.userId) {
            return NextResponse.json(
                { error: 'Vous ne pouvez pas créer une conversation avec vous-même' },
                { status: 400 }
            );
        }

        // Check if conversation already exists
        const existingConversation = await prisma.group.findFirst({
            where: {
                isDirect: true,
                members: {
                    every: {
                        OR: [
                            { userId: user.userId },
                            { userId: otherUser.id },
                        ],
                    },
                },
            },
            include: {
                members: true,
            },
        });

        // Verify it's a 2-person conversation
        if (existingConversation && existingConversation.members.length === 2) {
            const memberIds = existingConversation.members.map((m: any) => m.userId);
            if (memberIds.includes(user.userId) && memberIds.includes(otherUser.id)) {
                return NextResponse.json(
                    {
                        message: 'Conversation déjà existante',
                        conversationId: existingConversation.id,
                    },
                    { status: 200 }
                );
            }
        }

        // Create new direct conversation
        const conversation = await prisma.group.create({
            data: {
                isDirect: true,
                members: {
                    create: [
                        { userId: user.userId },
                        { userId: otherUser.id },
                    ],
                },
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                publicKey: true,
                                isOnline: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
            },
        });

        // Déchiffrer les emails dans la réponse POST
        const conversationDecrypted = {
            ...conversation,
            members: conversation.members.map(m => ({
                ...m,
                user: {
                    ...m.user,
                    email: decryptPII(m.user.email) || m.user.email,
                },
            })),
        };

        return NextResponse.json(
            {
                message: 'Conversation créée avec succès',
                conversation: conversationDecrypted,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Create conversation error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la création de la conversation' },
            { status: 500 }
        );
    }
}
