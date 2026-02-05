import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';

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

        // Parse query params for filters (optional)
        const url = new URL(request.url);
        const status = url.searchParams.get('status'); // e.g., 'PENDING', 'COMPLETED'
        const month = url.searchParams.get('month'); // e.g., '2023-10'

        // Verify user is member of organization
        const orgMember = await prisma.organizationMember.findFirst({
            where: { userId, orgId }
        });

        if (!orgMember) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        const where: any = {
            assigneeId: userId,
            department: {
                orgId: orgId
            }
        };

        if (status && status !== 'ALL') {
            where.status = status;
        }

        if (month) {
            // Filter by dueDate in that month? Or createdAt?
            // "voir les tache par mois fini ou pas" -> likely tasks relevant to that month.
            // Let's filter by valid date range (createdAt or dueDate).
            // Simplest: dueDate in that month.
            const date = new Date(month);
            const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
            const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

            where.dueDate = {
                gte: startOfMonth,
                lte: endOfMonth
            };
        }

        const tasks = await prisma.task.findMany({
            where,
            include: {
                department: {
                    select: { id: true, name: true }
                },
                assignee: {
                    select: { name: true, avatarUrl: true }
                },
                creator: { // needed? maybe
                    select: { name: true }
                }
            },
            orderBy: {
                dueDate: 'asc' // Priority by due date
            }
        });

        return NextResponse.json({ tasks });
    } catch (error) {
        console.error('Get my tasks error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
