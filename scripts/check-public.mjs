import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const blocked =
  /(^|\/)(?:\.private-backups|data|sessions|\.local|node_modules)(\/|$)|(?:^|\/)\.env$|\.(?:key|pem|bundle|zip)$/i;
const credentials = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[a-zA-Z0-9]{30,}/,
  /\bgithub_pat_[a-zA-Z0-9_]{30,}/,
  /\b(?:EAA|IGAA)[a-zA-Z0-9]{50,}/,
];
const failures = [];
for (const path of files) {
  if (blocked.test(path)) {
    failures.push(`${path}: forbidden release path`);
    continue;
  }
  if (/\.(?:png|woff2?|jpe?g|gif|ico)$/.test(path)) continue;
  const text = await readFile(path, "utf8");
  if (credentials.some((p) => p.test(text)))
    failures.push(`${path}: potential credential (value redacted)`);
}
if (failures.length) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exitCode = 1;
} else
  process.stdout.write(
    `Checked ${files.length} tracked release files. No blocked paths or credential signatures found.\n`,
  );
