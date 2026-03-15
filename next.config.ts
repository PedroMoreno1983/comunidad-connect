import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removing output: 'export' to enable dynamic API routes and Image optimization on Vercel
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      }
    ],
  },
};

export default nextConfig;
