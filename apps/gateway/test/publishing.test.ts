import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphClient } from "@app/core";
import { buildServer, type BuiltServer } from "../src/server.js";
import { JsonAccountStore } from "../src/account-store.js";
import { ScheduledStore, startScheduler } from "../src/publishing.js";
import { testConfig, seedAccount } from "./helpers.js";
const open: BuiltServer[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(open.splice(0).map((s) => s.app.close()));
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
describe("publishing", () => {
  it("stores a future post without sending it immediately and scopes deletion to its account", async () => {
    const c = testConfig();
    await seedAccount(c);
    await seedAccount(c, "other");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const s = await buildServer(c);
    open.push(s);
    await s.app.ready();
    const headers = { authorization: `Bearer ${c.clientToken}` };
    const res = await s.app.inject({
      method: "POST",
      url: "/api/accounts/IG1/publish",
      headers,
      payload: {
        type: "image",
        url: "https://example.com/media.jpg",
        scheduleAt: Date.now() + 600000,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().scheduled).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    await s.app.inject({
      method: "DELETE",
      url: `/api/accounts/other/scheduled/${res.json().post.id}`,
      headers,
    });
    expect(await new ScheduledStore(c.scheduledFile).load()).toHaveLength(1);
  });
  it("checks container readiness, uses header authorization and keeps non-blocking publish warnings", async () => {
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const u = new URL(String(input));
      expect(u.searchParams.has("access_token")).toBe(false);
      expect((init?.headers as Record<string, string>).authorization).toBe(
        "Bearer test-token",
      );
      if (u.pathname.endsWith("/media")) return json({ id: "container" });
      if (u.pathname.endsWith("/container"))
        return json({ status_code: "FINISHED" });
      if (u.pathname.endsWith("/media_publish"))
        return json({ id: "published", config_issue: "CAPTION_NOT_ATTACHED" });
      throw new Error("Unexpected endpoint");
    });
    const client = new GraphClient({
      igUserId: "111",
      baseUrl: "https://graph.facebook.com",
      version: "v26.0",
      getToken: async () => "test-token",
      fetchImpl: fetcher as typeof fetch,
    });
    expect(
      await client.publishImage("https://example.com/a.jpg", "caption"),
    ).toBe("published");
    expect(client.publishWarnings).toEqual(["CAPTION_NOT_ATTACHED"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("publishes scheduled work once and leaves interrupted publishing work uncertain", async () => {
    const c = testConfig();
    await seedAccount(c);
    const scheduled = new ScheduledStore(c.scheduledFile);
    const base = {
      igId: "IG1",
      type: "image" as const,
      url: "https://example.com/a.jpg",
      scheduleAt: 1,
      createdAt: 1,
    };
    await scheduled.add({ ...base, id: "due", status: "pending" });
    await scheduled.add({ ...base, id: "interrupted", status: "publishing" });
    let publications = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const u = new URL(String(input));
        if (u.pathname.endsWith("/content_publishing_limit"))
          return json({
            data: [{ quota_usage: 0, config: { quota_total: 100 } }],
          });
        if (u.pathname.endsWith("/media")) return json({ id: "container" });
        if (u.pathname.endsWith("/container"))
          return json({ status_code: "FINISHED" });
        if (u.pathname.endsWith("/media_publish")) {
          publications++;
          return json({ id: "published" });
        }
        throw new Error("Unexpected endpoint");
      }),
    );
    const logger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };
    const stop = startScheduler({
      accounts: new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey),
      scheduled,
      logger,
      config: c,
      intervalMs: 20,
    });
    try {
      await vi.waitFor(async () =>
        expect(
          (await scheduled.load()).find((p) => p.id === "due")?.status,
        ).toBe("published"),
      );
      expect(
        (await scheduled.load()).find((p) => p.id === "interrupted")?.status,
      ).toBe("uncertain");
      expect(publications).toBe(1);
    } finally {
      await stop();
    }
  });
});
