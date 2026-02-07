import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const authError = await authenticate(req);
    if (authError) return authError;
    const user = (req as AuthenticatedRequest).user;

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { token } = await params;

        // Check if invitation exists and belongs to user
        const existingInvitation = await prisma.userInvitation.findFirst({
            where: {
                token,
                userId: user.userId
            }
        });

        if (!existingInvitation) {
            return NextResponse.json(
                { error: "Invitation introuvable ou vous n'avez pas les droits." },
                { status: 404 }
            );
        }

        await prisma.userInvitation.delete({
            where: { id: existingInvitation.id }
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Error deleting invitation:", error);
        return NextResponse.json(
            { error: error?.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
