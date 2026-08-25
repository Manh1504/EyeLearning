import type { NextConfig } from "next";

// Một biến duy nhất: origin của backend (vd https://api.yourdomain.com).
// Tất cả rewrite (api, media, gaze) và URL都 suy ra từ đây.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.yourdomain.com";

const nextConfig: NextConfig = {
  async rewrites() {
    // Để các rule cụ thể (/api/teacher, /api/admin) tách riêng vào beforeFiles
    // tránh bị Next.js 16 deduplicate mất khi chúng là tập con của /api/:path*.
    return {
      beforeFiles: [
        {
          source: "/api/teacher/:path*",
          destination: `${API_URL}/teacher/:path*`,
        },
        {
          source: "/api/admin/:path*",
          destination: `${API_URL}/admin/:path*`,
        },
      ],
      afterFiles: [
        {
          source: "/api/:path*",
          destination: `${API_URL}/api/:path*`,
        },
        {
          source: "/media/:path*",
          destination: `${API_URL}/media/:path*`,
        },
        {
          source: "/gaze/:path*",
          destination: `${API_URL}/gaze/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;