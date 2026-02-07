import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { sendInvoiceEmail } from "@/src/lib/email";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const authError = await authenticate(req);
    if (authError) return authError;
    const user = (req as AuthenticatedRequest).user;

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { token } = await params;
        const body = await req.json();
        const {
            title,
            description,
            imageBase64,
            type,
            date,
            location,
            maxGuests,
            paymentMethod,
            totalAmount
        } = body;

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

        // Calculate potential extra cost if maxGuests increased significantly (Basic logic for now)
        // In a real app, we would check if (newMaxGuests > oldMaxGuests) and charge the diff.
        // For this task, we assume the client handles the payment flow and passes the totalAmount if charged.

        const updatedInvitation = await prisma.userInvitation.update({
            where: { id: existingInvitation.id },
            data: {
                title,
                description,
                imageBase64: imageBase64 || existingInvitation.imageBase64, // Keep old image if not provided
                type,
                date: new Date(date),
                location,
                maxGuests: maxGuests ? parseInt(maxGuests) : null,
            },
        });

        // Send Invoice if there was a payment involved (amount > 0)
        if (totalAmount && totalAmount > 0) {
            const transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            // We ignore await here to not block response
            sendInvoiceEmail(user.email, user.name || "Utilisateur", {
                title: title || existingInvitation.title,
                type: type || existingInvitation.type || "EVENT",
                date: new Date(date),
                guests: maxGuests ? parseInt(maxGuests) : 0,
                amount: totalAmount,
                paymentMethod: paymentMethod || "Mobile Money",
                transactionId
            }).catch(console.error);
        }

        return NextResponse.json({ invitation: updatedInvitation });

    } catch (error: any) {
        console.error("Error updating invitation:", error);
        return NextResponse.json(
            { error: error?.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
