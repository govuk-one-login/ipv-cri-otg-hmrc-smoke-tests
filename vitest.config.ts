import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  test: {
    clearMocks: true,
    include: ["**/*.test.ts"],
    testTimeout: 200_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*"],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
