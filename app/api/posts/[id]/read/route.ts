import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id: postId } = await params;
    if (!postId) return NextResponse.json({ error: "Post requis" }, { status: 400 });

    try {
        const post = await prisma.post.findUnique({ where: { id: postId } });
        if (!post) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });

        await prisma.postRead.upsert({
            where: {
                userId_postId: { userId: user.userId, postId }
            },
            create: { userId: user.userId, postId },
            update: { readAt: new Date() }
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Error marking post read:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
