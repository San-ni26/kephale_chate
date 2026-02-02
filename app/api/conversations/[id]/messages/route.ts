import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { authenticate, AuthenticatedRequest } from '@/src/middleware/auth';
import { saveFile } from '@/src/lib/storage';

// GET: Get all messages for a conversation
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
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const conversationId = params.id;

        // Verify user is a member
        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId: conversationId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        // Get messages
        const messages = await prisma.message.findMany({
            where: { groupId: conversationId },
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
            orderBy: { createdAt: 'asc' },
        });

        return NextResponse.json({ messages }, { status: 200 });

    } catch (error) {
        console.error('Get messages error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des messages' },
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
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const conversationId = params.id;
        const body = await request.json();
        const { content, attachments } = body;

        if (!content) {
            return NextResponse.json(
                { error: 'Contenu du message requis' },
                { status: 400 }
            );
        }

        // Verify user is a member
        const membership = await prisma.groupMember.findFirst({
            where: {
                groupId: conversationId,
                userId: user.userId,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: 'Accès refusé' },
                { status: 403 }
            );
        }

        // Prepare attachments if any
        let attachmentsData = undefined;
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            const processedAttachments = await Promise.all(attachments.map(async (att: any) => {
                // Attachment data comes as base64 string from client (for HTTP transport)
                // Convert base64 to Buffer for file storage
                const base64Data = att.data;
                const fileBuffer = Buffer.from(base64Data, 'base64');

                // Save file directly (no encryption) with UUID name
                const filePath = await saveFile(
                    fileBuffer,
                    att.filename,
                    att.type as 'IMAGE' | 'PDF' | 'WORD' | 'AUDIO'
                );

                return {
                    filename: att.filename,
                    type: att.type,
                    data: filePath // Store path instead of raw data
                };
            }));

            attachmentsData = {
                create: processedAttachments
            };
        }

        // Create message
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

        // Update conversation timestamp
        await prisma.group.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        return NextResponse.json({ message }, { status: 201 });

    } catch (error) {
        console.error('Send message error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de l\'envoi du message' },
            { status: 500 }
        );
    }
}
