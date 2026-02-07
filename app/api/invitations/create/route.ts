import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";
import { nanoid } from "nanoid";
import { sendInvoiceEmail } from "@/src/lib/email";

export async function POST(req: NextRequest) {
    try {
        const authError = await authenticate(req);
        if (authError) return authError;
        const user = (req as AuthenticatedRequest).user;

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Mock payment verification here
        const token = nanoid(10); // Generate a short unique token

        // Get data from request body
        const body = await req.json();
        const { title, description, imageBase64, type, date, location, maxGuests } = body;

        if (!title || !date || !location) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }


        const invitation = await prisma.userInvitation.create({
            data: {
                userId: user.userId,
                token,
                status: "ACTIVE",
                title,
                description,
                imageBase64,
                type: type || "OTHER",
                date: new Date(date),
                location,
                maxGuests: maxGuests ? parseInt(maxGuests) : null,
            },
        });

        // Send Invoice Email
        try {
            const transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const totalAmount = (body.totalAmount) || 2500;
            const paymentMethod = (body.paymentMethod) || "Mobile Money";

            await sendInvoiceEmail(user.email, user.name || "Utilisateur", {
                title,
                type: type || "OTHER",
                date: new Date(date),
                guests: maxGuests ? parseInt(maxGuests) : 0,
                amount: totalAmount,
                paymentMethod,
                transactionId
            });
        } catch (emailError) {
            console.error("Failed to send invoice email", emailError);
        }

        return NextResponse.json({ invitation });
    } catch (error: any) {
        console.error("Error creating invitation:", error);
        return NextResponse.json(
            { error: error?.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
