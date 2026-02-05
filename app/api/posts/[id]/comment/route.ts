import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const commentSchema = z.object({
    content: z.string().min(1, "Le commentaire ne peut pas être vide"),
    parentId: z.string().nullable().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    try {
        const body = await request.json();
        const { content, parentId } = commentSchema.parse(body);

        // Verify parent comment exists if parentId is provided
        if (parentId) {
            const parentComment = await prisma.comment.findUnique({
                where: { id: parentId }
            });
            if (!parentComment) {
                return NextResponse.json({ error: "Commentaire parent introuvable" }, { status: 404 });
            }
        }

        const comment = await prisma.comment.create({
            data: {
                postId: id,
                userId: user.userId,
                content,
                parentId
            },
            include: {
                user: {
                    select: {
                        name: true,
                        id: true,
                        avatarUrl: true
                    }
                }
            }
        });

        return NextResponse.json({ comment }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error creating comment:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
