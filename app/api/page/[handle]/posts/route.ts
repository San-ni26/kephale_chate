import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ handle: string }> }
) {
    const { handle: rawHandle } = await params;
    let handle = rawHandle;
    try {
        if (rawHandle.includes("%")) {
            handle = decodeURIComponent(rawHandle);
        }
    } catch {
        // garder rawHandle si le decode échoue
    }
    handle = handle.startsWith("@") ? handle : `@${handle}`;

    try {
        const page = await prisma.userPage.findUnique({
            where: { handle },
            select: { id: true }
        });

        if (!page) {
            return NextResponse.json({ error: "Page non trouvée" }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "10");
        const cursor = searchParams.get("cursor");

        const posts = await prisma.post.findMany({
            take: limit,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            where: { pageId: page.id },
            orderBy: { createdAt: "desc" },
            include: {
                page: {
                    select: {
                        handle: true,
                        userId: true,
                        user: {
                            select: {
                                id: true,
                                avatarUrl: true
                            }
                        }
                    }
                },
                likes: { select: { userId: true } },
                comments: {
                    where: { parentId: null },
                    include: {
                        user: { select: { id: true, name: true, avatarUrl: true } },
                        replies: {
                            include: {
                                user: { select: { id: true, name: true, avatarUrl: true } }
                            },
                            orderBy: { createdAt: "asc" as const }
                        }
                    },
                    orderBy: { createdAt: "desc" as const }
                }
            }
        });

        return NextResponse.json({
            posts,
            nextCursor: posts.length === limit ? posts[posts.length - 1].id : undefined
        });
    } catch (error) {
        console.error("Error fetching page posts:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
