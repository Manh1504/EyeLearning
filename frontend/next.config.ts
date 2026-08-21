import type { NextConfig } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";
const GAZE_BASE =
  process.env.NEXT_PUBLIC_EYE_TRACKING_HTTP_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/media/:path*",
        destination: `${API_BASE}/media/:path*`,
      },
      {
        source: "/gaze/:path*",
        destination: `${GAZE_BASE}/:path*`,
      },
    ];
  },
};

export default nextConfig;