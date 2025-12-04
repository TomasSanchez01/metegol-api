import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        port: "",
        pathname: "/**",
      },
    ],
  },
  eslint: {
    // Ignore ESLint errors during builds (warnings are still shown)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ignore TypeScript errors during builds
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
