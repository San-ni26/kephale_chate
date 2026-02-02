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
