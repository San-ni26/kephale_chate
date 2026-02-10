import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";

export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    try {
        const follows = await prisma.follow.findMany({
            where: { followerId: user.userId },
            include: {
                following: {
                    include: {
                        userPage: {
                            include: {
                                user: { select: { avatarUrl: true, name: true } },
                                _count: { select: { posts: true } }
                            }
                        }
                    }
                }
            }
        });

        const readPostIds = await prisma.postRead.findMany({
            where: { userId: user.userId },
            select: { postId: true }
        }).then((r) => r.map((x) => x.postId));

        const pagesWithUnread = await Promise.all(
            follows
                .filter((f) => f.following.userPage)
                .map(async (f) => {
                    const page = f.following.userPage!;
                    const unreadCount = readPostIds.length
                        ? await prisma.post.count({
                              where: {
                                  pageId: page.id,
                                  id: { notIn: readPostIds }
                              }
                          })
                        : await prisma.post.count({ where: { pageId: page.id } });
                    return {
                        pageId: page.id,
                        userId: page.userId,
                        handle: page.handle,
                        avatarUrl: page.user.avatarUrl,
                        name: page.user.name,
                        unreadCount
                    };
                })
        );

        return NextResponse.json({ pages: pagesWithUnread });
    } catch (error) {
        console.error("Error fetching followed pages:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
