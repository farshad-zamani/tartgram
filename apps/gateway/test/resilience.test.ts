import { createHmac } from "node:crypto";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer, type BuiltServer } from "../src/server.js";
import { ScheduledStore, startScheduler } from "../src/publishing.js";
import { JsonAccountStore } from "../src/account-store.js";
import { JsonContactStore } from "../src/contacts-store.js";
import { JsonFile } from "../src/storage.js";
import { testConfig, seedAccount } from "./helpers.js";

const servers: BuiltServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.app.close()));
  vi.unstubAllGlobals();
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
async function setup() {
  const config = testConfig({ metaAppSecret: "synthetic-app-secret" });
  await seedAccount(config);
  const built = await buildServer(config);
  servers.push(built);
  await built.app.ready();
  return {
    config,
    ...built,
    headers: { authorization: `Bearer ${config.clientToken}` },
  };
}
function publishMock(final: () => Promise<Response>) {
  return vi.fn(async (input: string | URL) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/content_publishing_limit"))
      return json({ data: [{ quota_usage: 0, config: { quota_total: 100 } }] });
    if (path.endsWith("/media")) return json({ id: "container" });
    if (path.endsWith("/container")) return json({ status_code: "FINISHED" });
    if (path.endsWith("/media_publish")) return final();
    throw new Error("Unexpected mock endpoint");
  });
}

