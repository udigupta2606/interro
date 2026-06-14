import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse uses Node.js fs — keep it server-side only
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
