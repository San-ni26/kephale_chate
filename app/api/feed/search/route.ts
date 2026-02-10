import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";

export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    if (!q || q.length < 2) {
        return NextResponse.json({ pages: [], posts: [] });
    }

    const handleLike = `%${q}%`;
    const contentLike = `%${q}%`;

    try {
        const [pages, posts] = await Promise.all([
            prisma.userPage.findMany({
                where: {
                    OR: [
                        { handle: { contains: q, mode: "insensitive" } },
                        { bio: { contains: handleLike, mode: "insensitive" } }
                    ]
                },
                take: 15,
                include: {
                    user: { select: { avatarUrl: true, name: true } },
                    _count: { select: { posts: true } }
                }
            }),
            prisma.post.findMany({
                where: {
                    OR: [
                        { content: { contains: contentLike, mode: "insensitive" } },
                        { caption: { contains: contentLike, mode: "insensitive" } }
                    ]
                },
                take: 20,
                orderBy: { createdAt: "desc" },
                include: {
                    page: {
                        include: {
                            user: { select: { avatarUrl: true, name: true } }
                        }
                    },
                    likes: { select: { userId: true } },
                    _count: { select: { comments: true } }
                }
            })
        ]);

        const followingIds = await prisma.follow.findMany({
            where: { followerId: user.userId },
            select: { followingId: true }
        }).then((r) => r.map((x) => x.followingId));

        const pagesWithFollow = pages.map((p) => ({
            ...p,
            isFollowing: followingIds.includes(p.userId)
        }));

        const postsWithFollow = posts.map((p) => ({
            ...p,
            isFollowing: followingIds.includes(p.page.userId),
            likes: p.likes,
            comments: []
        }));

        return NextResponse.json({
            pages: pagesWithFollow,
            posts: postsWithFollow
        });
    } catch (error) {
        console.error("Feed search error:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
