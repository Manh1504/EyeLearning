import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Trong dev, proxy các API path sang backend FastAPI để tránh CORS,
// giống hệt cách nginx sẽ proxy khi build production trong container.
const API_TARGET = process.env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:8000";

const apiProxy = {
  target: API_TARGET,
  changeOrigin: true,
  bypass(req) {
    const accept = req.headers.accept || "";
    if (req.method === "GET" && accept.includes("text/html")) {
      return "/index.html";
    }
    return undefined;
  },
};

const API_PATHS = [
  "/auth",
  "/courses",
  "/sessions",
  "/tracking",
  "/gaze",
  "/metrics",
  "/learning-analytics",
  "/heatmaps",
  "/calibration",
  "/lessons",
  "/lectures",
  "/debug",
  "/admin/overview",
  "/page-snapshot",
  "/client-config",
  "/health",
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,   // <-- Thêm dòng này
    proxy: Object.fromEntries(
      API_PATHS.map((path) => [path, apiProxy])
    ),
  },
});