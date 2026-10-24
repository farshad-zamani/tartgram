import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Builds are separate: docker build -t tartgram:test .
const image = process.argv[2] || "tartgram:test",
  root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), "tartgram-container-check-"));
const suffix = randomBytes(5).toString("hex"),
  name = `tartgram-check-${suffix}`,
  volume = `${name}-data`,
  restored = `${name}-restored`;
const token = randomBytes(32).toString("hex"),
  origin = "https://tartgram.example.com";
const run = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const envPath = join(temp, "settings.env");
const env = `PUBLIC_HOST=tartgram.example.com\nPUBLIC_URL=${origin}\nGATEWAY_CLIENT_TOKEN=${token}\nMETA_VERIFY_TOKEN=${randomBytes(32).toString("hex")}\nTOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nOPERATOR_NAME=Example Studio\nOPERATOR_CONTACT_URL=https://example.com/contact\nLOG_LEVEL=silent\n`;
let container = false;
const createdVolumes = [];
try {
  await writeFile(envPath, env, { mode: 0o600 });
  const compose = (await readFile("compose.yaml", "utf8")).replace(
    "env_file: .env",
    `env_file: ${JSON.stringify(envPath.replaceAll("\\", "/"))}`,
  );
  const composePath = join(temp, "compose.yaml");
  await writeFile(composePath, compose);
  run(
    "compose",
    "--project-directory",
    root,
    "--env-file",
    envPath,
    "--file",
    composePath,
    "config",
    "--quiet",
  );
  for (const v of [volume, restored]) {
    run("volume", "create", v);
    createdVolumes.push(v);
  }
  const start = (v) => {
    run(
      "run",
      "-d",
      "--name",
      name,
      "-p",
      "127.0.0.1::8080",
      "--env-file",
      envPath,
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "-v",
      `${v}:/data`,
      image,
    );
    container = true;
  };
  async function address() {
    return `http://127.0.0.1:${run("port", name, "8080/tcp").split(":").at(-1)}`;
  }
  async function ready(base) {
    for (let i = 0; i < 100; i++) {
      try {
        const res = await fetch(base + "/healthz");
        if (res.ok) {
          await res.json();
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Container did not become healthy.");
  }
  async function login(base) {
    const res = await fetch(base + "/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ token }),
    });
    await res.json();
    if (!res.ok) throw new Error("Container login failed.");
    return res.headers.get("set-cookie").split(";")[0];
  }
  start(volume);
  let base = await address();
  await ready(base);
  let cookie = await login(base);
  const captions = [
    { id: "smoke", title: "Smoke test", text: "Persistent sample caption" },
  ];
  const saved = await fetch(base + "/api/captions", {
    method: "PUT",
    headers: { "content-type": "application/json", origin, cookie },
    body: JSON.stringify(captions),
  });
  await saved.json();
  if (!saved.ok) throw new Error("Persistence write failed.");
  run("restart", name);
  base = await address();
  await ready(base);
  cookie = await login(base);
  const read = await fetch(base + "/api/captions", { headers: { cookie } });
  if (JSON.stringify(await read.json()) !== JSON.stringify(captions))
    throw new Error("Restart lost data.");
  const panel = await fetch(base + "/app/");
  if (!(await panel.text()).includes("TartGram"))
    throw new Error("Panel build missing.");
  const archive = execFileSync("docker", [
    "exec",
    name,
    "tar",
    "-czf",
    "-",
    "-C",
    "/data",
    ".",
  ]);
  await writeFile(join(temp, "data.tar.gz"), archive);
  run("stop", name);
  run("rm", name);
  container = false;
  run(
    "run",
    "--rm",
    "--user",
    "0",
    "-v",
    `${restored}:/restore`,
    "-v",
    `${resolve(temp)}:/backup:ro`,
    "--entrypoint",
    "sh",
    image,
    "-c",
    "tar -xzf /backup/data.tar.gz -C /restore && chown -R 1000:1000 /restore",
  );
  start(restored);
  base = await address();
  await ready(base);
  cookie = await login(base);
  const after = await fetch(base + "/api/captions", { headers: { cookie } });
  if (JSON.stringify(await after.json()) !== JSON.stringify(captions))
    throw new Error("Backup restoration failed.");
  process.stdout.write(
    "Compose configuration, unprivileged container startup, panel serving, login, restart persistence and backup restoration passed.\n",
  );
} catch (error) {
  if (container) {
    try {
      process.stderr.write(run("logs", name) + "\n");
    } catch {}
  }
  process.stderr.write(
    error instanceof Error
      ? error.message.replaceAll(token, "[redacted]") + "\n"
      : "Container check failed.\n",
  );
  process.exitCode = 1;
} finally {
  if (container) {
    try {
      run("rm", "--force", name);
    } catch {}
  }
  for (const v of createdVolumes) {
    try {
      run("volume", "rm", v);
    } catch {}
  }
  await rm(temp, { recursive: true, force: true });
}
