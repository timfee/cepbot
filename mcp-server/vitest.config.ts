import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lib": resolve(import.meta.dirname, "src/lib"),
      "@prompts": resolve(import.meta.dirname, "src/prompts"),
      "@tools": resolve(import.meta.dirname, "src/tools"),
    },
  },
  test: {
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      exclude: ["src/index.ts"],
      include: ["src/**/*.ts"],
      reporter: ["text", "json", "json-summary"],
      reportOnFailure: true,
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
