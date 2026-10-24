import { randomBytes } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
const keys = [
  "META_VERIFY_TOKEN",
  "GATEWAY_CLIENT_TOKEN",
  "TOKEN_ENCRYPTION_KEY",
];
if (!process.argv.includes("--write")) {
  process.stdout.write(
    "Copy .env.example to .env, then run pnpm setup:secrets --write. Existing values are preserved. Secrets are not printed.\n",
  );
} else {
  let text = await readFile(".env", "utf8");
  let count = 0;
  for (const key of keys) {
    const pattern = new RegExp(`^${key}=(.*)$`, "m"),
      match = text.match(pattern);
    if (match?.[1]?.trim()) continue;
    const value = randomBytes(32).toString("hex");
    text = match
      ? text.replace(pattern, `${key}=${value}`)
      : text + `\n${key}=${value}\n`;
    count++;
  }
  await writeFile(".env", text, { mode: 0o600 });
  await chmod(".env", 0o600);
  process.stdout.write(
    `Initialized ${count} empty secret setting(s) in .env. Back up this file privately.\n`,
  );
}
