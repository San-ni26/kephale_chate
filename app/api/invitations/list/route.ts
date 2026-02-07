import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";

export async function GET(req: NextRequest) {
    try {
        const authError = await authenticate(req);
        if (authError) return authError;
        const user = (req as AuthenticatedRequest).user;

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const invitations = await prisma.userInvitation.findMany({
            where: {
                userId: user.userId,
            },
            include: {
                guests: true,
                _count: {
                    select: {
                        guests: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json({ invitations });
    } catch (error) {
        console.error("Error listing invitations:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
