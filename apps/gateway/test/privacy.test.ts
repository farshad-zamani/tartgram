import { testConfig, seedAccount } from "./helpers.js";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayConfig } from "../src/config.js";
import { parseSignedRequest } from "../src/oauth.js";
import { buildServer, type BuiltServer } from "../src/server.js";

const SECRET = "priv_secret";

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function makeSignedRequest(payload: object, secret = SECRET): string {
  const p = b64url(
    Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", ...payload })),
  );
  const sig = b64url(createHmac("sha256", secret).update(p).digest());
  return `${sig}.${p}`;
}

describe("parseSignedRequest", () => {
  it("verifies and decodes a valid signed_request", () => {
    const sr = makeSignedRequest({ user_id: "123", algorithm: "HMAC-SHA256" });
    expect(parseSignedRequest(sr, SECRET)?.user_id).toBe("123");
  });
  it("rejects a signed_request signed with the wrong secret", () => {
    const sr = makeSignedRequest({ user_id: "123" }, "wrong");
    expect(parseSignedRequest(sr, SECRET)).toBeNull();
  });
  it("rejects malformed input", () => {
    expect(parseSignedRequest("not-a-signed-request", SECRET)).toBeNull();
  });
});

describe("privacy routes", () => {
  let built: BuiltServer;
  const config = testConfig({
    host: "127.0.0.1",
    port: 0,
    logLevel: "silent",
    metaAppSecret: SECRET,
    metaVerifyToken: "v",
    clientToken: "c",
    dedupeTtlMs: 60_000,
    metaAppId: "",
    oauthRedirectUri: "https://tartgram.example.com/oauth/instagram/callback",
    accountsFile: join(tmpdir(), `accounts.privacy.${Date.now()}.json`),
  });

  beforeAll(async () => {
    built = await buildServer(config);
    await built.app.ready();
  });
  afterAll(async () => {
    await built.app.close();
  });

  it("data-deletion returns a status url and confirmation code", async () => {
    const res = await built.app.inject({
      method: "POST",
      url: "/privacy/data-deletion",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `signed_request=${encodeURIComponent(makeSignedRequest({ user_id: "999" }))}`,
    });
    expect(res.statusCode).toBe(200);
    const json = res.json() as { url: string; confirmation_code: string };
    expect(json.confirmation_code).toBeTruthy();
    expect(json.url).toContain("/privacy/data-deletion/status?code=");
  });

  it("deauthorize acknowledges with 200", async () => {
    const res = await built.app.inject({
      method: "POST",
      url: "/oauth/instagram/deauthorize",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `signed_request=${encodeURIComponent(makeSignedRequest({ user_id: "999" }))}`,
    });
    expect(res.statusCode).toBe(200);
  });
});
