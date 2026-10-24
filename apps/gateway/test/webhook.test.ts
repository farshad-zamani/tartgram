import { testConfig, seedAccount } from "./helpers.js";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GatewayConfig } from "../src/config.js";
import { buildServer, type BuiltServer } from "../src/server.js";
import type { HubClient } from "../src/hub.js";

const config = testConfig({
  host: "127.0.0.1",
  port: 0,
  logLevel: "silent",
  metaAppSecret: "app_secret_123",
  metaVerifyToken: "verify_123",
  clientToken: "client_123",
  dedupeTtlMs: 60_000,
  metaAppId: "",
  oauthRedirectUri: "https://tartgram.example.com/oauth/instagram/callback",
  accountsFile: "accounts.test.json",
});

function sign(body: string): string {
  return (
    "sha256=" +
    createHmac("sha256", config.metaAppSecret)
      .update(Buffer.from(body, "utf8"))
      .digest("hex")
  );
}

function captureClient(accounts: string[]): HubClient & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    id: "test-client",
    accounts: new Set(accounts),
    send: (data) => sent.push(JSON.parse(data)),
    isOpen: () => true,
    sent,
  };
}

describe("gateway webhook routes", () => {
  let built: BuiltServer;

  beforeAll(async () => {
    for (const id of ["17841400000000000", "acc_dedupe"])
      await seedAccount(config, id);
    built = await buildServer(config);
    await built.app.ready();
  });

  afterAll(async () => {
    await built.app.close();
  });

  it("echoes the challenge on a valid verification handshake", async () => {
    const res = await built.app.inject({
      method: "GET",
      url: "/webhooks/instagram",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "verify_123",
        "hub.challenge": "42",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("42");
  });

  it("rejects the handshake with a wrong verify token", async () => {
    const res = await built.app.inject({
      method: "GET",
      url: "/webhooks/instagram",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "nope",
        "hub.challenge": "42",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a webhook POST with an invalid signature", async () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    const res = await built.app.inject({
      method: "POST",
      url: "/webhooks/instagram",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=deadbeef",
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a signed webhook and fans it out to the subscribed client", async () => {
    const client = captureClient(["17841400000000000"]);
    built.hub.add(client);

    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "17841400000000000",
          time: 1_700_000_000,
          changes: [
            { field: "comments", value: { id: "comment_x", text: "قیمت؟" } },
          ],
        },
      ],
    });

    const res = await built.app.inject({
      method: "POST",
      url: "/webhooks/instagram",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(client.sent).toHaveLength(1));
    const msg = client.sent[0] as {
      kind: string;
      event: { commentId: string };
    };
    expect(msg.kind).toBe("event");
    expect(msg.event.commentId).toBe("comment_x");

    built.hub.remove(client);
  });

  it("deduplicates redelivered events", async () => {
    const client = captureClient(["acc_dedupe"]);
    built.hub.add(client);

    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "acc_dedupe",
          changes: [{ field: "comments", value: { id: "dupe_1", text: "x" } }],
        },
      ],
    });
    const headers = {
      "content-type": "application/json",
      "x-hub-signature-256": sign(body),
    };

    await built.app.inject({
      method: "POST",
      url: "/webhooks/instagram",
      headers,
      payload: body,
    });
    await built.app.inject({
      method: "POST",
      url: "/webhooks/instagram",
      headers,
      payload: body,
    });

    await vi.waitFor(() => expect(client.sent).toHaveLength(1));
    built.hub.remove(client);
  });
});
