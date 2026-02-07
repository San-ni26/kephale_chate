import { Metadata } from "next";
import { prisma } from "@/src/lib/prisma";
import InvitationClient from "./InvitationClient";

interface Props {
    params: Promise<{ token: string }>;
}

async function getInvitation(token: string) {
    const invitation = await prisma.userInvitation.findUnique({
        where: { token },
        include: {
            user: {
                select: {
                    name: true,
                    avatarUrl: true,
                }
            },
            _count: {
                select: {
                    guests: true,
                }
            }
        }
    });

    if (!invitation) return null;
    return invitation;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { token } = await params;
    const invitation = await getInvitation(token);

    if (!invitation) {
        return {
            title: "Invitation introuvable",
        };
    }

    return {
        title: invitation.title,
        description: invitation.description || `Invitation de ${invitation.user.name}`,
    };
}

export default async function Page({ params }: Props) {
    const { token } = await params;
    const invitation = await getInvitation(token);

    return <InvitationClient initialInvitation={invitation ? JSON.parse(JSON.stringify(invitation)) : null} />;
}
