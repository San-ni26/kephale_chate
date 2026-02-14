import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { verifyToken } from '@/src/lib/jwt';
import { apiError, handleApiError } from '@/src/lib/api-response';

const addDocumentSchema = z.object({
    filename: z.string().min(1, 'filename requis').max(255, 'filename trop long'),
    type: z.enum(['IMAGE', 'PDF', 'WORD', 'AUDIO', 'OTHER']),
    data: z.string().min(1, 'data requis'),
});

export async function GET(
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
        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q')?.trim() || '';
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

        const [deptMember, department, orgMember] = await Promise.all([
            prisma.departmentMember.findFirst({ where: { userId, deptId } }),
            prisma.department.findFirst({ where: { id: deptId }, select: { orgId: true } }),
            prisma.organizationMember.findFirst({ where: { userId, orgId } }),
        ]);

        const canAccess = deptMember || (department && orgMember && department.orgId === orgId);
        if (!canAccess) {
            return NextResponse.json({ error: 'Accès refusé. Vous devez être membre du département ou de l\'organisation.' }, { status: 403 });
        }

        const documents = await prisma.departmentDocument.findMany({
            where: {
                deptId,
                ...(q ? { filename: { contains: q, mode: 'insensitive' as const } } : {}),
            },
            take: limit,
            skip: offset,
            include: {
                uploader: {
                    select: { id: true, name: true, email: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ documents });
    } catch (error) {
        return handleApiError(error);
    }
}

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
        const validated = addDocumentSchema.safeParse(body);

        if (!validated.success) {
            return apiError('Données invalides', 400, {
                code: 'VALIDATION_ERROR',
                details: validated.error.issues,
            });
        }

        const { filename, type, data } = validated.data;

        const [deptMember, department, orgMember] = await Promise.all([
            prisma.departmentMember.findFirst({ where: { userId, deptId } }),
            prisma.department.findFirst({ where: { id: deptId }, select: { orgId: true } }),
            prisma.organizationMember.findFirst({ where: { userId, orgId } }),
        ]);

        const canAccess = deptMember || (department && orgMember && department.orgId === orgId);
        if (!canAccess) {
            return apiError('Accès refusé. Vous devez être membre du département ou de l\'organisation.', 403);
        }

        const doc = await prisma.departmentDocument.create({
            data: {
                deptId,
                filename,
                type,
                data,
                uploadedBy: userId,
            },
            include: {
                uploader: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        return NextResponse.json({ document: doc }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return apiError('Données invalides', 400, { details: error.issues });
        }
        return handleApiError(error);
    }
}
