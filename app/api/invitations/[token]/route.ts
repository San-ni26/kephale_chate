import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        const invitation = await prisma.userInvitation.findUnique({
            where: {
                token,
            },
            include: {
                user: {
                    select: {
                        name: true,
                        avatarUrl: true,
                    },
                },
                _count: {
                    select: {
                        guests: true,
                    },
                },
            },
        });

        if (!invitation || invitation.status !== "ACTIVE") {
            return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
        }

        return NextResponse.json({ invitation });
    } catch (error) {
        console.error("Error fetching invitation:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
