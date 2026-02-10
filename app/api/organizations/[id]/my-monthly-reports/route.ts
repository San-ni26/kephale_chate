import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

function isMonthClosed(monthStr: string): boolean {
    const [y, m] = monthStr.split('-').map(Number);
    const firstDayNextMonth = new Date(y, m, 1);
    const now = new Date();
    return now >= firstDayNextMonth;
}

/**
 * GET ?month=yyyy-MM
 * Pour un membre : retourne ses rapports du mois pour chaque département dont il fait partie.
 */
export async function GET(
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
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month');

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ error: 'Paramètre month requis (yyyy-MM)' }, { status: 400 });
        }

        const membership = await prisma.organizationMember.findFirst({
            where: { userId, orgId },
        });
        if (!membership) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const deptMembers = await prisma.departmentMember.findMany({
            where: {
                userId,
                department: { orgId },
            },
            include: {
                department: {
                    select: { id: true, name: true },
                },
            },
        });

        const deptIds = deptMembers.map((d) => d.department.id);
        const reports = await prisma.departmentMonthlyReport.findMany({
            where: {
                deptId: { in: deptIds },
                userId,
                month,
            },
        });
        const reportByDept = new Map(reports.map((r) => [r.deptId, r]));
        const closed = isMonthClosed(month);

        const list = deptMembers.map((dm) => {
            const report = reportByDept.get(dm.department.id);
            return {
                deptId: dm.department.id,
                departmentName: dm.department.name,
                content: report?.content ?? '',
                canEdit: !closed,
                updatedAt: report?.updatedAt ?? null,
            };
        });

        return NextResponse.json({ month, reports: list });
    } catch (error) {
        console.error('GET my-monthly-reports error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
