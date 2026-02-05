import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { z } from "zod";

const createPostSchema = z.object({
    type: z.enum(["TWEET", "CONTENT"]),
    content: z.string().min(1, "Le contenu ne peut pas être vide"),
    imageUrl: z.string().optional(),
    caption: z.string().optional(),
    reference: z.string().optional(),
});

// GET: Feed (Fetch all posts)
export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "10");
        const cursor = searchParams.get("cursor");
        const pageId = searchParams.get("pageId");

        const where = pageId ? { pageId } : {};

        const posts = await prisma.post.findMany({
            take: limit,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                page: {
                    include: {
                        user: {
                            select: {
                                avatarUrl: true
                            }
                        }
                    }
                },
                likes: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                comments: {
                    where: {
                        parentId: null // Fetch only top-level comments
                    },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                avatarUrl: true
                            }
                        },
                        replies: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        avatarUrl: true
                                    }
                                }
                            },
                            orderBy: {
                                createdAt: 'asc'
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        });

        // Enhance posts with isFollowing info
        const user = (request as AuthenticatedRequest).user;
        const postsWithFollowStatus = await Promise.all(posts.map(async (post) => {
            let isFollowing = false;
            if (user && post.page.userId !== user.userId) {
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
            return { ...post, isFollowing };
        }));

        return NextResponse.json({
            posts: postsWithFollowStatus,
            nextCursor: posts.length === limit ? posts[posts.length - 1].id : undefined
        });
    } catch (err) {
        console.error("Error fetching posts:", err);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}

// POST: Create a post
export async function POST(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const data = createPostSchema.parse(body);

        const userPage = await prisma.userPage.findUnique({
            where: { userId: user.userId }
        });

        if (!userPage) {
            return NextResponse.json({ error: "Vous devez d'abord créer une page" }, { status: 400 });
        }

        const post = await prisma.post.create({
            data: {
                pageId: userPage.id,
                type: data.type,
                content: data.content,
                imageUrl: data.imageUrl,
                caption: data.caption,
                reference: data.reference,
            }
        });

        return NextResponse.json({ post }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error("Error creating post:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
