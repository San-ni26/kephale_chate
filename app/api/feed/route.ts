import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";

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

export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get("limit") || "15", 10), 30);
        const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

        const followed = await prisma.follow.findMany({
            where: { followerId: user.userId },
            select: { followingId: true }
        });
        const followedIds = followed.map((f) => f.followingId);

        const pagesFollowed = await prisma.userPage.findMany({
            where: { userId: { in: followedIds } },
            select: { id: true }
        });
        const followedPageIds = pagesFollowed.map((p) => p.id);

        const readPostIds = await prisma.postRead.findMany({
            where: { userId: user.userId },
            select: { postId: true }
        }).then((r) => r.map((x) => x.postId));

        const result: Awaited<ReturnType<typeof prisma.post.findMany>> = [];

        // 1) Nouveaux posts des pages suivies (non lus)
        if (followedPageIds.length > 0 && readPostIds.length < 1000) {
            const newFromFollowed = await prisma.post.findMany({
                take: 30,
                where: {
                    pageId: { in: followedPageIds },
                    id: readPostIds.length ? { notIn: readPostIds } : undefined
                },
                orderBy: { createdAt: "desc" },
                include: postInclude
            });
            result.push(...newFromFollowed);
        }

        const existingIds = result.map((p) => p.id);

        // 2) Suggestions: pages que l'utilisateur ne suit pas
        const suggested = await prisma.post.findMany({
            take: 8,
            where: {
                pageId: followedPageIds.length ? { notIn: followedPageIds } : undefined,
                id: existingIds.length ? { notIn: existingIds } : undefined
            },
            orderBy: { createdAt: "desc" },
            include: postInclude
        });
        result.push(...suggested);
        existingIds.push(...suggested.map((p) => p.id));

        // 3) Anciens posts des pages suivies
        const olderFromFollowed = await prisma.post.findMany({
            take: 40,
            where: {
                pageId: { in: followedPageIds },
                id: { notIn: existingIds }
            },
            orderBy: { createdAt: "desc" },
            include: postInclude
        });
        result.push(...olderFromFollowed);
        existingIds.push(...olderFromFollowed.map((p) => p.id));

        // 4) Autres posts (découverte)
        const others = await prisma.post.findMany({
            take: 30,
            where: { id: { notIn: existingIds } },
            orderBy: { createdAt: "desc" },
            include: postInclude
        });
        result.push(...others);

        const sliced = result.slice(offset, offset + limit);

        const postsWithFollowStatus = await Promise.all(
            // Cast en any pour inclure correctement les relations (page, likes, comments)
            sliced.map(async (post: any) => {
                let isFollowing = false;
                if (post.page.userId !== user.userId) {
                    const follow = await prisma.follow.findUnique({
                        where: {
                            followerId_followingId: {
                                followerId: user.userId,
                                followingId: post.page.userId
                            }
                        }
                    });
                    isFollowing = !!follow;
                }
                const read = await prisma.postRead.findUnique({
                    where: { userId_postId: { userId: user.userId, postId: post.id } }
                });
                return {
                    ...post,
                    isFollowing,
                    isRead: !!read
                };
            })
        );

        const nextOffset = offset + limit < result.length ? offset + limit : undefined;

        return NextResponse.json({
            posts: postsWithFollowStatus,
            nextCursor: nextOffset !== undefined ? String(nextOffset) : undefined
        });
    } catch (err) {
        console.error("Error fetching feed:", err);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
