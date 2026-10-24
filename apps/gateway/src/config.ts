import { resolve, join } from "node:path";
import { z } from "zod";
import { DEFAULT_GRAPH_VERSION } from "@app/shared";
const bool = z.preprocess(
  (v) => (v === "true" ? true : v === "false" ? false : v),
  z.boolean(),
);
export const zGatewayConfig = z
  .object({
    host: z.string().default("127.0.0.1"),
    port: z.coerce.number().int().min(0).max(65535).default(8080),
    logLevel: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    publicUrl: z.url(),
    allowInsecureLocalhost: bool.default(false),
    trustProxy: bool.default(false),
    metaLoginMode: z.enum(["unified", "instagram"]).default("unified"),
    graphVersion: z
      .string()
      .regex(/^v\d+\.0$/)
      .default(DEFAULT_GRAPH_VERSION),
    metaAppId: z.string().default(""),
    metaAppSecret: z.string().default(""),
    metaConfigId: z.string().default(""),
    instagramAppId: z.string().default(""),
    instagramAppSecret: z.string().default(""),
    metaVerifyToken: z.string().min(32),
    clientToken: z.string().min(32),
    tokenEncryptionKey: z.string().regex(/^[a-fA-F0-9]{64}$/),
    oauthRedirectUri: z.url(),
    dedupeTtlMs: z.coerce.number().int().positive().default(600_000),
    sessionTtlMs: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(28_800_000),
    humanAgentEnabled: bool.default(false),
    operatorName: z.string().min(1),
    operatorContactUrl: z.url(),
    accountsFile: z.string(),
    automationsFile: z.string(),
    spaDir: z.string(),
    statsFile: z.string(),
    scheduledFile: z.string(),
    uploadsDir: z.string(),
    contactsFile: z.string(),
    commentsFile: z.string(),
    captionsFile: z.string(),
    settingsFile: z.string(),
    uploadsFile: z.string(),
    deletionsFile: z.string(),
    receiptsFile: z.string(),
  })
  .superRefine((c, ctx) => {
    const u = new URL(c.publicUrl);
    const local =
      c.allowInsecureLocalhost &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/" ||
      (u.protocol !== "https:" && !local)
    )
      ctx.addIssue({
        code: "custom",
        path: ["publicUrl"],
        message: "Use an HTTPS origin, or explicit localhost development mode.",
      });
    if (new URL(c.oauthRedirectUri).origin !== u.origin)
      ctx.addIssue({
        code: "custom",
        path: ["oauthRedirectUri"],
        message: "Callback must use PUBLIC_URL origin.",
      });
    if (
      [c.clientToken, c.metaVerifyToken].some((s) =>
        /^(replace|change|your_|example)/i.test(s),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Generate unique random secrets before starting.",
      });
  });
export type GatewayConfig = z.infer<typeof zGatewayConfig>;
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): GatewayConfig {
  const data = resolve(env["DATA_DIR"] || "data"),
    publicUrl = env["PUBLIC_URL"] || "http://localhost:8080";
  const files = Object.fromEntries(
    Object.entries({
      accountsFile: "accounts",
      automationsFile: "automations",
      statsFile: "stats",
      scheduledFile: "scheduled",
      contactsFile: "contacts",
      commentsFile: "comments",
      captionsFile: "captions",
      settingsFile: "settings",
      uploadsFile: "uploads",
      deletionsFile: "deletions",
      receiptsFile: "receipts",
    }).map(([k, v]) => [k, join(data, `${v}.json`)]),
  );
  return zGatewayConfig.parse({
    ...files,
    host: env["HOST"],
    port: env["PORT"],
    logLevel: env["LOG_LEVEL"],
    publicUrl,
    allowInsecureLocalhost: env["ALLOW_INSECURE_LOCALHOST"],
    trustProxy: env["TRUST_PROXY"],
    metaLoginMode: env["META_LOGIN_MODE"],
    graphVersion: env["META_GRAPH_VERSION"],
    metaAppId: env["META_APP_ID"],
    metaAppSecret: env["META_APP_SECRET"],
    metaConfigId: env["META_CONFIG_ID"],
    instagramAppId: env["INSTAGRAM_APP_ID"],
    instagramAppSecret: env["INSTAGRAM_APP_SECRET"],
    metaVerifyToken: env["META_VERIFY_TOKEN"],
    clientToken: env["GATEWAY_CLIENT_TOKEN"],
    tokenEncryptionKey: env["TOKEN_ENCRYPTION_KEY"],
    oauthRedirectUri:
      env["OAUTH_REDIRECT_URI"] ||
      `${publicUrl.replace(/\/$/, "")}/oauth/instagram/callback`,
    dedupeTtlMs: env["DEDUPE_TTL_MS"],
    sessionTtlMs: env["SESSION_TTL_MS"],
    humanAgentEnabled: env["HUMAN_AGENT_ENABLED"],
    operatorName: env["OPERATOR_NAME"],
    operatorContactUrl: env["OPERATOR_CONTACT_URL"],
    spaDir: resolve(env["SPA_DIR"] || "apps/desktop/dist"),
    uploadsDir: join(data, "uploads"),
  });
}
export function oauthReady(c: GatewayConfig): boolean {
  return Boolean(
    c.metaAppSecret &&
    (c.metaLoginMode === "unified"
      ? c.metaAppId && c.metaConfigId
      : c.instagramAppId && c.instagramAppSecret),
  );
}
