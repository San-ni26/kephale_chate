import { randomInt } from 'crypto';

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
    return randomInt(100000, 999999).toString();
}

/**
 * Generate OTP expiry time (10 minutes from now)
 */
export function generateOTPExpiry(): Date {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 10);
    return expiry;
}

/**
 * Verify if OTP is valid and not expired
 */
export function verifyOTP(
    inputOTP: string,
    storedOTP: string | null,
    expiryDate: Date | null
): { valid: boolean; error?: string } {
    if (!storedOTP || !expiryDate) {
        return { valid: false, error: 'Aucun code OTP trouvé' };
    }

    if (new Date() > expiryDate) {
        return { valid: false, error: 'Le code OTP a expiré' };
    }

    if (inputOTP !== storedOTP) {
        return { valid: false, error: 'Code OTP invalide' };
    }

    return { valid: true };
}

/**
 * Generate a 12-digit organization code
 */
export function generateOrganizationCode(): string {
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += randomInt(0, 10).toString();
    }
    return code;
}
