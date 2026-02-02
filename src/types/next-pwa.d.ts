declare module 'next-pwa' {
    import { NextConfig } from 'next';

    interface PWAConfig {
        dest?: string;
        register?: boolean;
        skipWaiting?: boolean;
        disable?: boolean;
        runtimeCaching?: Array<{
            urlPattern: RegExp | ((context: { url: URL }) => boolean);
            handler: string;
            options?: {
                cacheName?: string;
                expiration?: {
                    maxEntries?: number;
                    maxAgeSeconds?: number;
                };
                networkTimeoutSeconds?: number;
                rangeRequests?: boolean;
            };
        }>;
    }

    function withPWA(config: PWAConfig): (nextConfig: NextConfig) => NextConfig;

    export default withPWA;
}
