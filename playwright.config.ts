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
    // CI 는 바로 앞 스텝에서 이미 build 했으므로 preview 만 띄운다. 로컬은 빌드부터.
    command: process.env.CI
      ? "npx vite preview --port 5273 --strictPort"
      : "npm run build && npx vite preview --port 5273 --strictPort",
    url: "http://localhost:5273",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
