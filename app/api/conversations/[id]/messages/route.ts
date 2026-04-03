import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { notifyNewMessage } from '@/src/lib/websocket';
import { decryptUserPII } from '@/src/lib/server-crypto';
import { supabaseAdmin, STORAGE_BUCKET, getPublicUrl } from '@/src/lib/supabase';

/** Transforme les attachments : si storageKey présent → url publique, data supprimé */
function optimizeMsg(msg: any) {
    if (!msg?.attachments) return msg;
    return {
        ...msg,
        attachments: msg.attachments.map((att: any) => {
            if (att.storageKey) {
                const { data: _data, ...rest } = att;
                return { ...rest, url: getPublicUrl(att.storageKey) };
            }
            return att;
        }),
    };
}
function optimizeAttachments(messages: any[]) {
    return messages.map(optimizeMsg);
}

// GET: Get messages for a conversation with cursor-based pagination
export async function GET(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
        }

        const conversationId = params.id;
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);
        const cursor = url.searchParams.get('cursor'); // message ID to paginate before
        const after = url.searchParams.get('after'); // ISO date to get messages after

        // Verify user is a member
        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId: conversationId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Acces refuse' },
                { status: 403 }
            );
        }

        const include = {
            sender: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    publicKey: true,
                },
            },
            attachments: {
                select: {
                    id: true,
                    filename: true,
                    type: true,
                    data: true,
                    storageKey: true,
                },
            },
        };

        // Case 1: Load messages AFTER a certain date (for polling new messages)
        if (after) {
            const messages = await prisma.message.findMany({
                where: {
                    groupId: conversationId,
                    createdAt: { gt: new Date(after) },
                },
                include,
                orderBy: { createdAt: 'asc' },
                take: limit,
            });

            return NextResponse.json({ messages: optimizeAttachments(decryptUserPII(messages)), hasMore: false });
        }

        // Case 2: Load OLDER messages before a cursor (clicking "load older")
        if (cursor) {
            const cursorMessage = await prisma.message.findUnique({
                where: { id: cursor },
                select: { createdAt: true },
            });

            if (!cursorMessage) {
                return NextResponse.json({ messages: [], hasMore: false });
            }

            const messages = await prisma.message.findMany({
                where: {
                    groupId: conversationId,
                    createdAt: { lt: cursorMessage.createdAt },
                },
                include,
                orderBy: { createdAt: 'desc' },
                take: limit,
            });

            // Reverse to get chronological order
            messages.reverse();

            return NextResponse.json({
                messages: optimizeAttachments(decryptUserPII(messages)),
                hasMore: messages.length === limit,
            });
        }

        // Case 3: Initial load - get the MOST RECENT messages
        // Query in desc order to get the latest, then reverse for display
        const messages = await prisma.message.findMany({
            where: { groupId: conversationId },
            include,
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        // Reverse to chronological order (oldest first for display)
        messages.reverse();

        // Check if there are older messages
        const hasMore = messages.length === limit;

        return NextResponse.json({ messages: optimizeAttachments(decryptUserPII(messages)), hasMore });

    } catch (error) {
        console.error('Get messages error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la recuperation des messages' },
            { status: 500 }
        );
    }
}

// POST: Send a new message
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const authError = await authenticate(request);
        if (authError) return authError;

        const user = (request as AuthenticatedRequest).user;
        if (!user) {
            return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
        }

        const conversationId = params.id;
        const body = await request.json();
        const { content, attachments } = body;

        if (!content && (!attachments || attachments.length === 0)) {
            return NextResponse.json(
                { error: 'Contenu du message ou fichiers requis' },
                { status: 400 }
            );
        }

        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId: conversationId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Acces refuse' },
                { status: 403 }
            );
        }

        let attachmentsData = undefined;
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            const processedAttachments = await Promise.all(
                attachments.map(async (att: any) => {
                    let finalData = att.data;
                    let storageKey: string | undefined = undefined;

                    // Upload tout fichier base64 (image, PDF, Word, audio) vers Supabase
                    const base64Match = att.data?.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                    if (base64Match && base64Match.length === 3) {
                        const mimeType = base64Match[1];
                        const buffer = Buffer.from(base64Match[2], 'base64');
                        const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
                        storageKey = `conversations/${conversationId}/${Date.now()}_${safeName}`;

                        const { error: uploadError } = await supabaseAdmin.storage
                            .from(STORAGE_BUCKET)
                            .upload(storageKey, buffer, {
                                contentType: mimeType,
                                upsert: false,
                            });

                        if (!uploadError) {
                            const { data: publicData } = supabaseAdmin.storage
                                .from(STORAGE_BUCKET)
                                .getPublicUrl(storageKey);
                            finalData = publicData.publicUrl;
                        } else {
                            console.error('[Messages] Erreur upload Supabase:', uploadError);
                            storageKey = undefined; // Reset si erreur
                        }
                    }

                    return {
                        filename: att.filename,
                        type: att.type,
                        data: finalData,
                        storageKey,
                    };
                })
            );
            attachmentsData = { create: processedAttachments };
        }

        const message = await prisma.message.create({
            data: {
                content,
                senderId: user.userId,
                groupId: conversationId,
                attachments: attachmentsData,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        publicKey: true,
                    },
                },
                attachments: true,
            },
        });

        await prisma.group.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        try {
            await notifyNewMessage(message, conversationId);
        } catch (notifErr) {
            console.error('[Messages API] Notification error:', notifErr);
        }

        return NextResponse.json({ message: optimizeMsg(decryptUserPII(message)) }, { status: 201 });

    } catch (error) {
        console.error('Send message error:', error);
        return NextResponse.json(
            { error: "Erreur lors de l'envoi du message" },
            { status: 500 }
        );
    }
}
