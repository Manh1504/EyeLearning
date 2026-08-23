import type { NextConfig } from "next";

// Khi chạy qua Cloudflare tunnel, rewrite đến backend qua localhost (internal)
const BACKEND_INTERNAL = process.env.NEXT_PUBLIC_BACKEND_INTERNAL ?? "http://localhost:8001";
const GAZE_INTERNAL = process.env.NEXT_PUBLIC_GAZE_INTERNAL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    // Để các rule cụ thể (/api/teacher, /api/admin) tách riêng vào beforeFiles
    // tránh bị Next.js 16 deduplicate mất khi chúng là tập con của /api/:path*.
    return {
      beforeFiles: [
        {
          source: "/api/teacher/:path*",
          destination: `${BACKEND_INTERNAL}/teacher/:path*`,
        },
        {
          source: "/api/admin/:path*",
          destination: `${BACKEND_INTERNAL}/admin/:path*`,
        },
      ],
      afterFiles: [
        {
          source: "/api/:path*",
          destination: `${BACKEND_INTERNAL}/api/:path*`,
        },
        {
          source: "/media/:path*",
          destination: `${BACKEND_INTERNAL}/media/:path*`,
        },
        {
          source: "/gaze/:path*",
          destination: `${GAZE_INTERNAL}/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;