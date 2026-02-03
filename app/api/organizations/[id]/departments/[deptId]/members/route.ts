import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { encryptMessage } from '@/src/lib/crypto';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
        }

        const userId = payload.userId;
        const { id: orgId, deptId } = await params;
        const body = await request.json();
        const { email } = body;

        if (!email) {
            return NextResponse.json({ error: 'Email requis' }, { status: 400 });
        }

        // Verify user is admin or owner of the organization
        const orgMember = await prisma.organizationMember.findFirst({
            where: {
                userId,
                orgId,
            },
        });

        if (!orgMember || (orgMember.role !== 'ADMIN' && orgMember.role !== 'OWNER')) {
            return NextResponse.json({ error: 'Accès refusé - Droits administrateur requis' }, { status: 403 });
        }

        // Find user by email
        const userToAdd = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                name: true,
                publicKey: true,
            },
        });

        if (!userToAdd) {
            return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
        }

        // Check if user is already a member of the organization
        const existingOrgMember = await prisma.organizationMember.findFirst({
            where: {
                userId: userToAdd.id,
                orgId,
            },
        });

        if (!existingOrgMember) {
            // Automatically add user to organization as a member
            await prisma.organizationMember.create({
                data: {
                    userId: userToAdd.id,
                    orgId,
                    role: 'MEMBER',
                },
            });
        }

        // Get department
        const department = await prisma.department.findUnique({
            where: { id: deptId },
            include: {
                organization: {
                    include: {
                        subscription: true,
                    },
                },
                _count: {
                    select: {
                        members: true,
                    },
                },
            },
        });

        if (!department || department.orgId !== orgId) {
            return NextResponse.json({ error: 'Département non trouvé' }, { status: 404 });
        }

        // Check subscription limits
        if (department.organization.subscription) {
            const maxMembers = department.organization.subscription.maxMembersPerDept;
            if (department._count.members >= maxMembers) {
                return NextResponse.json(
                    { error: `Limite de membres atteinte (${maxMembers})` },
                    { status: 400 }
                );
            }
        }

        // Check if user is already a member of the department
        const existingDeptMember = await prisma.departmentMember.findFirst({
            where: {
                userId: userToAdd.id,
                deptId,
            },
        });

        if (existingDeptMember) {
            return NextResponse.json({ error: 'L\'utilisateur est déjà membre du département' }, { status: 400 });
        }

        // For simplicity, we'll use a placeholder encrypted department key
        // In a real implementation, you would encrypt the department's private key with the user's public key
        const encryptedDeptKey = department.publicKey; // Simplified - should be properly encrypted

        // Add user to department
        await prisma.departmentMember.create({
            data: {
                userId: userToAdd.id,
                deptId,
                encryptedDeptKey,
            },
        });

        // Add user to department conversation if it exists
        const conversation = await prisma.group.findFirst({
            where: {
                deptId,
                isDirect: false,
            },
        });

        if (conversation) {
            await prisma.groupMember.create({
                data: {
                    groupId: conversation.id,
                    userId: userToAdd.id,
                },
            });
        }

        return NextResponse.json(
            { message: 'Membre ajouté avec succès' },
            { status: 201 }
        );
    } catch (error) {
        console.error('Add department member error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
