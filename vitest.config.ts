import { defineConfig } from "vitest/config";

// vitest 는 src 단위 테스트 + scripts 순수 로직 테스트. e2e/*.spec.ts 는 Playwright(npm run e2e) 소관.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
