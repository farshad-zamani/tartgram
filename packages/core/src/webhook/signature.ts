import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Meta's `X-Hub-Signature-256` header against the raw request body.
 *
 * Meta signs the exact bytes of the payload with HMAC-SHA256 keyed by the app secret and sends
 * `sha256=<hex>`. We MUST compute the HMAC over the raw body (not a re-serialized object) and use a
 * constant-time comparison to avoid leaking timing information.
 *
 * @param rawBody   The exact bytes received (Buffer or string). Never JSON.stringify(parsedBody).
 * @param header    Value of the `x-hub-signature-256` header (may be undefined).
 * @param appSecret The Meta App secret.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  header: string | undefined | null,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;

  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return false;
  const provided = header.slice(prefix.length).trim();
  if (provided.length === 0) return false;

  const body =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha256", appSecret).update(body).digest("hex");

  // Both are hex strings of equal length when valid; guard length before timingSafeEqual.
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;

  return timingSafeEqual(a, b);
}

/**
 * Handle Meta's webhook verification GET handshake.
 * Returns the challenge string to echo back when the mode and token match, otherwise null.
 */
export function verifyChallenge(
  params: {
    mode?: string | null;
    token?: string | null;
    challenge?: string | null;
  },
  expectedToken: string,
): string | null {
  if (
    params.mode === "subscribe" &&
    params.token &&
    params.token === expectedToken
  ) {
    return params.challenge ?? "";
  }
  return null;
}
