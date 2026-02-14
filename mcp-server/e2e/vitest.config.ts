import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lib": resolve(import.meta.dirname, "../src/lib"),
      "@prompts": resolve(import.meta.dirname, "../src/prompts"),
      "@tools": resolve(import.meta.dirname, "../src/tools"),
    },
  },
  test: {
    include: ["**/*.e2e.ts"],
    testTimeout: 30_000,
  },
});
