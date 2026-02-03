import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
        }

        const userId = payload.userId;
        const { id: orgId, deptId } = await params;

        // Verify user is member of the department
        const deptMember = await prisma.departmentMember.findFirst({
            where: {
                userId,
                deptId,
            },
        });

        if (!deptMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Get or create the department conversation (Group)
        let conversation = await prisma.group.findFirst({
            where: {
                deptId,
                isDirect: false,
            },
        });

        if (!conversation) {
            // Create conversation for the department
            conversation = await prisma.group.create({
                data: {
                    deptId,
                    isDirect: false,
                    name: `Conversation du département`,
                },
            });

            // Add all department members to the conversation
            const deptMembers = await prisma.departmentMember.findMany({
                where: { deptId },
                select: { userId: true },
            });

            await prisma.groupMember.createMany({
                data: deptMembers.map(m => ({
                    groupId: conversation!.id,
                    userId: m.userId,
                })),
                skipDuplicates: true,
            });
        }

        // Get messages
        const messages = await prisma.message.findMany({
            where: {
                groupId: conversation.id,
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
                attachments: {
                    select: {
                        id: true,
                        filename: true,
                        type: true,
                        data: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        return NextResponse.json({ messages });
    } catch (error) {
        console.error('Get department messages error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
        }

        const userId = payload.userId;
        const { id: orgId, deptId } = await params;
        const body = await request.json();
        const { content, attachments } = body;

        // Verify user is member of the department
        const deptMember = await prisma.departmentMember.findFirst({
            where: {
                userId,
                deptId,
            },
        });

        if (!deptMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // Get or create the department conversation
        let conversation = await prisma.group.findFirst({
            where: {
                deptId,
                isDirect: false,
            },
        });

        if (!conversation) {
            conversation = await prisma.group.create({
                data: {
                    deptId,
                    isDirect: false,
                    name: `Conversation du département`,
                },
            });

            // Add all department members to the conversation
            const deptMembers = await prisma.departmentMember.findMany({
                where: { deptId },
                select: { userId: true },
            });

            await prisma.groupMember.createMany({
                data: deptMembers.map(m => ({
                    groupId: conversation!.id,
                    userId: m.userId,
                })),
                skipDuplicates: true,
            });
        }

        // Create message
        const message = await prisma.message.create({
            data: {
                content: content || '',
                senderId: userId,
                groupId: conversation.id,
                attachments: attachments
                    ? {
                        create: attachments.map((att: any) => ({
                            filename: att.filename,
                            type: att.type,
                            data: att.data,
                        })),
                    }
                    : undefined,
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
                attachments: {
                    select: {
                        id: true,
                        filename: true,
                        type: true,
                        data: true,
                    },
                },
            },
        });

        return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
        console.error('Send department message error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
