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

        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true },
        });
        const deptAuth = await prisma.department.findUnique({
            where: { id: deptId },
            select: { headId: true, orgId: true },
        });
        const isOrgOwnerOrAdmin = orgMember && (orgMember.role === 'OWNER' || orgMember.role === 'ADMIN');
        const isDeptHead = deptAuth?.headId === userId;

        if (!isOrgOwnerOrAdmin && !isDeptHead) {
            return NextResponse.json({ error: 'Accès refusé - Droits requis' }, { status: 403 });
        }
        if (!deptAuth || deptAuth.orgId !== orgId) {
            return NextResponse.json({ error: 'Département non trouvé' }, { status: 404 });
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

        const departmentWithSub = await prisma.department.findUnique({
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
        if (!departmentWithSub || departmentWithSub.orgId !== orgId) {
            return NextResponse.json({ error: 'Département non trouvé' }, { status: 404 });
        }

        // Check subscription limits
        if (departmentWithSub.organization.subscription) {
            const sub = departmentWithSub.organization.subscription;
            if (sub.endDate && new Date() > new Date(sub.endDate)) {
                return NextResponse.json(
                    { error: 'Abonnement expiré. Mettez à jour votre abonnement dans Paramètres pour ajouter des membres.' },
                    { status: 403 }
                );
            }
            const maxMembers = sub.maxMembersPerDept;
            if (departmentWithSub._count.members >= maxMembers) {
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

        // Récupérer la clé privée du département depuis un membre existant (nécessaire pour déchiffrer les messages)
        const existingMemberWithKey = await prisma.departmentMember.findFirst({
            where: { deptId },
            select: { encryptedDeptKey: true },
        });
        const encryptedDeptKey = existingMemberWithKey?.encryptedDeptKey ?? departmentWithSub.publicKey;

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
