import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { verifyToken, extractTokenFromHeader } from "@/src/lib/jwt";

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
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                        _count: {
                            select: {
                                followers: true,
                                following: true
                            }
                        }
                    }
                },
                _count: { select: { posts: true } }
            }
        });

        if (!page) {
            return NextResponse.json({ error: "Page non trouvée" }, { status: 404 });
        }

        let isFollowing = false;
        const authHeader = request.headers.get("authorization");
        const token = extractTokenFromHeader(authHeader) || request.cookies.get("auth-token")?.value;
        if (token) {
            const payload = verifyToken(token);
            if (payload) {
                const follow = await prisma.follow.findUnique({
                    where: {
                        followerId_followingId: {
                            followerId: payload.userId,
                            followingId: page.userId
                        }
                    }
                });
                isFollowing = !!follow;
            }
        }

        return NextResponse.json({
            page: {
                ...page,
                isFollowing
            }
        });
    } catch (error) {
        console.error("Error fetching page:", error);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
