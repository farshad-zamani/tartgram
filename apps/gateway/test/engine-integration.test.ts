import { testConfig, seedAccount } from "./helpers.js";
import { createHmac } from "node:crypto";
import {
  AutomationEngine,
  createInMemoryRepositories,
  silentLogger,
  uuidIdGenerator,
  type InstagramApi,
  type Repositories,
} from "@app/core";
import type { Account, Automation, Flow, MessageContent } from "@app/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayConfig } from "../src/config.js";
import { buildServer, type BuiltServer } from "../src/server.js";

const config = testConfig({
  host: "127.0.0.1",
  port: 0,
  logLevel: "silent",
  metaAppSecret: "secret_integration",
  metaVerifyToken: "v",
  clientToken: "c",
  dedupeTtlMs: 60_000,
  metaAppId: "",
  oauthRedirectUri: "https://tartgram.example.com/oauth/instagram/callback",
  accountsFile: "accounts.test.json",
  automationsFile: "automations.test.json",
});

function sign(body: string): string {
  return (
    "sha256=" +
    createHmac("sha256", config.metaAppSecret)
      .update(Buffer.from(body, "utf8"))
      .digest("hex")
  );
}

class FakeApi implements InstagramApi {
  privateReplies: { commentId: string; content: MessageContent }[] = [];
  async sendMessage() {
    return {};
  }
  async sendPrivateReply(commentId: string, content: MessageContent) {
    this.privateReplies.push({ commentId, content });
    return { message_id: "pr" };
  }
  async replyToComment() {
    return {};
  }
  async setCommentHidden() {
    return {};
  }
  async getUserProfile() {
    return {};
  }
}

describe("gateway runs the engine on webhooks (cloud mode)", () => {
  let built: BuiltServer;
  const api = new FakeApi();

  beforeAll(async () => {
    const repos: Repositories = createInMemoryRepositories();
    const account: Account = {
      id: "IGACC",
      igId: "IGACC",
      username: "shop",
      loginMethod: "instagram_login",
      accessTokenRef: "IGACC",
      scopes: [],
      connectedAt: 0,
      active: true,
    };
    const flow: Flow = {
      id: "f1",
      name: "price",
      startNodeId: "n1",
      nodes: [
        {
          kind: "send",
          id: "n1",
          message: {
            type: "text",
            text: "لینک: https://shop.example",
            quickReplies: [],
          },
        },
      ],
    };
    const automation: Automation = {
      id: "a1",
      accountId: "IGACC",
      name: "price->DM",
      enabled: true,
      trigger: {
        kind: "comment",
        keyword: {
          mode: "any",
          matchAll: false,
          caseSensitive: false,
          include: ["قیمت"],
          exclude: [],
        },
        mediaIds: [],
        includeLive: false,
      },
      flowId: "f1",
      commentAction: { privateReply: true, hideComment: false },
      createdAt: 0,
      updatedAt: 0,
    };
    await repos.accounts.upsert(account);
    await repos.flows.upsert("IGACC", flow);
    await repos.automations.upsert(automation);

    const engine = new AutomationEngine({
      repos,
      getApi: () => api,
      logger: silentLogger,
      idGen: uuidIdGenerator,
    });
    await seedAccount(config, "IGACC");
    built = await buildServer(config, { engine });
    await built.app.ready();
  });

  afterAll(async () => {
    await built.app.close();
  });

  it("sends a private reply when a matching comment webhook arrives", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "IGACC",
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field: "comments",
              value: {
                id: "c_live_1",
                text: "قیمت؟",
                from: { id: "u1", username: "buyer" },
              },
            },
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

    // engine.handleEvent runs fire-and-forget; wait a tick for it to complete.
    await new Promise((r) => setTimeout(r, 50));

    expect(api.privateReplies).toHaveLength(1);
    expect(api.privateReplies[0]!.commentId).toBe("c_live_1");
  });
});
