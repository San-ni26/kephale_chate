import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { getSubscriptionLimits, calculateSubscriptionEndDate } from '@/src/lib/subscription';
import type { SubscriptionPlan } from '@/src/prisma/client';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
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
        const { id: orgId } = await params;

        // Get organization with user's role
        const organization = await prisma.organization.findUnique({
            where: { id: orgId },
            include: {
                subscription: true,
                _count: {
                    select: {
                        members: true,
                        departments: true,
                        events: true,
                    },
                },
            },
        });

        if (!organization) {
            return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });
        }

        // Get user's role in the organization
        const userMember = await prisma.organizationMember.findFirst({
            where: {
                userId,
                orgId,
            },
            select: {
                role: true,
            },
        });

        if (!userMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        return NextResponse.json(
            {
                organization,
                userRole: userMember.role,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Get organization error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// PATCH: Modifier l'organisation (name, logo, address) ou changer l'abonnement — owner only
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId } = await params;
        const body = await request.json();

        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            include: { subscription: true },
        });
        if (!org) return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });
        if (org.ownerId !== userId) return NextResponse.json({ error: 'Réservé au propriétaire' }, { status: 403 });

        const orgData: { name?: string; logo?: string | null; address?: string | null } = {};
        if (body.name !== undefined) orgData.name = String(body.name).trim() || org.name;
        if (body.logo !== undefined) orgData.logo = body.logo === '' ? null : body.logo;
        if (body.address !== undefined) orgData.address = body.address === '' ? null : body.address;

        if (Object.keys(orgData).length > 0) {
            await prisma.organization.update({
                where: { id: orgId },
                data: orgData,
            });
        }

        if (body.plan !== undefined && ['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'].includes(body.plan)) {
            const plan = body.plan as SubscriptionPlan;
            const limits = getSubscriptionLimits(plan);
            const startDate = new Date();
            const endDate = calculateSubscriptionEndDate(startDate, plan); // 1 mois pour tous les plans

            if (org.subscription) {
                await prisma.subscription.update({
                    where: { orgId },
                    data: {
                        plan,
                        startDate,
                        endDate,
                        maxDepartments: limits.maxDepartments,
                        maxMembersPerDept: limits.maxMembersPerDept,
                    },
                });
            } else {
                await prisma.subscription.create({
                    data: {
                        orgId,
                        plan,
                        startDate,
                        endDate,
                        maxDepartments: limits.maxDepartments,
                        maxMembersPerDept: limits.maxMembersPerDept,
                    },
                });
            }
        }

        const updated = await prisma.organization.findUnique({
            where: { id: orgId },
            include: { subscription: true, _count: { select: { members: true, departments: true, events: true } } },
        });
        return NextResponse.json({ organization: updated });
    } catch (error) {
        console.error('PATCH organization error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

// DELETE: Supprimer l'organisation — owner only
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId } = await params;

        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        if (!org) return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });
        if (org.ownerId !== userId) return NextResponse.json({ error: 'Réservé au propriétaire' }, { status: 403 });

        await prisma.organization.delete({ where: { id: orgId } });
        return NextResponse.json({ message: 'Organisation supprimée' });
    } catch (error) {
        console.error('DELETE organization error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
