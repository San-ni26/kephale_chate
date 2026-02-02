import { SubscriptionPlan } from '@/src/prisma/client';

export interface SubscriptionLimits {
    maxDepartments: number;
    maxMembersPerDept: number;
    price: number;
    duration: number; // in months
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, SubscriptionLimits> = {
    FREE: {
        maxDepartments: 2,
        maxMembersPerDept: 5,
        price: 0,
        duration: 1, // 1 month trial
    },
    BASIC: {
        maxDepartments: 5,
        maxMembersPerDept: 20,
        price: 29,
        duration: 1,
    },
    PROFESSIONAL: {
        maxDepartments: 15,
        maxMembersPerDept: 50,
        price: 79,
        duration: 1,
    },
    ENTERPRISE: {
        maxDepartments: 999999, // Unlimited
        maxMembersPerDept: 999999, // Unlimited
        price: 199,
        duration: 1,
    },
};

export function getSubscriptionLimits(plan: SubscriptionPlan): SubscriptionLimits {
    return SUBSCRIPTION_PLANS[plan];
}

export function calculateSubscriptionEndDate(startDate: Date, plan: SubscriptionPlan): Date {
    const limits = getSubscriptionLimits(plan);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + limits.duration);
    return endDate;
}

export function isSubscriptionActive(endDate: Date | null): boolean {
    if (!endDate) return true; // No end date means active
    return new Date() < endDate;
}

export function canCreateDepartment(currentCount: number, plan: SubscriptionPlan): boolean {
    const limits = getSubscriptionLimits(plan);
    return currentCount < limits.maxDepartments;
}

export function canAddMember(currentCount: number, plan: SubscriptionPlan): boolean {
    const limits = getSubscriptionLimits(plan);
    return currentCount < limits.maxMembersPerDept;
}

export function generateEventToken(): string {
    // Generate a unique token for event invitations
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}
