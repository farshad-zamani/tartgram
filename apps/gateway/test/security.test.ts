import { createHmac, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer, type BuiltServer } from "../src/server.js";
import { JsonAccountStore } from "../src/account-store.js";
import { JsonContactStore } from "../src/contacts-store.js";
import { JsonCommentStore } from "../src/comments-store.js";
import { JsonStatsRecorder } from "../src/stats.js";
import { JsonFile } from "../src/storage.js";
import { ScheduledStore } from "../src/publishing.js";
import { csvCell } from "../src/management.js";
import { testConfig, sampleAccount, seedAccount } from "./helpers.js";
const servers: BuiltServer[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map((s) => s.app.close()));
});
async function server(c = testConfig()) {
  const s = await buildServer(c);
  servers.push(s);
  await s.app.ready();
  return s;
}
describe("encrypted and atomic storage", () => {
  it("encrypts tokens, binds ciphertext to account identity and refuses wrong keys", async () => {
    const c = testConfig(),
      store = new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey),
      a = sampleAccount();
    await store.upsert(a);
    const disk = await readFile(c.accountsFile, "utf8");
    expect(disk).not.toContain(a.accessToken);
    expect((await store.load())[0]?.accessToken).toBe(a.accessToken);
    await expect(
      new JsonAccountStore(
        c.accountsFile,
        randomBytes(32).toString("hex"),
      ).load(),
    ).rejects.toThrow("authentication failed");
    const rows = JSON.parse(disk);
    rows[0].igId = "other";
    await writeFile(c.accountsFile, JSON.stringify(rows));
    await expect(store.load()).rejects.toThrow("authentication failed");
  });
  it("serializes concurrent writes from separate store instances", async () => {
    const c = testConfig();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey).upsert(
          sampleAccount(`account-${i}`),
        ),
      ),
    );
    expect(
      await new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey).load(),
    ).toHaveLength(25);
  });
  it("preserves corrupt and plaintext files rather than treating them as empty", async () => {
    const c = testConfig();
    await writeFile(c.accountsFile, "{broken");
    const store = new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey);
    await expect(store.load()).rejects.toThrow();
    expect(await readFile(c.accountsFile, "utf8")).toBe("{broken");
    await writeFile(c.accountsFile, JSON.stringify([sampleAccount()]));
    await expect(store.load()).rejects.toThrow("Plaintext");
  });
});
describe("panel sessions", () => {
  it("requires an allowed Origin, sets safe cookies, blocks cross-origin writes and revokes logout", async () => {
    const c = testConfig(),
      { app } = await server(c),
      payload = { token: c.clientToken };
    expect(
      (await app.inject({ method: "POST", url: "/api/auth/session", payload }))
        .statusCode,
    ).toBe(403);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      headers: { origin: c.publicUrl },
      payload,
    });
    expect(login.statusCode).toBe(200);
    const header = login.headers["set-cookie"] as string;
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    const cookie = header.split(";")[0]!;
    const good = await app.inject({ url: "/api/status", headers: { cookie } });
    expect(good.statusCode).toBe(200);
    expect(good.body).not.toContain(c.clientToken);
    expect(good.body).not.toContain(c.tokenEncryptionKey);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/settings",
          headers: { cookie, origin: "https://attacker.example" },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/auth/session",
          headers: { cookie, origin: c.publicUrl },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/status", headers: { cookie } }))
        .statusCode,
    ).toBe(401);
  });
  it("limits failed logins and protects OAuth initiation", async () => {
    const c = testConfig(),
      { app } = await server(c);
    expect(
      (await app.inject({ url: "/oauth/instagram/start" })).statusCode,
    ).toBe(401);
    for (let i = 0; i < 10; i++)
      await app.inject({
        method: "POST",
        url: "/api/auth/session",
        headers: { origin: c.publicUrl },
        payload: { token: "wrong" },
      });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/session",
          headers: { origin: c.publicUrl },
          payload: { token: "wrong" },
        })
      ).statusCode,
    ).toBe(429);
  });
  it("does not permit tokens in websocket URLs", async () => {
    const c = testConfig(),
      { app } = await server(c);
    const res = await app.inject({
      url: `/ws?token=${c.clientToken}`,
      headers: { authorization: `Bearer ${c.clientToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
describe("deletion and messaging boundaries", () => {
  it("deletes complete account data, survives restart and validates signed callbacks", async () => {
    const c = testConfig();
    await seedAccount(c);
    await seedAccount(c, "other", { authorizationSubjectId: "subject-other" });
    const contacts = new JsonContactStore(c.contactsFile),
      comments = new JsonCommentStore(c.commentsFile),
      stats = new JsonStatsRecorder(c.statsFile);
    await contacts.upsert({
      id: "contact",
      accountId: "IG1",
      igsid: "person",
      tags: [],
      attributes: {},
      createdAt: 1,
    });
    await comments.add({
      id: "comment",
      accountId: "IG1",
      text: "private",
      timestamp: 1,
      status: "open",
    });
    await stats.record("sent", { accountId: "IG1" });
    await new JsonFile(c.automationsFile, () => ({})).replace({
      automations: [{ id: "a", accountId: "IG1" }],
      flows: { IG1: [] },
      iceBreakers: { IG1: [] },
    });
    await new ScheduledStore(c.scheduledFile).add({
      id: "post",
      igId: "IG1",
      type: "image",
      url: "https://example.com/a.jpg",
      scheduleAt: Date.now() + 600000,
      status: "pending",
      createdAt: 1,
    });
    await mkdir(c.uploadsDir, { recursive: true });
    const name = "00000000-0000-4000-8000-000000000000.jpg";
    await writeFile(join(c.uploadsDir, name), "fixture");
    await new JsonFile(c.uploadsFile, () => []).replace([
      { name, accountId: "IG1", mime: "image/jpeg", createdAt: Date.now() },
    ]);
    const { app } = await server(c);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/privacy/data-deletion",
          payload: { signed_request: "invalid" },
        })
      ).statusCode,
    ).toBe(400);
    const payload = Buffer.from(
        JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "subject-1" }),
      ).toString("base64url"),
      sig = createHmac("sha256", c.metaAppSecret || "callback-test-secret")
        .update(payload)
        .digest("base64url");
    // Rebuild with a configured webhook secret for the signed callback.
    c.metaAppSecret = "callback-test-secret";
    const res = await app.inject({
      method: "POST",
      url: "/privacy/data-deletion",
      payload: { signed_request: `${sig}.${payload}` },
    });
    expect(res.statusCode).toBe(200);
    expect(
      (
        await new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey).load()
      ).map((a) => a.igId),
    ).toEqual(["other"]);
    expect(await contacts.list("IG1")).toEqual([]);
    expect(await comments.list("IG1")).toEqual([]);
    expect((await stats.snapshot()).totals.sent).toBe(0);
    expect(await new ScheduledStore(c.scheduledFile).load()).toEqual([]);
    await expect(readFile(join(c.uploadsDir, name))).rejects.toThrow();
    const statusUrl = new URL(res.json().url);
    expect(
      (await app.inject({ url: statusUrl.pathname + statusUrl.search })).body,
    ).toContain("Deletion completed");
    expect(
      (await app.inject({ url: "/privacy/data-deletion/status?code=unknown" }))
        .statusCode,
    ).toBe(404);
  });
  it("rejects messages outside the verified window and rejects oversized Unicode text", async () => {
    const c = testConfig();
    await seedAccount(c);
    const { app } = await server(c),
      headers = { authorization: `Bearer ${c.clientToken}` };
    const send = (body: object) =>
      app.inject({
        method: "POST",
        url: "/api/accounts/IG1/send",
        headers,
        payload: body,
      });
    expect(
      (await send({ recipientId: "unknown", text: "hello" })).statusCode,
    ).toBe(403);
    expect(
      (await send({ recipientId: "unknown", text: "hello", humanAgent: true }))
        .statusCode,
    ).toBe(403);
    expect(
      (await send({ recipientId: "unknown", text: "🙂".repeat(251) }))
        .statusCode,
    ).toBe(400);
  });
  it("never fabricates quota when Meta fails", async () => {
    const c = testConfig();
    await seedAccount(c);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 190 } }), {
          status: 400,
        }),
      ),
    );
    const { app } = await server(c);
    const res = await app.inject({
      url: "/api/accounts/IG1/publish-limit",
      headers: { authorization: `Bearer ${c.clientToken}` },
    });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('"total"');
  });
  it("blocks executable uploads and formula injection in CSV", async () => {
    const c = testConfig();
    await seedAccount(c);
    const { app } = await server(c);
    const boundary = "testboundary";
    const res = await app.inject({
      method: "POST",
      url: "/api/accounts/IG1/upload",
      headers: {
        authorization: `Bearer ${c.clientToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.svg"\r\nContent-Type: image/svg+xml\r\n\r\n<svg/>\r\n--${boundary}--\r\n`,
    });
    expect(res.statusCode).toBe(415);
    expect(csvCell("=HYPERLINK(1)")).toBe('"\'=HYPERLINK(1)"');
  });
});
