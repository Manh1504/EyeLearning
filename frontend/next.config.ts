import type { NextConfig } from "next";
import path from "path";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "https://server.nmhieu.online";
const GAZE_URL = (process.env.NEXT_PUBLIC_GAZE_URL?.trim() || "http://localhost:8000").replace(/:8443(?=\/|$)/, "");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      { source: "/student/my-courses", destination: "/student", permanent: true },
      { source: "/teacher/courses", destination: "/teacher", permanent: true },
      { source: "/admin/courses", destination: "/admin", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.eyelearning.id.vn https://gaze.eyelearning.id.vn wss://gaze.eyelearning.id.vn http://localhost:* ws://localhost:*; media-src 'self' blob:",
          },
        ],
      },
    ];
  },
  async rewrites() {
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
          destination: `${GAZE_URL}/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
