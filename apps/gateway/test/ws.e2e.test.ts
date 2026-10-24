import { testConfig, seedAccount } from "./helpers.js";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { GatewayConfig } from "../src/config.js";
import { buildServer, type BuiltServer } from "../src/server.js";

const config = testConfig({
  host: "127.0.0.1",
  port: 0, // ephemeral
  logLevel: "silent",
  metaAppSecret: "app_secret_e2e",
  metaVerifyToken: "verify_e2e",
  clientToken: "client_e2e",
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

function waitForMessage(
  ws: WebSocket,
  predicate: (m: any) => boolean,
  timeoutMs = 3000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for message")),
      timeoutMs,
    );
    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString("utf8"));
      if (predicate(msg)) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
}

describe("gateway websocket end-to-end", () => {
  let built: BuiltServer;
  let baseUrl: string;
  let wsUrl: string;

  beforeAll(async () => {
    await seedAccount(config, "acc_live");
    built = await buildServer(config);
    await built.app.listen({ host: config.host, port: 0 });
    const addr = built.app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    wsUrl = `ws://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    for (const socket of built.app.websocketServer.clients) socket.terminate();
    built.app.server.closeIdleConnections();
    await built.app.close();
  });

  it("delivers a signed webhook to a live WS client over the network", async () => {
    const ws = new WebSocket(`${wsUrl}/ws?accounts=acc_live`, {
      headers: { authorization: `Bearer ${config.clientToken}` },
    });
    await waitForMessage(ws, (m) => m.kind === "ready");

    const eventPromise = waitForMessage(ws, (m) => m.kind === "event");

    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "acc_live",
          time: 1_700_000_000,
          changes: [
            {
              field: "comments",
              value: { id: "live_comment_1", text: "لینک" },
            },
          ],
        },
      ],
    });
    const res = await fetch(`${baseUrl}/webhooks/instagram`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
      body,
    });
    expect(res.status).toBe(200);
    await res.json();

    const event = await eventPromise;
    expect(event.event.type).toBe("comment");
    expect(event.event.commentId).toBe("live_comment_1");
    expect(event.event.text).toBe("لینک");

    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      ws.close();
    });
  });

  it("rejects a WS client presenting the wrong token", async () => {
    const ws = new WebSocket(`${wsUrl}/ws?accounts=acc_live`, {
      headers: { authorization: "Bearer WRONG" },
    });
    const status = await new Promise<number>((resolve) => {
      ws.on("unexpected-response", (_req, res) => {
        res.resume();
        res.socket?.destroy();
        resolve(res.statusCode!);
      });
      ws.on("error", () => {});
    });
    expect(status).toBe(401);
  });

  it("serves /healthz", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
