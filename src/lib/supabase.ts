import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Client public (lecture de fichiers publics) */
export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

/** Client admin serveur (upload, suppression) — NE PAS exposer côté client */
export const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

/**
 * Nouveau Client App Router Supabase SSR (Next.js Server Components)
 */
export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
    return createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
                    } catch {
                        // L'appel `setAll` se fait depuis un Server Component.
                        // On peut l'ignorer si un middleware s'occupe de rafraîchir la session.
                    }
                },
            },
        }
    );
};

export const STORAGE_BUCKET = 'chat';

/**
 * Génère le chemin de stockage d'un fichier dans le bucket.
 * Format : {context}/{contextId}/{timestamp}-{filename}
 */
export function buildStoragePath(
    context: string,
    contextId: string,
    filename: string
): string {
    const ts = Date.now();
    // Nettoyage du nom de fichier (pas de caractères spéciaux)
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${context}/${contextId}/${ts}-${safe}`;
}

/**
 * Supprime un fichier du storage Supabase à partir de son storageKey.
 * Ne lance pas d'erreur si le fichier n'existe pas.
 */
export async function deleteStorageFile(storageKey: string): Promise<void> {
    if (!storageKey) return;
    const { error } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .remove([storageKey]);
    if (error) {
        console.error('[Supabase Storage] Erreur suppression fichier:', error);
    }
}

/**
 * Supprime un fichier depuis son URL publique Supabase.
 * Extrait automatiquement le bucket et le storageKey depuis l'URL.
 * Ex: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<storageKey>
 */
export async function deleteStorageFileByUrl(publicUrl: string): Promise<void> {
    if (!publicUrl || !publicUrl.includes('/storage/v1/object/public/')) return;
    try {
        // Extraire la partie après "/public/"
        const afterPublic = publicUrl.split('/storage/v1/object/public/')[1];
        if (!afterPublic) return;
        // Le premier segment est le bucket, le reste est le storageKey
        const slashIndex = afterPublic.indexOf('/');
        if (slashIndex === -1) return;
        const bucket = afterPublic.substring(0, slashIndex);
        const storageKey = afterPublic.substring(slashIndex + 1);
        const { error } = await supabaseAdmin.storage.from(bucket).remove([storageKey]);
        if (error) {
            console.error('[Supabase Storage] Erreur suppression par URL:', error);
        }
    } catch (err) {
        console.error('[Supabase Storage] Erreur parsing URL:', err);
    }
}

/**
 * Retourne l'URL publique d'un fichier dans le bucket.
 */
export function getPublicUrl(storageKey: string): string {
    const { data } = supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storageKey);
    return data.publicUrl;
}
