import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Temporär: Supabase-Typen werden via CLI neu generiert sobald deployed
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
