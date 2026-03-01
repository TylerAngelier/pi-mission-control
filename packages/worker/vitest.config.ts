import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/dev.ts"],
      thresholds: {
        statements: 60,
        branches: 45,
        functions: 60,
        lines: 60,
      },
    },
  },
});
