import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { GRAPH_BASE_URL, IG_SCOPES } from "@app/shared";
import type { GatewayConfig } from "./config.js";
import type { ConnectedAccount } from "./account-store.js";
export const OAUTH_SCOPES = Object.values(IG_SCOPES);
export const UNIFIED_SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "instagram_content_publish",
];
export const SUBSCRIBED_FIELDS =
  "comments,live_comments,messages,message_reactions,messaging_postbacks,messaging_seen,messaging_referral";
export function scopesFor(c: GatewayConfig): string[] {
  return c.metaLoginMode === "unified" ? UNIFIED_SCOPES : OAUTH_SCOPES;
}
export function buildAuthorizeUrl(c: GatewayConfig, state: string): string {
  const u = new URL(
    c.metaLoginMode === "unified"
      ? "https://www.facebook.com/dialog/oauth"
      : "https://www.instagram.com/oauth/authorize",
  );
  u.searchParams.set(
    "client_id",
    c.metaLoginMode === "unified" ? c.metaAppId : c.instagramAppId,
  );
  u.searchParams.set("redirect_uri", c.oauthRedirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  if (c.metaLoginMode === "unified") {
    u.searchParams.set("config_id", c.metaConfigId);
    u.searchParams.set("prompt", "login");
  } else {
    u.searchParams.set("enable_fb_login", "0");
    u.searchParams.set("force_authentication", "1");
    u.searchParams.set("scope", OAUTH_SCOPES.join(","));
  }
  return u.toString();
}
export class MetaConnectionError extends Error {}
export async function metaJson(
  url: URL | string,
  init: RequestInit = {},
): Promise<Record<string, any>> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as Record<
    string,
    any
  > | null;
  if (!res.ok || !json || json.error)
    throw new MetaConnectionError(
      "Meta rejected the request. Check the app, permissions and account eligibility, then reconnect.",
    );
  return json;
}
function queryUrl(base: string, params: Record<string, string>): URL {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}
export async function exchangeCodeForToken(
  c: GatewayConfig,
  code: string,
): Promise<Record<string, any>> {
  if (c.metaLoginMode === "unified")
    return metaJson(
      queryUrl(
        `${GRAPH_BASE_URL.facebookLogin}/${c.graphVersion}/oauth/access_token`,
        {
          client_id: c.metaAppId,
          client_secret: c.metaAppSecret,
          redirect_uri: c.oauthRedirectUri,
          code,
        },
      ),
    );
  const json = await metaJson("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: c.instagramAppId,
      client_secret: c.instagramAppSecret,
      grant_type: "authorization_code",
      redirect_uri: c.oauthRedirectUri,
      code,
    }),
  });
  return Array.isArray(json.data) ? json.data[0] : json;
}
export async function exchangeLongLived(
  c: GatewayConfig,
  short: string,
): Promise<Record<string, any>> {
  return metaJson(
    queryUrl("https://graph.instagram.com/access_token", {
      grant_type: "ig_exchange_token",
      client_secret: c.instagramAppSecret,
      access_token: short,
    }),
  );
}
export async function subscribeWebhooks(
  c: GatewayConfig,
  account: ConnectedAccount,
): Promise<void> {
  const host =
    account.loginMethod === "unified_login"
      ? GRAPH_BASE_URL.facebookLogin
      : GRAPH_BASE_URL.instagramLogin;
  const result = await metaJson(
    `${host}/${c.graphVersion}/${encodeURIComponent(account.igId)}/subscribed_apps`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${account.accessToken}` },
      body: new URLSearchParams({ subscribed_fields: SUBSCRIBED_FIELDS }),
    },
  );
  if (result.success !== true)
    throw new MetaConnectionError(
      "Meta did not confirm the webhook subscription. Reconnect to retry.",
    );
}
export async function connectAccounts(
  c: GatewayConfig,
  code: string,
): Promise<ConnectedAccount[]> {
  const short = await exchangeCodeForToken(c, code);
  if (typeof short?.access_token !== "string")
    throw new MetaConnectionError("Meta did not return an access token.");
  const connectionId = randomUUID(),
    connectedAt = Date.now();
  if (c.metaLoginMode === "unified") {
    const token = short.access_token;
    const headers = { authorization: `Bearer ${token}` };
    const info = await metaJson(
      queryUrl(
        `${GRAPH_BASE_URL.facebookLogin}/${c.graphVersion}/debug_token`,
        { input_token: token },
      ),
      {
        headers: { authorization: `Bearer ${c.metaAppId}|${c.metaAppSecret}` },
      },
    );
    const data = info.data;
    if (
      !data?.is_valid ||
      String(data.app_id) !== c.metaAppId ||
      !Array.isArray(data.scopes)
    )
      throw new MetaConnectionError(
        "Meta could not validate this app authorization.",
      );
    const granted = data.scopes as string[];
    if (UNIFIED_SCOPES.some((s) => !granted.includes(s)))
      throw new MetaConnectionError(
        "Grant all four requested Instagram permissions, then reconnect.",
      );
    const me = await metaJson(
      `${GRAPH_BASE_URL.facebookLogin}/${c.graphVersion}/me?fields=client_business_id`,
      { headers },
    );
    if (!me.client_business_id || !data.user_id)
      throw new MetaConnectionError(
        "A business portfolio authorization is required.",
      );
    const list: Record<string, any>[] = [];
    let after: string | undefined;
    do {
      const u = queryUrl(
        `${GRAPH_BASE_URL.facebookLogin}/${c.graphVersion}/me/assigned_instagram_accounts`,
        { fields: "id,username", limit: "100", ...(after ? { after } : {}) },
      );
      const page = await metaJson(u, { headers });
      if (!Array.isArray(page.data))
        throw new MetaConnectionError("Invalid account list from Meta.");
      list.push(...page.data);
      after = page.paging?.next ? page.paging?.cursors?.after : undefined;
      if (list.length > 1000)
        throw new MetaConnectionError(
          "Too many accounts in one authorization.",
        );
    } while (after);
    if (!list.length)
      throw new MetaConnectionError(
        "No professional Instagram account was shared. Reconnect and select an account.",
      );
    return list.map((a) => {
      if (typeof a.id !== "string" || typeof a.username !== "string")
        throw new MetaConnectionError(
          "Meta returned an incomplete account profile.",
        );
      return {
        igId: a.id,
        username: a.username,
        accessToken: token,
        expiresAt: data.expires_at > 0 ? data.expires_at * 1000 : undefined,
        scopes: granted,
        connectedAt,
        connectionId,
        loginMethod: "unified_login",
        tokenType: "business_system_user",
        authorizationSubjectId: String(data.user_id),
        clientBusinessId: String(me.client_business_id),
        configId: c.metaConfigId,
        subscriptionStatus: "failed",
      };
    });
  }
  const granted = Array.isArray(short.permissions)
    ? short.permissions
    : typeof short.permissions === "string"
      ? short.permissions.split(",")
      : [];
  if (OAUTH_SCOPES.some((s) => !granted.includes(s)))
    throw new MetaConnectionError(
      "Grant all requested Instagram permissions, then reconnect.",
    );
  const long = await exchangeLongLived(c, short.access_token);
  if (
    typeof long.access_token !== "string" ||
    typeof long.expires_in !== "number"
  )
    throw new MetaConnectionError(
      "Meta returned incomplete token expiry information.",
    );
  const profile = await metaJson(
    `${GRAPH_BASE_URL.instagramLogin}/${c.graphVersion}/me?fields=user_id,username`,
    { headers: { authorization: `Bearer ${long.access_token}` } },
  );
  if (!profile.user_id || !profile.username)
    throw new MetaConnectionError(
      "Meta did not return a professional account profile.",
    );
  return [
    {
      igId: String(profile.user_id),
      username: String(profile.username),
      accessToken: long.access_token,
      expiresAt: connectedAt + long.expires_in * 1000,
      scopes: granted,
      connectedAt,
      connectionId,
      loginMethod: "instagram_login",
      tokenType: "instagram_user",
      authorizationSubjectId: String(short.user_id),
      subscriptionStatus: "failed",
      refreshAfter: connectedAt + 86400_000,
    },
  ];
}
export interface SignedRequestData {
  user_id: string;
  algorithm: "HMAC-SHA256";
  issued_at?: number;
}
export function parseSignedRequest(
  value: string,
  secret: string,
): SignedRequestData | null {
  if (!secret || value.length > 20000) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [sig, payload] = parts as [string, string];
  if (!/^[\w-]+$/.test(sig) || !/^[\w-]+$/.test(payload)) return null;
  const received = Buffer.from(sig, "base64url"),
    expected = createHmac("sha256", secret).update(payload).digest();
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return json &&
      json.algorithm === "HMAC-SHA256" &&
      typeof json.user_id === "string" &&
      json.user_id
      ? json
      : null;
  } catch {
    return null;
  }
}
