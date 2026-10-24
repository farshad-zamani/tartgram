import { testConfig, seedAccount } from "./helpers.js";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayConfig } from "../src/config.js";
import { buildServer, type BuiltServer } from "../src/server.js";

const stamp = Date.now();
const config = testConfig({
  host: "127.0.0.1",
  port: 0,
  logLevel: "silent",
  metaAppSecret: "s",
  metaVerifyToken: "v",
  clientToken: "mgmt_token",
  dedupeTtlMs: 60_000,
  metaAppId: "",
  oauthRedirectUri: "https://tartgram.example.com/oauth/instagram/callback",
  accountsFile: join(tmpdir(), `mgmt.accounts.${stamp}.json`),
  automationsFile: join(tmpdir(), `mgmt.automations.${stamp}.json`),
  spaDir: join(tmpdir(), `no-such-spa-${stamp}`),
});

const AUTH = { authorization: "Bearer mgmt_token" };

describe("management API", () => {
  let built: BuiltServer;

  beforeAll(async () => {
    await seedAccount(config);
    await writeFile(
      config.automationsFile,
      JSON.stringify({ automations: [], flows: {} }),
    );
    built = await buildServer(config);
    await built.app.ready();
  });
  afterAll(async () => built.app.close());

  it("rejects unauthenticated requests", async () => {
    const res = await built.app.inject({ method: "GET", url: "/api/status" });
    expect(res.statusCode).toBe(401);
  });

  it("returns status with connected accounts", async () => {
    const res = await built.app.inject({
      method: "GET",
      url: "/api/status",
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const json = res.json() as {
      engine: boolean;
      accounts: { username: string }[];
      connectUrl: string;
    };
    expect(json.accounts[0]?.username).toBe("shop");
    expect(json.connectUrl).toContain("/oauth/instagram/start");
  });

  it("does not leak access tokens in the accounts list", async () => {
    const res = await built.app.inject({
      method: "GET",
      url: "/api/accounts",
      headers: AUTH,
    });
    expect(res.body).not.toContain("accessToken");
  });

  it("validates and saves automations, then reads them back", async () => {
    const payload = {
      automations: [
        {
          id: "a1",
          accountId: "IG1",
          name: "قیمت",
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
        },
      ],
      flows: {
        IG1: [
          {
            id: "f1",
            name: "f",
            startNodeId: "n1",
            nodes: [
              {
                kind: "send",
                id: "n1",
                message: { type: "text", text: "hi", quickReplies: [] },
              },
            ],
          },
        ],
      },
    };
    const put = await built.app.inject({
      method: "PUT",
      url: "/api/automations",
      headers: AUTH,
      payload,
    });
    expect(put.statusCode).toBe(200);

    const get = await built.app.inject({
      method: "GET",
      url: "/api/automations",
      headers: AUTH,
    });
    expect((get.json() as { automations: unknown[] }).automations).toHaveLength(
      1,
    );
  });

  it("rejects invalid automations payloads", async () => {
    const res = await built.app.inject({
      method: "PUT",
      url: "/api/automations",
      headers: AUTH,
      payload: { automations: "nope" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns an empty ice-breaker list initially", async () => {
    const res = await built.app.inject({
      method: "GET",
      url: "/api/accounts/IG1/ice-breakers",
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("rejects more than 4 ice breakers", async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      question: `q${i}`,
      response: `r${i}`,
    }));
    const res = await built.app.inject({
      method: "PUT",
      url: "/api/accounts/IG1/ice-breakers",
      headers: AUTH,
      payload: five,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects ice breakers missing a question or response", async () => {
    const res = await built.app.inject({
      method: "PUT",
      url: "/api/accounts/IG1/ice-breakers",
      headers: AUTH,
      payload: [{ question: "", response: "x" }],
    });
    expect(res.statusCode).toBe(400);
  });
});
