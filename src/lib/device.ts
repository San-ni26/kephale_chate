import { UAParser } from 'ua-parser-js';
import { headers } from 'next/headers';
import { createHash } from 'crypto';

export interface DeviceInfo {
    deviceId: string;
    browser: string;
    browserVersion: string;
    os: string;
    osVersion: string;
    device: string;
    userAgent: string;
}

/**
 * Generate a unique device fingerprint
 */
export async function generateDeviceFingerprint(): Promise<DeviceInfo> {
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || 'Unknown';

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    // Create a unique device ID based on user agent and other factors
    const deviceString = `${result.browser.name}-${result.browser.version}-${result.os.name}-${result.os.version}-${result.device.type || 'desktop'}`;
    const deviceId = createHash('sha256').update(deviceString).digest('hex');

    return {
        deviceId,
        browser: result.browser.name || 'Unknown',
        browserVersion: result.browser.version || 'Unknown',
        os: result.os.name || 'Unknown',
        osVersion: result.os.version || 'Unknown',
        device: result.device.type || 'desktop',
        userAgent,
    };
}

/**
 * Compare two device fingerprints
 */
export function compareDevices(device1: DeviceInfo, device2: DeviceInfo): boolean {
    return device1.deviceId === device2.deviceId;
}

/**
 * Get device info from stored JSON
 */
export function parseDeviceInfo(deviceInfoJson: any): DeviceInfo | null {
    try {
        if (!deviceInfoJson) return null;

        return {
            deviceId: deviceInfoJson.deviceId || '',
            browser: deviceInfoJson.browser || 'Unknown',
            browserVersion: deviceInfoJson.browserVersion || 'Unknown',
            os: deviceInfoJson.os || 'Unknown',
            osVersion: deviceInfoJson.osVersion || 'Unknown',
            device: deviceInfoJson.device || 'desktop',
            userAgent: deviceInfoJson.userAgent || '',
        };
    } catch (error) {
        console.error('Error parsing device info:', error);
        return null;
    }
}

// ============ Client-side utilities ============

/**
 * Detect if device is mobile
 */
export function isMobileDevice(): boolean {
    if (typeof window === 'undefined') return false;

    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
}

/**
 * Detect if device is iOS
 */
export function isIOS(): boolean {
    if (typeof window === 'undefined') return false;

    return /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(window as unknown as { MSStream: unknown }).MSStream;
}

/**
 * Detect if device is Android
 */
export function isAndroid(): boolean {
    if (typeof window === 'undefined') return false;

    return /Android/.test(navigator.userAgent);
}

/**
 * Detect if device is a tablet
 */
export function isTablet(): boolean {
    if (typeof window === 'undefined') return false;

    const userAgent = navigator.userAgent;
    const isIPad = /iPad/.test(userAgent);
    const isAndroidTablet = /Android/.test(userAgent) && !/Mobile/.test(userAgent);

    return isIPad || isAndroidTablet || (
        window.innerWidth >= 768 && window.innerWidth <= 1366 && isMobileDevice()
    );
}

/**
 * Detect if device supports touch
 */
export function isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;

    return 'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (navigator as unknown as { msMaxTouchPoints: number }).msMaxTouchPoints > 0;
}

/**
 * Detect if app is in standalone mode (PWA installed)
 */
export function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;

    return window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone: boolean }).standalone === true;
}

/**
 * Hook to get device info
 */
export function useDeviceInfo() {
    return {
        isMobile: isMobileDevice(),
        isIOS: isIOS(),
        isAndroid: isAndroid(),
        isTablet: isTablet(),
        isTouch: isTouchDevice(),
        isStandalone: isStandalone(),
    };
}