describe("publication failure boundaries", () => {
  it("persists an uncertain immediate publication and never replays it on restart", async () => {
    const { app, config, headers } = await setup();
    const fetcher = publishMock(async () => {
      throw new TypeError("response was lost");
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await app.inject({
      method: "POST",
      url: "/api/accounts/IG1/publish",
      headers,
      payload: { type: "image", url: "https://example.com/a.jpg" },
    });
    expect(result.statusCode).toBe(409);
    expect(result.json().error).toBe("publish_outcome_unknown");
    const scheduled = new ScheduledStore(config.scheduledFile);
    expect((await scheduled.load())[0]).toMatchObject({
      status: "uncertain",
      containerId: "container",
    });
    await app.close();
    servers.pop();
    const next = await buildServer(config);
    servers.push(next);
    await next.app.ready();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("retains successful immediate publications and their non-blocking warnings", async () => {
    const { app, config, headers } = await setup();
    vi.stubGlobal(
      "fetch",
      publishMock(async () =>
        json({ id: "post", config_issue: "CAPTION_NOT_ATTACHED" }),
      ),
    );
    const result = await app.inject({
      method: "POST",
      url: "/api/accounts/IG1/publish",
      headers,
      payload: {
        type: "story",
        url: "https://example.com/a.jpg",
        caption: "Story caption",
      },
    });
    expect(result.statusCode).toBe(200);
    expect(
      (await new ScheduledStore(config.scheduledFile).load())[0],
    ).toMatchObject({
      status: "published",
      publishedMediaId: "post",
      warnings: ["CAPTION_NOT_ATTACHED"],
    });
  });
  it("marks a timed-out scheduled publication uncertain and does not retry it on later ticks", async () => {
    const c = testConfig();
    await seedAccount(c);
    const scheduled = new ScheduledStore(c.scheduledFile);
    await scheduled.add({
      id: "due",
      igId: "IG1",
      type: "image",
      url: "https://example.com/a.jpg",
      scheduleAt: 1,
      createdAt: 1,
      status: "pending",
    });
    const fetcher = publishMock(async () => json({ error: { code: 2 } }, 503));
    vi.stubGlobal("fetch", fetcher);
    const stop = startScheduler({
      accounts: new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey),
      scheduled,
      config: c,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      intervalMs: 10,
    });
    try {
      await vi.waitFor(async () =>
        expect((await scheduled.load())[0]?.status).toBe("uncertain"),
      );
      await new Promise((r) => setTimeout(r, 40));
      expect(fetcher).toHaveBeenCalledTimes(4);
    } finally {
      await stop();
    }
  });
  it.each([-1, "100", null])(
    "rejects malformed quota values without publishing: %j",
    async (quota) => {
      const { app, headers } = await setup();
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          json({ data: [{ quota_usage: 0, config: { quota_total: quota } }] }),
        );
      vi.stubGlobal("fetch", fetcher);
      const result = await app.inject({
        method: "POST",
        url: "/api/accounts/IG1/publish",
        headers,
        payload: { type: "image", url: "https://example.com/a.jpg" },
      });
      expect(result.statusCode).toBe(502);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
});

describe("inbox and privacy failure boundaries", () => {
  it("rejects cyclic flows at the management boundary", async () => {
    const { app, headers } = await setup();
    const result = await app.inject({
      method: "PUT",
      url: "/api/automations",
      headers,
      payload: {
        automations: [],
        flows: {
          IG1: [
            {
              id: "flow",
              name: "Example",
              startNodeId: "node",
              nodes: [
                {
                  id: "node",
                  kind: "send",
                  next: "node",
                  message: { type: "text", text: "Example", quickReplies: [] },
                },
              ],
            },
          ],
        },
      },
    });
    expect(result.statusCode).toBe(400);
  });
  it("reports a failed comment synchronization instead of a false empty success", async () => {
    const { app, headers } = await setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { code: 10 } }, 403)),
    );
    const result = await app.inject({
      url: "/api/accounts/IG1/comments",
      headers,
    });
    expect(result.statusCode).toBe(502);
    expect(result.json().error).toBe("comment_sync_failed");
  });
  it("sends replies to a specific message through Meta's top-level reply_to object", async () => {
    const { app, config, headers } = await setup();
    await new JsonContactStore(config.contactsFile).upsert({
      id: "contact",
      accountId: "IG1",
      igsid: "person",
      tags: [],
      attributes: {},
      createdAt: 1,
      lastInboundAt: Date.now() - 1000,
    });
    const fetcher = vi.fn().mockResolvedValue(json({ message_id: "reply" }));
    vi.stubGlobal("fetch", fetcher);
    const result = await app.inject({
      method: "POST",
      url: "/api/accounts/IG1/send",
      headers,
      payload: { recipientId: "person", text: "Hello", replyToMid: "original" },
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
      reply_to: { mid: "original" },
      message: { text: "Hello" },
    });
  });
  it("requires the messaging window for replies to past messages too", async () => {
    const { app, headers } = await setup();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await app.inject({
      method: "POST",
      url: "/api/accounts/IG1/send",
      headers,
      payload: { recipientId: "person", text: "Hello", replyToMid: "original" },
    });
    expect(result.statusCode).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not claim completed deletion for an unmapped person's business authorization", async () => {
    const { app, config } = await setup();
    const payload = Buffer.from(
      JSON.stringify({
        algorithm: "HMAC-SHA256",
        user_id: "person-not-system-user",
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", config.metaAppSecret)
      .update(payload)
      .digest("base64url");
    const result = await app.inject({
      method: "POST",
      url: "/privacy/data-deletion",
      payload: { signed_request: `${signature}.${payload}` },
    });
    const status = await app.inject({
      url:
        new URL(result.json().url).pathname + new URL(result.json().url).search,
    });
    expect(status.body).toContain("Deletion needs attention");
    expect(status.body).not.toContain("Deletion completed");
    expect(
      await new JsonAccountStore(
        config.accountsFile,
        config.tokenEncryptionKey,
      ).load(),
    ).toHaveLength(1);
  });
  it("expires status links after 30 days even when no new request arrives", async () => {
    const { app, config } = await setup();
    await new JsonFile(config.deletionsFile, () => ({})).replace({
      expired: { status: "completed", createdAt: Date.now() - 31 * 86400_000 },
    });
    expect(
      (await app.inject({ url: "/privacy/data-deletion/status?code=expired" }))
        .statusCode,
    ).toBe(404);
  });
  it("shows expired connections as needing attention", async () => {
    const { app, config, headers } = await setup();
    await seedAccount(config, "IG1", { expiresAt: Date.now() - 1000 });
    const result = await app.inject({ url: "/api/status", headers });
    expect(result.json().accounts[0].reconnectRequired).toBe(true);
  });
});

describe("upload ownership and cleanup", () => {
  it("rejects a disguised executable and removes its staging file", async () => {
    const { app, config, headers } = await setup();
    const result = await app.inject({
      method: "POST",
      url: "/api/accounts/IG1/upload",
      headers: {
        ...headers,
        "content-type": "multipart/form-data; boundary=fixture",
      },
      payload:
        '--fixture\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n<html>not a jpeg</html>\r\n--fixture--\r\n',
    });
    expect(result.statusCode).toBe(415);
    expect(await readdir(config.uploadsDir)).toEqual([]);
  });
  it("publishes a validated upload atomically and records its owner", async () => {
    const { app, config, headers } = await setup();
    const result = await app.inject({
      method: "POST",
      url: "/api/accounts/IG1/upload",
      headers: {
        ...headers,
        "content-type": "multipart/form-data; boundary=fixture",
      },
      payload: Buffer.concat([
        Buffer.from(
          '--fixture\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n',
        ),
        Buffer.from([255, 216, 255, 224, 0, 0]),
        Buffer.from("\r\n--fixture--\r\n"),
      ]),
    });
    expect(result.statusCode).toBe(200);
    const name = new URL(result.json().url).pathname.split("/").pop()!;
    expect(await readdir(config.uploadsDir)).toEqual([name]);
    expect(
      JSON.parse(await readFile(config.uploadsFile, "utf8"))[0],
    ).toMatchObject({ name, accountId: "IG1" });
    await seedAccount(config, "other");
    const crossAccount = await app.inject({
      method: "POST",
      url: "/api/accounts/other/publish",
      headers,
      payload: {
        type: "image",
        url: result.json().url,
        scheduleAt: Date.now() + 600000,
      },
    });
    expect(crossAccount.statusCode).toBe(400);
  });
  it("keeps media for uncertain publications while cleaning old unused media", async () => {
    const config = testConfig();
    await seedAccount(config);
    await mkdir(config.uploadsDir, { recursive: true });
    const names = [
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg",
    ];
    for (const name of names)
      await writeFile(join(config.uploadsDir, name), "fixture");
    await new JsonFile(config.uploadsFile, () => []).replace(
      names.map((name) => ({
        name,
        accountId: "IG1",
        mime: "image/jpeg",
        createdAt: 1,
      })),
    );
    await new ScheduledStore(config.scheduledFile).add({
      id: "uncertain",
      igId: "IG1",
      type: "image",
      url: `${config.publicUrl}/uploads/${names[0]}`,
      scheduleAt: 1,
      createdAt: 1,
      status: "uncertain",
    });
    const built = await buildServer(config);
    servers.push(built);
    await built.app.ready();
    expect(await readdir(config.uploadsDir)).toEqual([names[0]]);
  });
});
