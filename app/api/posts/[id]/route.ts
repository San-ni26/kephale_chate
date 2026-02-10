import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const updatePostSchema = z.object({
    content: z.string().min(1, "Le contenu ne peut pas être vide").optional(),
    imageUrl: z.string().optional(),
    caption: z.string().optional(),
    reference: z.string().optional(),
});

const postInclude = {
    page: {
        include: {
            user: { select: { avatarUrl: true, name: true } }
        }
    },
    likes: { include: { user: { select: { id: true, name: true } } } },
    comments: {
        where: { parentId: null },
        include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
            replies: {
                include: { user: { select: { id: true, name: true, avatarUrl: true } } },
                orderBy: { createdAt: "asc" as const }
            }
        },
        orderBy: { createdAt: "desc" as const }
    }
} as const;

// GET: Fetch single post (for feed/search detail)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { id } = await params;
    try {
        const post = await prisma.post.findUnique({
            where: { id },
            include: postInclude
        });
        if (!post) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });

        const follow = await prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: user.userId,
                    followingId: post.page.userId
                }
            }
        });
        const read = await prisma.postRead.findUnique({
            where: { userId_postId: { userId: user.userId, postId: post.id } }
        });

        return NextResponse.json({
            post: {
                ...post,
                isFollowing: !!follow,
                isRead: !!read
            }
        });
    } catch (error) {
        console.error("Error fetching post:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// DELETE: Delete a post
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;


    try {
        const post = await prisma.post.findUnique({
            where: { id },
            include: { page: true }
        });

        if (!post) {
            return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
        }

        // Verify ownership
        if (post.page.userId !== user.userId) {
            return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
        }

        await prisma.post.delete({
            where: { id }
        });

        return NextResponse.json({ message: "Post supprimé" });
    } catch (error) {
        console.error("Error deleting post:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// PATCH: Update a post
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;


    try {
        const body = await request.json();
        const data = updatePostSchema.parse(body);

        const post = await prisma.post.findUnique({
            where: { id },
            include: { page: true }
        });

        if (!post) {
            return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
        }

        // Verify ownership
        if (post.page.userId !== user.userId) {
            return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
        }

        const updatedPost = await prisma.post.update({
            where: { id },
            data: {
                content: data.content,
                imageUrl: data.imageUrl,
                caption: data.caption,
                reference: data.reference,
            }
        });

        return NextResponse.json({ post: updatedPost });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error updating post:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
