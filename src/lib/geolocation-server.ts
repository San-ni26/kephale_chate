
import * as geoip from 'geoip-lite';
import { headers } from 'next/headers';

export interface GeolocationData {
    ip: string;
    country: string;
    city: string;
    region: string;
    latitude: number;
    longitude: number;
    timezone: string;
}

/**
 * Get client IP address from request headers
 */
export async function getClientIP(): Promise<string> {
    const headersList = await headers();

    // Try various headers that might contain the real IP
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIP = headersList.get('x-real-ip');
    const cfConnectingIP = headersList.get('cf-connecting-ip');

    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    if (realIP) {
        return realIP;
    }

    if (cfConnectingIP) {
        return cfConnectingIP;
    }

    // Fallback for local development
    return '127.0.0.1';
}

/**
 * Get geolocation data from IP address
 */
export function getGeolocationFromIP(ip: string): GeolocationData | null {
    // Handle localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
        return {
            ip,
            country: 'ML', // Default to Mali for local development
            city: 'Bamako',
            region: 'Bamako',
            latitude: 12.65,
            longitude: 2.3522,
            timezone: 'africa/paris',
        };
    }

    const geo = geoip.lookup(ip);

    if (!geo) {
        return null;
    }

    return {
        ip,
        country: geo.country,
        city: geo.city || 'Unknown',
        region: geo.region || 'Unknown',
        latitude: geo.ll[0],
        longitude: geo.ll[1],
        timezone: geo.timezone,
    };
}

/**
 * Check if a country is allowed for registration
 */
export function isCountryAllowed(countryCode: string): boolean {
    const allowedCountries = process.env.ALLOWED_COUNTRIES?.split(',') || [];
    return allowedCountries.includes(countryCode);
}
