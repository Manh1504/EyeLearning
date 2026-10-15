import { defineConfig, devices } from "@playwright/test";

// Chạy riêng cho chế độ demo (NEXT_PUBLIC_DEMO=1): không cần backend/mock.
//   npx playwright test -c playwright.demo.config.ts
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/demo.spec.ts"],
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3011",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev --port 3011",
    url: "http://localhost:3011/demo",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: "http://localhost:8001",
      NEXT_PUBLIC_GAZE_URL: "http://localhost:8000",
      NEXT_PUBLIC_DEMO: "1",
    },
  },
});
