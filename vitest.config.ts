import { defineConfig } from "vitest/config";

// Los tests de Playwright (tests/e2e) los corre `npm run e2e`, no Vitest.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
