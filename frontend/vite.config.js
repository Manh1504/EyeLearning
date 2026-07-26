import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Trong dev, proxy các API path sang backend FastAPI để tránh CORS,
// giống hệt cách nginx sẽ proxy khi build production trong container.
const API_TARGET = process.env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:8000";

const API_PATHS = [
  "/sessions",
  "/tracking",
  "/gaze",
  "/metrics",
  "/heatmaps",
  "/calibration",
  "/lessons",
  "/lectures",
  "/debug",
  "/admin",
  "/page-snapshot",
  "/client-config",
  "/health",
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PATHS.map((path) => [path, { target: API_TARGET, changeOrigin: true }])
    ),
  },
});
