import type { NextConfig } from "next";
import withPWA from 'next-pwa';

const nextConfig: NextConfig = {
  serverExternalPackages: ['geoip-lite'],
  turbopack: {},
};

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // DO NOT disable in development - push notifications need the SW to work
  disable: false,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-webfonts',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 365 * 24 * 60 * 60
        }
      }
    },
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-image-assets',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 24 * 60 * 60
        }
      }
    },
    // DO NOT cache API routes - they must always be fresh for real-time features
    {
      urlPattern: /\/api\/.*/i,
      handler: 'NetworkOnly',
    },
    {
      urlPattern: ({ url }: { url: URL }) => {
        const isSameOrigin = self.origin === url.origin;
        if (!isSameOrigin) return false;
        const pathname = url.pathname;
        if (pathname.startsWith('/api/')) return false;
        return true;
      },
      handler: 'NetworkFirst',
      options: {
        cacheName: 'others',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60
        },
      }
    }
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...({ importScripts: ['/custom-sw.js'] } as any),
});

export default pwaConfig(nextConfig);
