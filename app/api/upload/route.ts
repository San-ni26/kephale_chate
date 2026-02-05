import { NextRequest, NextResponse } from 'next/server';
import { saveFile, FileType } from '@/src/lib/storage';
import { verifyToken } from '@/src/lib/jwt';

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const mimeType = file.type;

        let fileType: FileType = 'PDF'; // Default fallback
        if (mimeType.startsWith('image/')) fileType = 'IMAGE';
        else if (mimeType === 'application/pdf') fileType = 'PDF';
        else if (mimeType.includes('word') || mimeType.includes('officedocument')) fileType = 'WORD';
        else if (mimeType.startsWith('audio/')) fileType = 'AUDIO';

        const url = await saveFile(buffer, file.name, fileType);

        return NextResponse.json({
            url,
            filename: file.name,
            fileType,
            size: file.size
        });

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
