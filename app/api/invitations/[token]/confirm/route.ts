import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        const body = await req.json();
        const { name, phone } = body;

        if (!name || !phone) {
            return NextResponse.json(
                { error: "Name and phone are required" },
                { status: 400 }
            );
        }

        const invitation = await prisma.userInvitation.findUnique({
            where: { token },
            include: {
                _count: {
                    select: { guests: true }
                }
            }
        });

        if (!invitation || invitation.status !== "ACTIVE") {
            return NextResponse.json(
                { error: "Invalid or expired invitation" },
                { status: 404 }
            );
        }

        if (invitation.maxGuests && invitation._count.guests >= invitation.maxGuests) {
            return NextResponse.json(
                { error: "Invitation limit reached" },
                { status: 403 }
            );
        }

        const guest = await prisma.invitationGuest.create({
            data: {
                invitationId: invitation.id,
                name,
                phone,
            },
        });

        return NextResponse.json({ guest });
    } catch (error) {
        console.error("Error confirming attendance:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
