
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

interface IPAPIResponse {
    status: string;
    country?: string;
    countryCode?: string;
    region?: string;
    regionName?: string;
    city?: string;
    lat?: number;
    lon?: number;
    timezone?: string;
    message?: string;
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
 * Get geolocation data from IP address using ip-api.com
 * Free tier: 45 requests per minute
 */
export async function getGeolocationFromIP(ip: string): Promise<GeolocationData | null> {
    // Handle localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
        return {
            ip,
            country: 'ML', // Default to Mali for local development
            city: 'Bamako',
            region: 'Bamako',
            latitude: 12.65,
            longitude: -8.0,
            timezone: 'Africa/Bamako',
        };
    }

    try {
        // Use ip-api.com free tier (no API key required)
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone`, {
            next: { revalidate: 3600 }, // Cache for 1 hour
        });

        if (!response.ok) {
            console.error(`IP API request failed: ${response.status}`);
            return null;
        }

        const data: IPAPIResponse = await response.json();

        if (data.status === 'fail') {
            console.error(`IP API lookup failed: ${data.message}`);
            return null;
        }

        return {
            ip,
            country: data.countryCode || 'Unknown',
            city: data.city || 'Unknown',
            region: data.regionName || data.region || 'Unknown',
            latitude: data.lat || 0,
            longitude: data.lon || 0,
            timezone: data.timezone || 'UTC',
        };
    } catch (error) {
        console.error('Error fetching geolocation data:', error);
        return null;
    }
}

/**
 * Check if a country is allowed for registration
 */
export function isCountryAllowed(countryCode: string): boolean {
    const allowedCountries = process.env.ALLOWED_COUNTRIES?.split(',') || [];
    return allowedCountries.includes(countryCode);
}
