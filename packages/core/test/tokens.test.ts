import { describe, expect, it, vi } from "vitest";
import { TokenManager } from "../src/tokens/manager.js";
import type { Account } from "@app/shared";

const store = () => ({
  get: vi.fn(async () => "old-token"),
  set: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
});
describe("legacy token refresh", () => {
  it.each([
    {},
    { access_token: "new" },
    { access_token: "new", expires_in: 0 },
    { access_token: "new", expires_in: -1 },
    { access_token: "new", expires_in: "3600" },
    { access_token: "", expires_in: 3600 },
  ])("rejects incomplete refresh metadata: %j", async (body) => {
    const manager = new TokenManager({
      store: store(),
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify(body))),
    });
    await expect(manager.refreshLongLived("old-token")).rejects.toThrow(
      "valid refreshed token and expiry",
    );
  });
  it("uses the actual refreshed expiry and sets a network timeout", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "new-token", expires_in: 12345 }),
        ),
      );
    const manager = new TokenManager({ store: store(), fetchImpl: fetcher });
    expect(await manager.refreshLongLived("old-token")).toEqual({
      token: "new-token",
      expiresInSeconds: 12345,
    });
    expect(fetcher.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });
  it("does not return expired tokens or try to refresh them", async () => {
    const fetcher = vi.fn(),
      manager = new TokenManager({
        store: store(),
        clock: { now: () => 5000 },
        fetchImpl: fetcher,
      });
    await expect(
      manager.getToken({
        tokenExpiresAt: 4000,
        accessTokenRef: "ref",
        loginMethod: "instagram_login",
      } as Account),
    ).rejects.toThrow("expired");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never copies Meta error details into token refresh logs", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const manager = new TokenManager({
      store: store(),
      clock: { now: () => 5000 },
      logger,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: "old-token private URL" } }),
            { status: 400 },
          ),
        ),
    });
    expect(
      await manager.getToken({
        id: "account",
        tokenExpiresAt: 9000,
        accessTokenRef: "ref",
        loginMethod: "instagram_login",
      } as Account),
    ).toBe("old-token");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("old-token");
  });
});
