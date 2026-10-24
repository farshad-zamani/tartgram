import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyChallenge,
  verifyWebhookSignature,
} from "../src/webhook/signature.js";

const SECRET = "test_app_secret";

function sign(body: string, secret = SECRET): string {
  return (
    "sha256=" +
    createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex")
  );
}

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });

  it("accepts a correct signature over the raw body", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("accepts when the raw body is a Buffer", () => {
    expect(
      verifyWebhookSignature(Buffer.from(body, "utf8"), sign(body), SECRET),
    ).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(
      verifyWebhookSignature(body, sign(body, "wrong_secret"), SECRET),
    ).toBe(false);
  });

  it("rejects when the body was tampered with", () => {
    const good = sign(body);
    expect(verifyWebhookSignature(body + " ", good, SECRET)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abcdef", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zzzz", SECRET)).toBe(false);
  });

  it("rejects when app secret is empty", () => {
    expect(verifyWebhookSignature(body, sign(body), "")).toBe(false);
  });
});

describe("verifyChallenge", () => {
  it("echoes the challenge when mode and token match", () => {
    expect(
      verifyChallenge(
        { mode: "subscribe", token: "verify_me", challenge: "1234" },
        "verify_me",
      ),
    ).toBe("1234");
  });

  it("returns null on token mismatch", () => {
    expect(
      verifyChallenge(
        { mode: "subscribe", token: "nope", challenge: "1234" },
        "verify_me",
      ),
    ).toBeNull();
  });

  it("returns null when mode is not subscribe", () => {
    expect(
      verifyChallenge(
        { mode: "unsubscribe", token: "verify_me", challenge: "1234" },
        "verify_me",
      ),
    ).toBeNull();
  });
});
