import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { id } = await params;

    try {
        // Toggle like
        const existingLike = await prisma.like.findUnique({
            where: {
                postId_userId: {
                    postId: id,
                    userId: user.userId
                }
            }
        });

        if (existingLike) {
            await prisma.like.delete({
                where: { id: existingLike.id }
            });
            return NextResponse.json({ liked: false });
        } else {
            await prisma.like.create({
                data: {
                    postId: id,
                    userId: user.userId
                }
            });
            return NextResponse.json({ liked: true });
        }
    } catch (error) {
        console.error("Error toggling like:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
