import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const createPageSchema = z.object({
    handle: z.string().startsWith("@", "Le nom d'utilisateur doit commencer par @").min(3, "Le nom doit avoir au moins 3 caractères"),
    bio: z.string().optional(),
});

// GET: Get current user's page
export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        const userPage = await prisma.userPage.findUnique({
            where: { userId: user.userId },
            include: {
                posts: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        likes: true,
                        comments: true,
                    }
                }
            }
        });

        return NextResponse.json({ userPage });
    } catch (error) {
        console.error("Error fetching user page:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// POST: Create a new user page
export async function POST(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { handle, bio } = createPageSchema.parse(body);

        const existingPage = await prisma.userPage.findUnique({
            where: { userId: user.userId },
        });

        if (existingPage) {
            return NextResponse.json({ error: "Vous avez déjà une page" }, { status: 400 });
        }

        const existingHandle = await prisma.userPage.findUnique({
            where: { handle },
        });

        if (existingHandle) {
            return NextResponse.json({ error: "Ce nom d'utilisateur est déjà pris" }, { status: 400 });
        }

        const newPage = await prisma.userPage.create({
            data: {
                userId: user.userId,
                handle,
                bio,
            },
        });

        return NextResponse.json({ userPage: newPage }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error creating user page:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// DELETE: Delete user page
export async function DELETE(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    try {
        await prisma.userPage.delete({
            where: { userId: user.userId }
        });

        return NextResponse.json({ message: "Page supprimée" });
    } catch (error) {
        console.error("Error deleting user page:", error);
        return NextResponse.json({ error: "Erreur serveur ou page inexistante" }, { status: 500 });
    }
}
