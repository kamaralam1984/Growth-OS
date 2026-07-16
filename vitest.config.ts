import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/generated/**",
        "src/app/**", // pages/route handlers — covered by Playwright E2E, not unit tests
      ],
    },
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's `paths` so `@/lib/...` imports resolve the
      // same way in tests as they do in the real Next.js build.
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
