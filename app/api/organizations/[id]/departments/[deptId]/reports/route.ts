import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

function isMonthClosed(monthStr: string): boolean {
    const [y, m] = monthStr.split('-').map(Number);
    const firstDayNextMonth = new Date(y, m, 1); // 1er jour du mois suivant (m est 1-based dans la chaîne "yyyy-MM")
    const now = new Date();
    return now >= firstDayNextMonth;
}

/**
 * GET ?month=yyyy-MM → rapport(s) du mois
 *    - Membre: retourne son rapport + canEdit (true si mois pas encore clos)
 *    - Owner/Admin: retourne tous les rapports du département + liste des membres sans rapport
 * GET ?listMonths=1 → liste des mois ayant au moins un rapport (owner/admin uniquement)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId, deptId } = await params;
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month');
        const listMonths = searchParams.get('listMonths') === '1';

        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
            select: { role: true },
        });
        const deptMember = await prisma.departmentMember.findFirst({
            where: { userId, deptId },
        });
        const isOrgAdmin = orgMember && (orgMember.role === 'OWNER' || orgMember.role === 'ADMIN');

        if (!deptMember && !isOrgAdmin) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const department = await prisma.department.findUnique({
            where: { id: deptId },
            select: { orgId: true },
        });
        if (!department || department.orgId !== orgId) {
            return NextResponse.json({ error: 'Département non trouvé' }, { status: 404 });
        }

        if (listMonths) {
            if (!isOrgAdmin) {
                return NextResponse.json({ error: 'Réservé au propriétaire ou aux admins' }, { status: 403 });
            }
            const reports = await prisma.departmentMonthlyReport.findMany({
                where: { deptId },
                select: { month: true },
                distinct: ['month'],
                orderBy: { month: 'desc' },
            });
            let months = reports.map((r) => r.month);
            const currentMonth = new Date().toISOString().slice(0, 7);
            if (months.length === 0 || !months.includes(currentMonth)) {
                months = [currentMonth, ...months.filter((m) => m !== currentMonth)].sort((a, b) => b.localeCompare(a));
            }
            return NextResponse.json({ months });
        }

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ error: 'Paramètre month requis (yyyy-MM)' }, { status: 400 });
        }

        const closed = isMonthClosed(month);

        if (isOrgAdmin) {
            const [reports, members] = await Promise.all([
                prisma.departmentMonthlyReport.findMany({
                    where: { deptId, month },
                    include: {
                        user: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                }),
                prisma.departmentMember.findMany({
                    where: { deptId },
                    include: {
                        user: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                }),
            ]);
            const reportedUserIds = new Set(reports.map((r) => r.userId));
            const membersWithoutReport = members
                .filter((m) => !reportedUserIds.has(m.user.id))
                .map((m) => ({
                    id: m.user.id,
                    name: m.user.name,
                    email: m.user.email,
                }));
            return NextResponse.json({
                reports: reports.map((r) => ({
                    userId: r.user.id,
                    userName: r.user.name,
                    userEmail: r.user.email,
                    content: r.content,
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt,
                })),
                membersWithoutReport,
                canEdit: !closed,
            });
        }

        const report = await prisma.departmentMonthlyReport.findUnique({
            where: {
                deptId_userId_month: { deptId, userId, month },
            },
        });
        return NextResponse.json({
            report: report
                ? { content: report.content, createdAt: report.createdAt, updatedAt: report.updatedAt }
                : null,
            canEdit: !closed,
        });
    } catch (error) {
        console.error('GET reports error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/**
 * PUT ?month=yyyy-MM body { content }
 * Créer ou mettre à jour le rapport du membre pour le mois. Interdit si le mois est clos.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; deptId: string }> }
) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId;
        const { id: orgId, deptId } = await params;
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month');

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ error: 'Paramètre month requis (yyyy-MM)' }, { status: 400 });
        }
        if (isMonthClosed(month)) {
            return NextResponse.json(
                { error: 'Le mois est terminé, vous ne pouvez plus modifier ce rapport' },
                { status: 403 }
            );
        }

        const deptMember = await prisma.departmentMember.findFirst({
            where: { userId, deptId },
        });
        if (!deptMember) {
            return NextResponse.json({ error: 'Vous n\'êtes pas membre de ce département' }, { status: 403 });
        }

        const body = await request.json();
        const content = typeof body.content === 'string' ? body.content : '';

        const report = await prisma.departmentMonthlyReport.upsert({
            where: {
                deptId_userId_month: { deptId, userId, month },
            },
            create: { deptId, userId, month, content },
            update: { content },
        });

        return NextResponse.json({ report: { content: report.content, createdAt: report.createdAt, updatedAt: report.updatedAt } });
    } catch (error) {
        console.error('PUT report error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
