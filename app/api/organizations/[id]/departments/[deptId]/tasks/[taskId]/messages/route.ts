import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; taskId: string }> }
) {
    // Handled in GET task for simplicity, but if separate endpoint needed:
    // ...
    return NextResponse.json({ message: "Use Task GET endpoint" });
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string; taskId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { taskId } = await params;
        const body = await request.json();
        const { content, attachments } = body;

        if (!content && (!attachments || attachments.length === 0)) {
            return NextResponse.json({ error: 'Contenu requis' }, { status: 400 });
        }

        const message = await prisma.taskMessage.create({
            data: {
                taskId,
                senderId: userId,
                content: content || '',
                attachments: {
                    create: attachments?.map((att: any) => ({
                        taskId,
                        uploaderId: userId,
                        filename: att.filename,
                        url: att.url,
                        fileType: att.fileType,
                        size: att.size
                    }))
                }
            },
            include: {
                sender: {
                    select: { id: true, name: true, avatarUrl: true }
                },
                attachments: true
            }
        });

        return NextResponse.json({ message });
    } catch (error) {
        console.error('Send task message error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
