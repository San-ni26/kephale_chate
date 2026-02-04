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
