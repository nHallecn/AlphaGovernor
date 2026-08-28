import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";
    return [{ source: "/api/v1/:path*", destination: `${apiBase}/api/v1/:path*` }];
  },
};

export default nextConfig;
