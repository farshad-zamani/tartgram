import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  target: "es2022",
  // Bundle workspace packages into the output so the gateway ships as a self-contained artifact.
  noExternal: ["@app/core", "@app/shared"],
});
