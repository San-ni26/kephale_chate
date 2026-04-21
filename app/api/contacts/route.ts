/**
 * GET /api/contacts
 * Retourne la liste des contacts de l'utilisateur (basé sur les conversations)
 * Query: ?onlineOnly=true - filtre uniquement les utilisateurs en ligne
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { prisma } from '@/src/lib/prisma';
import { decryptPII } from '@/src/lib/server-crypto';
import { getOnlineUserIds } from '@/src/lib/presence';

interface ContactInfo {
    id: string;
    name: string;
    email?: string;
    avatarUrl?: string;
    isOnline: boolean;
    lastSeen?: Date;
}

export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;

    const user = (request as AuthenticatedRequest).user;
    if (!user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const onlineOnly = searchParams.get('onlineOnly') === 'true';

    try {
        // Récupérer tous les groupes privés (conversations 1-to-1) de l'utilisateur
        // isDirect = true indique une conversation privée
        const groups = await prisma.group.findMany({
            where: {
                isDirect: true,
                members: {
                    some: {
                        userId: user.userId,
                    },
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
                                avatarUrl: true,
                            },
                        },
                    },
                },
            },
        });

        // Extraire les autres membres (contacts)
        const contactsMap = new Map<string, ContactInfo>();

        for (const group of groups) {
            for (const member of group.members) {
                if (member.userId !== user.userId) {
                    const contact: ContactInfo = {
                        id: member.user.id,
                        name: member.user.name || 'Utilisateur',
                        email: member.user.email ? (decryptPII(member.user.email) || undefined) : undefined,
                        avatarUrl: member.user.avatarUrl || undefined,
                        isOnline: false,
                    };
                    contactsMap.set(member.userId, contact);
                }
            }
        }

        // Vérifier le statut en ligne des contacts
        const contactIds = Array.from(contactsMap.keys());
        const onlineStatus = await getOnlineUserIds(contactIds);
        
        for (const [userId, contact] of contactsMap) {
            contact.isOnline = onlineStatus[userId] || false;
        }

        // Filtrer si onlineOnly
        let contacts = Array.from(contactsMap.values());
        if (onlineOnly) {
            contacts = contacts.filter(c => c.isOnline);
        }

        return NextResponse.json({ contacts });
    } catch (error) {
        console.error('[Contacts] Error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des contacts' },
            { status: 500 }
        );
    }
}
