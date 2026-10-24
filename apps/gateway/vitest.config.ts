import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Run tests against workspace source (no prior build needed).
export default defineConfig({
  resolve: {
    alias: {
      "@app/core": resolve(
        import.meta.dirname,
        "../../packages/core/src/index.ts",
      ),
      "@app/shared": resolve(
        import.meta.dirname,
        "../../packages/shared/src/index.ts",
      ),
    },
  },
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
