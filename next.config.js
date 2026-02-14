const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['geoip-lite'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0',
          },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
  turbopack: {
    root: __dirname,
  },
  webpack: (config, { defaultLoaders }) => {
    // Forcer la racine du projet pour éviter la résolution depuis /Users/paulkone
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.join(__dirname, 'node_modules'),
      ...(config.resolve.modules || ['node_modules']),
    ];
    config.context = __dirname;
    return config;
  },
};

module.exports = nextConfig;
