/**
 * Constantes et types pour les droits de discussion (client-safe, pas de prisma)
 */

export type DiscussionRightDuration = 'THREE_MONTHS' | 'SIX_MONTHS' | 'TWELVE_MONTHS';

export const DISCUSSION_RIGHT_DURATIONS: Record<
    DiscussionRightDuration,
    { months: number; label: string; priceFcfa: number }
> = {
    THREE_MONTHS: { months: 3, label: '3 mois', priceFcfa: 10000 },
    SIX_MONTHS: { months: 6, label: '6 mois', priceFcfa: 20000 },
    TWELVE_MONTHS: { months: 12, label: '12 mois', priceFcfa: 30000 },
};
