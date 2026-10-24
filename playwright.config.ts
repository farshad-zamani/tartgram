import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
process.env.TARTGRAM_TEST_TOKEN ||= randomBytes(32).toString("hex");
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:8085",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/preview.mjs",
    url: "http://127.0.0.1:8085/healthz",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  reporter: "list",
});
