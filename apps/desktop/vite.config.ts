import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served under /app/ on the gateway (and loaded from there by the Electron shell).
export default defineConfig({
  base: "/app/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    // During local dev, proxy the API + OAuth to the local gateway.
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: true,
      },
      "/oauth": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
