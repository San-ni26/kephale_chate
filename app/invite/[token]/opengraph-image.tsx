import { ImageResponse } from "next/og";
import { prisma } from "@/src/lib/prisma";

export const runtime = "nodejs";

export const size = {
    width: 1200,
    height: 630,
};

export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const invitation = await prisma.userInvitation.findUnique({
        where: { token },
        select: {
            title: true,
            description: true,
            imageBase64: true,
            date: true,
            location: true,
            user: {
                select: {
                    name: true,
                    avatarUrl: true,
                },
            },
        },
    });

    if (!invitation) {
        return new ImageResponse(
            (
                <div
                    style={{
                        fontSize: 48,
                        background: "white",
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    Invitation introuvable
                </div>
            ),
            {
                ...size,
            }
        );
    }

    // If invitation has a custom image, use it (if it's a URL or handle base64 if possible)
    // Note: ImageResponse might not support Base64 images directly as `src` nicely if too large, but standard <img> tag supports it.
    // However, if `imageBase64` is huge, it might be an issue. But let's try.
    // Or render a nice card design.

    return new ImageResponse(
        (
            <div
                style={{
                    background: "#f8f9fa",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "sans-serif",
                }}
            >
                {invitation.imageBase64 ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={invitation.imageBase64}
                        alt="Invitation"
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                        }}
                    />
                ) : (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "40px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "20px",
                            background: "white",
                            boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
                            width: "90%",
                            height: "80%",
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`https://api.dicebear.com/7.x/initials/png?seed=${invitation.user.name}`}
                                width="80"
                                height="80"
                                style={{ borderRadius: '50%', marginRight: '20px' }}
                            />
                            <div style={{ fontSize: 24, color: "#64748b" }}>
                                {invitation.user.name} vous invite
                            </div>
                        </div>

                        <div
                            style={{
                                fontSize: 60,
                                fontWeight: "bold",
                                color: "#0f172a",
                                textAlign: "center",
                                marginBottom: "20px",
                            }}
                        >
                            {invitation.title}
                        </div>

                        <div
                            style={{
                                fontSize: 30,
                                color: "#334155",
                                textAlign: "center",
                                display: 'flex',
                                gap: '30px'
                            }}
                        >
                            <div>📅 {new Date(invitation.date).toLocaleDateString("fr-FR")}</div>
                            <div>📍 {invitation.location}</div>
                        </div>
                    </div>
                )}
            </div>
        ),
        {
            ...size,
        }
    );
}
