// Isolated loopback preview used by browser tests; it never loads a user's .env.
import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
const data = await mkdtemp(join(tmpdir(), "tartgram-preview-"));
const child = spawn(process.execPath, ["apps/gateway/dist/index.js"], {
  stdio: "inherit",
  env: {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "8085",
    PUBLIC_URL: "http://127.0.0.1:8085",
    ALLOW_INSECURE_LOCALHOST: "true",
    DATA_DIR: data,
    SPA_DIR: resolve("apps/desktop/dist"),
    GATEWAY_CLIENT_TOKEN:
      process.env.TARTGRAM_TEST_TOKEN || randomBytes(32).toString("hex"),
    META_VERIFY_TOKEN: randomBytes(32).toString("hex"),
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    OPERATOR_NAME: "Example Studio",
    OPERATOR_CONTACT_URL: "https://example.com/contact",
    LOG_LEVEL: "silent",
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
