/**
 * Compte Pro - Tarification et helpers
 * 1 500 FCFA/mois, -5% sur 6 mois, -10% sur 12 mois
 */

export type UserProPlan = 'MONTHLY' | 'SIX_MONTHS' | 'TWELVE_MONTHS';

export interface UserProPlanConfig {
    plan: UserProPlan;
    label: string;
    months: number;
    priceFcfa: number;
    reductionPercent: number;
}

export const USER_PRO_PLANS: Record<UserProPlan, UserProPlanConfig> = {
    MONTHLY: {
        plan: 'MONTHLY',
        label: '1 mois',
        months: 1,
        priceFcfa: 1500,
        reductionPercent: 0,
    },
    SIX_MONTHS: {
        plan: 'SIX_MONTHS',
        label: '6 mois',
        months: 6,
        priceFcfa: Math.round(1500 * 6 * 0.95), // 8550 FCFA (-5%)
        reductionPercent: 5,
    },
    TWELVE_MONTHS: {
        plan: 'TWELVE_MONTHS',
        label: '12 mois',
        months: 12,
        priceFcfa: Math.round(1500 * 12 * 0.9), // 16200 FCFA (-10%)
        reductionPercent: 10,
    },
};

export function getUserProPlanPrice(plan: UserProPlan): number {
    return USER_PRO_PLANS[plan].priceFcfa;
}

export function getUserProPlanConfig(plan: UserProPlan): UserProPlanConfig {
    return USER_PRO_PLANS[plan];
}

export function calculateUserProEndDate(startDate: Date, plan: UserProPlan): Date {
    const config = USER_PRO_PLANS[plan];
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + config.months);
    return endDate;
}

export function isUserProActive(endDate: Date | null): boolean {
    if (!endDate) return false;
    return new Date() < endDate;
}
