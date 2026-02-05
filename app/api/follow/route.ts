import { NextResponse } from "next/server";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { prisma } from "@/src/lib/prisma";

export async function POST(req: Request) {
    const authError = await authenticate(req as any);
    if (authError) return authError;

    const user = (req as AuthenticatedRequest).user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { targetUserId } = await req.json();
    if (!targetUserId) return NextResponse.json({ error: "Target ID required" }, { status: 400 });

    if (user.userId === targetUserId) {
        return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }

    try {
        const existingFollow = await prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: user.userId,
                    followingId: targetUserId
                }
            }
        });

        if (existingFollow) {
            // Unfollow
            await prisma.follow.delete({
                where: { id: existingFollow.id }
            });
            return NextResponse.json({ isFollowing: false });
        } else {
            // Follow
            await prisma.follow.create({
                data: {
                    followerId: user.userId,
                    followingId: targetUserId
                }
            });
            // Create notification for target user
            await prisma.notification.create({
                data: {
                    userId: targetUserId,
                    content: `${user.name || "Un utilisateur"} vous suit désormais.`
                }
            });
            return NextResponse.json({ isFollowing: true });
        }
    } catch (error) {
        console.error("Follow error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
