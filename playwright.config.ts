import { defineConfig, devices } from "@playwright/test";

// e2e: Vite preview(브라우저 mock IPC) 대상 프론트 플로우. 백엔드는 cargo integration 테스트가 커버.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5273", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx vite preview --port 5273 --strictPort",
    url: "http://localhost:5273",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
