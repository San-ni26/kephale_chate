import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/src/lib/jwt';
import { supabaseAdmin, buildStoragePath } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const IMAGE_BUCKET = 'chat'; // Utilise le bucket existant

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

        const userId = payload.userId as string;

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const context = (formData.get('context') as string) || 'general';
        const contextId = (formData.get('contextId') as string) || userId;

        if (!file) {
            return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
        }

        if (!ALLOWED_MIMES.includes(file.type)) {
            return NextResponse.json({ error: 'Type non autorisé (JPEG, PNG, GIF, WebP uniquement)' }, { status: 400 });
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'Image trop volumineuse (max 5 Mo)' }, { status: 400 });
        }

        const storageKey = buildStoragePath(context, contextId, file.name);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabaseAdmin.storage
            .from(IMAGE_BUCKET)
            .upload(storageKey, buffer, {
                contentType: file.type,
                upsert: true, // Écraser si même key (ex : update logo)
            });

        if (uploadError) {
            console.error('[Upload Image] Supabase error:', uploadError);
            return NextResponse.json({ error: 'Erreur upload image' }, { status: 500 });
        }

        const { data: publicUrlData } = supabaseAdmin.storage
            .from(IMAGE_BUCKET)
            .getPublicUrl(storageKey);

        return NextResponse.json({
            url: publicUrlData.publicUrl,
            storageKey,
        }, { status: 201 });

    } catch (error) {
        console.error('[Upload Image] Erreur:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
