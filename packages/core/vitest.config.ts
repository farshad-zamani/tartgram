import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Resolve the workspace dep to its TypeScript source so tests run without a build step.
export default defineConfig({
  resolve: {
    alias: {
      "@app/shared": resolve(import.meta.dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
