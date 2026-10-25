import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  connectAccounts,
  OAUTH_SCOPES,
  UNIFIED_SCOPES,
} from "../src/oauth.js";
import { buildServer, type BuiltServer } from "../src/server.js";
import { JsonAccountStore } from "../src/account-store.js";
import { tokenFor, clientForAccount } from "../src/account-client.js";
import { testConfig, seedAccount } from "./helpers.js";
const open: BuiltServer[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(open.splice(0).map((s) => s.app.close()));
});
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json" },
  });
function mockUnified(
  overrides: {
    scopes?: string[];
    subscriptionFailed?: boolean;
    info?: Record<string, unknown>;
    page?: (url: URL) => unknown;
  } = {},
) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/oauth/access_token"))
      return json({ access_token: "test-system-user-token" });
    if (url.pathname.endsWith("/debug_token"))
      return json({
        data: {
          is_valid: true,
          app_id: "100",
          user_id: "subject",
          scopes: overrides.scopes ?? UNIFIED_SCOPES,
          expires_at: 0,
          ...overrides.info,
        },
      });
    if (url.pathname.endsWith("/me"))
      return json({ id: "subject", client_business_id: "business" });
    if (url.pathname.endsWith("/me/assigned_instagram_accounts"))
      return json(
        overrides.page
          ? overrides.page(url)
          : {
              data: [
                { id: "111", username: "example_shop" },
                { id: "222", username: "example_studio" },
              ],
            },
      );
    if (url.pathname.endsWith("/subscribed_apps"))
      return overrides.subscriptionFailed
        ? json({ error: { code: 10 } }, 403)
        : json({ success: true });
    throw new Error(
      `Unexpected endpoint ${url.pathname}, method ${init?.method ?? "GET"}`,
    );
  });
}
describe("official Meta authorization", () => {
  it("refreshes a legacy token only once across concurrent requests", async () => {
    const c = testConfig();
    await seedAccount(c, "legacy", {
      loginMethod: "instagram_login",
      tokenType: "instagram_user",
      expiresAt: Date.now() + 86400_000,
      refreshAfter: Date.now() - 1,
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        json({ access_token: "fresh-token", expires_in: 123456 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const store = new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey);
    expect(
      await Promise.all(
        Array.from({ length: 8 }, () => tokenFor(store, "legacy")),
      ),
    ).toEqual(Array(8).fill("fresh-token"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await store.load())[0]?.expiresAt).toBeGreaterThan(
      Date.now() + 123450_000,
    );
  });
  it("stops using a token when Meta rejects its refresh as revoked", async () => {
    const c = testConfig();
    await seedAccount(c, "legacy", {
      loginMethod: "instagram_login",
      tokenType: "instagram_user",
      expiresAt: Date.now() + 86400_000,
      refreshAfter: Date.now() - 1,
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ error: { code: 190 } }, 400));
    vi.stubGlobal("fetch", fetcher);
    const store = new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey);
    await expect(tokenFor(store, "legacy")).rejects.toThrow("revoked");
    await expect(tokenFor(store, "legacy")).rejects.toThrow("Reconnect");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await store.load())[0]?.reconnectRequired).toBe(true);
  });
  const unifiedConfig = () =>
    testConfig({
      metaAppId: "100",
      metaAppSecret: "test-app-secret",
      metaConfigId: "200",
    });
  it("uses cursor pagination without following remote paging URLs and removes duplicate accounts", async () => {
    const fetcher = mockUnified({
      page: (url) =>
        url.searchParams.get("after")
          ? {
              data: [
                { id: "111", username: "example_shop" },
                { id: "222", username: "studio" },
              ],
            }
          : {
              data: [{ id: "111", username: "example_shop" }],
              paging: {
                next: "https://untrusted.example/steal",
                cursors: { after: "next-page" },
              },
            },
    });
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await connectAccounts(unifiedConfig(), "code")).map((a) => a.igId),
    ).toEqual(["111", "222"]);
    expect(
      fetcher.mock.calls.every(
        ([url]) => new URL(String(url)).hostname === "graph.facebook.com",
      ),
    ).toBe(true);
  });
  it.each([{}, { cursors: {} }, { cursors: { after: "" } }])(
    "rejects an advertised next page without a usable cursor",
    async (paging) => {
      vi.stubGlobal(
        "fetch",
        mockUnified({
          page: () => ({
            data: [{ id: "111", username: "shop" }],
            paging: { ...paging, next: "next" },
          }),
        }),
      );
      await expect(connectAccounts(unifiedConfig(), "code")).rejects.toThrow(
        "pagination",
      );
    },
  );
  it("terminates repeated cursors even when pages are empty", async () => {
    const fetcher = mockUnified({
      page: () => ({
        data: [],
        paging: { next: "next", cursors: { after: "same" } },
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(connectAccounts(unifiedConfig(), "code")).rejects.toThrow(
      "pagination",
    );
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("bounds pagination even when every response advertises a new cursor", async () => {
    let i = 0;
    const fetcher = mockUnified({
      page: () => ({
        data: [],
        paging: { next: "next", cursors: { after: `page-${++i}` } },
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(connectAccounts(unifiedConfig(), "code")).rejects.toThrow(
      "Too many",
    );
    expect(i).toBe(10);
  });
  it.each([null, {}, { id: "111" }, { id: "", username: "shop" }])(
    "rejects incomplete assigned account profiles: %j",
    async (profile) => {
      vi.stubGlobal(
        "fetch",
        mockUnified({ page: () => ({ data: [profile] }) }),
      );
      await expect(connectAccounts(unifiedConfig(), "code")).rejects.toThrow(
        "incomplete account",
      );
    },
  );
  it.each([{ expires_at: 1 }, { expires_at: "0" }, { expires_at: -1 }])(
    "rejects expired or malformed token metadata: %j",
    async (info) => {
      vi.stubGlobal("fetch", mockUnified({ info }));
      await expect(connectAccounts(unifiedConfig(), "code")).rejects.toThrow();
    },
  );
  it("keeps the earlier real authorization or data-access expiry", async () => {
    const earlier = Math.floor(Date.now() / 1000) + 7200;
    vi.stubGlobal(
      "fetch",
      mockUnified({
        info: { expires_at: earlier + 7200, data_access_expires_at: earlier },
      }),
    );
    expect((await connectAccounts(unifiedConfig(), "code"))[0]?.expiresAt).toBe(
      earlier * 1000,
    );
  });
  it("stops calling Meta with a revoked shared authorization until reconnection", async () => {
    const c = testConfig();
    await seedAccount(c, "first");
    await seedAccount(c, "second");
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ error: { code: 190 } }, 400));
    vi.stubGlobal("fetch", fetcher);
    const store = new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey),
      client = (await clientForAccount(store, "first", c))!;
    await expect(client.getRecentMedia()).rejects.toThrow();
    expect((await store.load()).every((a) => a.reconnectRequired)).toBe(true);
    await expect(tokenFor(store, "second")).rejects.toThrow("Reconnect");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses Unified configuration and exchanges for all assigned professional accounts", async () => {
    const c = testConfig({
        metaAppId: "100",
        metaAppSecret: "test-app-secret",
        metaConfigId: "200",
      }),
      fetcher = mockUnified();
    vi.stubGlobal("fetch", fetcher);
    const url = new URL(buildAuthorizeUrl(c, "csrf"));
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("config_id")).toBe("200");
    expect(url.searchParams.has("scope")).toBe(false);
    const accounts = await connectAccounts(c, "test-code");
    expect(accounts.map((a) => a.igId)).toEqual(["111", "222"]);
    expect(accounts[0]?.connectionId).toBe(accounts[1]?.connectionId);
    expect(accounts[0]?.expiresAt).toBeUndefined();
    expect(accounts[0]?.clientBusinessId).toBe("business");
  });
  it("rejects an authorization missing required permissions", async () => {
    const c = testConfig({
      metaAppId: "100",
      metaAppSecret: "test-app-secret",
      metaConfigId: "200",
    });
    vi.stubGlobal("fetch", mockUnified({ scopes: ["instagram_basic"] }));
    await expect(connectAccounts(c, "code")).rejects.toThrow("four requested");
  });
  it("binds single-use state to a browser session and records subscription failures", async () => {
    const c = testConfig({
      metaAppId: "100",
      metaAppSecret: "test-app-secret",
      metaConfigId: "200",
    });
    vi.stubGlobal("fetch", mockUnified({ subscriptionFailed: true }));
    const s = await buildServer(c);
    open.push(s);
    await s.app.ready();
    const login = await s.app.inject({
        method: "POST",
        url: "/api/auth/session",
        headers: { origin: c.publicUrl },
        payload: { token: c.clientToken },
      }),
      cookie = (login.headers["set-cookie"] as string).split(";")[0]!;
    const start = await s.app.inject({
      url: "/oauth/instagram/start",
      headers: { cookie },
    });
    expect(start.statusCode).toBe(302);
    const state = new URL(start.headers.location!).searchParams.get("state")!;
    expect(
      (
        await s.app.inject({
          url: `/oauth/instagram/callback?code=test&state=${state}`,
        })
      ).statusCode,
    ).toBe(400);
    const res = await s.app.inject({
      url: `/oauth/instagram/callback?code=test&state=${state}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("subscription failed");
    const rows = await new JsonAccountStore(
      c.accountsFile,
      c.tokenEncryptionKey,
    ).load();
    expect(rows).toHaveLength(2);
    expect(rows.every((a) => a.subscriptionStatus === "failed")).toBe(true);
    expect(
      (
        await s.app.inject({
          url: `/oauth/instagram/callback?code=test&state=${state}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
  });
  it.each([true, false])(
    "supports official legacy token response shapes (nested=%s)",
    async (nested) => {
      const c = testConfig({
        metaLoginMode: "instagram",
        metaAppSecret: "parent-secret",
        instagramAppId: "legacy-id",
        instagramAppSecret: "legacy-secret",
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL) => {
          const url = new URL(String(input));
          if (url.hostname === "api.instagram.com") {
            const row = {
              access_token: "short",
              user_id: "subject",
              permissions: OAUTH_SCOPES.join(","),
            };
            return json(nested ? { data: [row] } : row);
          }
          if (url.pathname === "/access_token")
            return json({ access_token: "long", expires_in: 5184000 });
          if (url.pathname.endsWith("/me"))
            return json({ user_id: "333", username: "example_legacy" });
          throw new Error("Unexpected endpoint");
        }),
      );
      expect(new URL(buildAuthorizeUrl(c, "state")).hostname).toBe(
        "www.instagram.com",
      );
      const [account] = await connectAccounts(c, "code");
      expect(account?.loginMethod).toBe("instagram_login");
      expect(account?.igId).toBe("333");
      expect(account?.expiresAt).toBeGreaterThan(Date.now());
    },
  );
  it("does not refresh expired or Unified tokens through the legacy refresh endpoint", async () => {
    const c = testConfig();
    await seedAccount(c, "expired", { expiresAt: Date.now() - 1 });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const store = new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey);
    await expect(tokenFor(store, "expired")).rejects.toThrow("expired");
    await seedAccount(c, "unified", { expiresAt: Date.now() + 10000 });
    expect(await tokenFor(store, "unified")).toBe("test-meta-access-token");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
