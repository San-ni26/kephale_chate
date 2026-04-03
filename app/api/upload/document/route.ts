import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/jwt';
import { supabaseAdmin, STORAGE_BUCKET, buildStoragePath, getPublicUrl } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 25 * 1024 * 1024; // 25 Mo (inclus audios)

const VALID_MIME: Record<string, string> = {
    'image/jpeg': 'IMAGE',
    'image/png': 'IMAGE',
    'image/gif': 'IMAGE',
    'image/webp': 'IMAGE',
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'WORD',
    // Audio
    'audio/webm': 'AUDIO',
    'audio/ogg': 'AUDIO',
    'audio/mp4': 'AUDIO',
    'audio/mpeg': 'AUDIO',
    'audio/aac': 'AUDIO',
    'audio/wav': 'AUDIO',
    'audio/x-m4a': 'AUDIO',
    'video/mp4': 'AUDIO',  // enregistrements webm/mp4 sur certains navigateurs
    'video/webm': 'AUDIO',
};

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const context = formData.get('context') as string | null;
        const contextId = formData.get('contextId') as string | null;

        if (!file || !context || !contextId) {
            return NextResponse.json({ error: 'Fichier, context et contextId requis' }, { status: 400 });
        }

        const VALID_CONTEXTS = ['dept', 'collab', 'messages', 'groups', 'job-applications', 'tasks', 'audio', 'discussions', 'test-verify'];
        if (!VALID_CONTEXTS.includes(context)) {
            return NextResponse.json({ error: `context invalide (${VALID_CONTEXTS.join(' | ')})` }, { status: 400 });
        }

        const mimeType = file.type;
        const baseMime = mimeType.split(';')[0].trim();
        if (!VALID_MIME[mimeType] && !VALID_MIME[baseMime]) {
            return NextResponse.json(
                { error: `Type non autorisé (${mimeType}). Accepté : images, PDF, Word, audio` },
                { status: 400 }
            );
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'Fichier trop volumineux (max 25 Mo)' }, { status: 400 });
        }

        const fileType = VALID_MIME[mimeType] || VALID_MIME[baseMime];
        const storageKey = buildStoragePath(context as 'dept' | 'collab', contextId, file.name);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .upload(storageKey, buffer, {
                contentType: baseMime,
                upsert: false,
            });

        if (uploadError) {
            console.error('[Upload Document] Supabase error:', uploadError);
            return NextResponse.json({ error: 'Erreur upload fichier' }, { status: 500 });
        }

        const publicUrl = getPublicUrl(storageKey);

        return NextResponse.json({
            storageKey,
            url: publicUrl,
            filename: file.name,
            type: fileType,
            size: file.size,
        }, { status: 201 });

    } catch (error) {
        console.error('[Upload Document] Erreur:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
