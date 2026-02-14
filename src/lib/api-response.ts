/**
 * Utilitaires pour réponses API structurées et cohérentes
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

export interface ApiError {
    error: string;
    code?: string;
    details?: unknown;
}

/**
 * Réponse erreur standardisée
 */
export function apiError(
    message: string,
    status: number,
    options?: { code?: string; details?: unknown; headers?: HeadersInit }
): NextResponse {
    const body: ApiError = { error: message };
    if (options?.code) body.code = options.code;
    if (options?.details) body.details = options.details;
    return NextResponse.json(body, {
        status,
        headers: options?.headers,
    });
}

/**
 * Gère ZodError et autres erreurs dans les routes API
 */
export function handleApiError(error: unknown): NextResponse {
    if (error instanceof z.ZodError) {
        return apiError('Données invalides', 400, { code: 'VALIDATION_ERROR', details: error.issues });
    }
    if (error instanceof Error) {
        console.error('[API Error]', error.message, error.stack);
    } else {
        console.error('[API Error]', error);
    }
    return apiError('Erreur serveur', 500);
}
