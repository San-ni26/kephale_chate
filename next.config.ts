import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['geoip-lite'],
  turbopack: {},
};

export default nextConfig;
