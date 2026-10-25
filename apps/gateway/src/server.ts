import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
  AutomationEngine,
  DedupeCache,
  normalizeWebhookBody,
  verifyChallenge,
  verifyWebhookSignature,
} from "@app/core";
import { SIGNATURE_HEADER } from "@app/shared";
import websocketPlugin from "@fastify/websocket";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { buildEngineFromFiles, toCoreLogger } from "./engine-adapters.js";
import { registerManagementApi } from "./management.js";
import { JsonStatsRecorder } from "./stats.js";
import { JsonContactStore } from "./contacts-store.js";
import { JsonCommentStore } from "./comments-store.js";
import { registerLegalPages, resultPage } from "./legal.js";
import { oauthReady, type GatewayConfig } from "./config.js";
import { FanoutHub, type HubClient } from "./hub.js";
import { JsonAccountStore } from "./account-store.js";
import {
  buildAuthorizeUrl,
  connectAccounts,
  parseSignedRequest,
  subscribeWebhooks,
} from "./oauth.js";
import { registerAuth } from "./auth.js";
import { JsonFile, serialized } from "./storage.js";
import { purgeAccount } from "./lifecycle.js";
import { accountLock } from "./operations.js";
class PrivateLogController extends LogController {
  constructor() {
    super({ disableRequestLogging: true });
  }
}
export interface BuiltServer {
  app: FastifyInstance;
  hub: FanoutHub;
}
export interface BuildServerOptions {
  engine?: AutomationEngine | null;
}
interface RawBody {
  rawBody?: Buffer;
}
interface Deletion {
  status: "completed" | "failed";
  createdAt: number;
}
export async function buildServer(
  config: GatewayConfig,
  opts: BuildServerOptions = {},
): Promise<BuiltServer> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
      ],
    },
    logController: new PrivateLogController(),
    forceCloseConnections: "idle",
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  });
  app.setErrorHandler((error, req, reply) => {
    const status = (error as { statusCode?: number }).statusCode;
    req.log.error(
      {
        code:
          typeof (error as { code?: unknown }).code === "string"
            ? (error as { code: string }).code
            : "request_failed",
      },
      "Request failed",
    );
    return reply
      .code(status && status >= 400 && status < 500 ? status : 500)
      .send({ error: status === 413 ? "request_too_large" : "request_failed" });
  });
  app.addHook("onSend", async (req, reply, payload) => {
    reply
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY")
      .header("referrer-policy", "no-referrer")
      .header("cache-control", "no-store");
    reply.header(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=()",
    );
    reply.header(
      "content-security-policy",
      req.url.startsWith("/uploads/")
        ? "default-src 'none'; sandbox"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    if (!config.allowInsecureLocalhost)
      reply.header("strict-transport-security", "max-age=31536000");
    return payload;
  });
  app.addHook("onResponse", async (req, reply) => {
    if (
      req.headers.upgrade?.toLowerCase() === "websocket" &&
      reply.statusCode !== 101
    )
      req.raw.socket.destroy();
  });
  await mkdir(config.uploadsDir, { recursive: true, mode: 0o700 });
  const auth = await registerAuth(app, config),
    hub = new FanoutHub(),
    dedupe = new DedupeCache({ ttlMs: config.dedupeTtlMs });
  const stats = new JsonStatsRecorder(config.statsFile),
    contacts = new JsonContactStore(config.contactsFile),
    comments = new JsonCommentStore(config.commentsFile);
  const stores = { stats, contacts, comments },
    accounts = new JsonAccountStore(
      config.accountsFile,
      config.tokenEncryptionKey,
    );
  await accounts.load(); // Wrong keys and corrupt stores fail startup rather than destroy saved data.
  const engine =
    opts.engine !== undefined
      ? opts.engine
      : await buildEngineFromFiles(
          config.accountsFile,
          config.automationsFile,
          toCoreLogger(app.log),
          stats,
          contacts,
          config,
        );
  const receipts = new JsonFile<
    Record<string, { accountId: string; at: number }>
  >(config.receiptsFile, () => ({}));
  const deletions = new JsonFile<Record<string, Deletion>>(
    config.deletionsFile,
    () => ({}),
  );
  const inFlight = new Set<Promise<void>>();
  await registerManagementApi(
    app,
    config,
    Boolean(engine),
    stats,
    contacts,
    comments,
  );
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      (req as unknown as RawBody).rawBody = body as Buffer;
      try {
        done(
          null,
          (body as Buffer).length
            ? JSON.parse((body as Buffer).toString("utf8"))
            : {},
        );
      } catch {
        done(
          Object.assign(new Error("Invalid JSON"), { statusCode: 400 }),
          undefined,
        );
      }
    },
  );
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) =>
      done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );
  await app.register(websocketPlugin, { options: { maxPayload: 16 * 1024 } });
  registerLegalPages(app, config);
  app.get("/healthz", async () => ({ ok: true }));
  app.get("/", async (_req, reply) => reply.redirect("/app/"));
  const states = new Map<string, { session: string; expires: number }>();
  app.get("/oauth/instagram/start", async (req, reply) => {
    if (!oauthReady(config))
      return reply
        .code(503)
        .type("text/html")
        .send(
          resultPage(
            "Setup required",
            "Complete the server environment and Meta configuration before connecting.",
          ),
        );
    for (const [k, v] of states) if (v.expires <= Date.now()) states.delete(k);
    if (states.size >= 1000)
      return reply.code(429).send({ error: "too_many_connections" });
    const state = randomUUID();
    states.set(state, {
      session: auth.sessionId(req)!,
      expires: Date.now() + 600_000,
    });
    return reply.redirect(buildAuthorizeUrl(config, state));
  });
  app.get("/oauth/instagram/callback", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>,
      entry = q.state ? states.get(q.state) : undefined;
    if (
      !entry ||
      entry.expires <= Date.now() ||
      entry.session !== auth.sessionId(req)
    )
      return reply
        .code(400)
        .type("text/html")
        .send(
          resultPage(
            "Connection expired",
            "Start the connection again from the signed-in panel.",
          ),
        );
    states.delete(q.state!);
    if (q.error)
      return reply
        .type("text/html")
        .send(
          resultPage(
            "Connection canceled",
            "No new account was connected. You can try again from the panel.",
          ),
        );
    if (!q.code) return reply.code(400).send({ error: "missing_code" });
    try {
      const connected = await connectAccounts(config, q.code);
      let failed = 0;
      for (const account of connected) {
        await serialized(accountLock(account.igId), async () => {
          const existing = (await accounts.load()).find(
            (a) => a.igId === account.igId,
          );
          if (existing && existing.loginMethod !== account.loginMethod)
            throw new Error(
              "Migration requires a separate installation and explicit account mapping.",
            );
          try {
            await subscribeWebhooks(config, account);
            account.subscriptionStatus = "active";
          } catch {
            failed++;
          }
          await accounts.upsert(account);
        });
      }
      return reply
        .type("text/html")
        .send(
          resultPage(
            failed ? "Connection needs attention" : "Connected",
            `${connected.length} account(s) authorized. ${failed ? "A webhook subscription failed. Reconnect from Accounts to retry; automation stays disabled until subscription succeeds." : "Return to the panel to manage your accounts."}`,
          ),
        );
    } catch {
      req.log.warn("Meta account connection failed");
      return reply
        .code(502)
        .type("text/html")
        .send(
          resultPage(
            "Connection failed",
            "Check the requested permissions, configuration, business portfolio and account eligibility, then reconnect. No secret is shown here.",
          ),
        );
    }
  });
  app.get("/webhooks/instagram", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>,
      challenge = verifyChallenge(
        {
          mode: q["hub.mode"],
          token: q["hub.verify_token"],
          challenge: q["hub.challenge"],
        },
        config.metaVerifyToken,
      );
    return challenge === null
      ? reply.code(403).send("Forbidden")
      : reply.send(challenge);
  });
  app.post("/webhooks/instagram", async (req, reply) => {
    if (
      !config.metaAppSecret ||
      !verifyWebhookSignature(
        (req as unknown as RawBody).rawBody ?? Buffer.alloc(0),
        req.headers[SIGNATURE_HEADER] as string | undefined,
        config.metaAppSecret,
      )
    )
      return reply.code(401).send({ error: "invalid_signature" });
    const events = normalizeWebhookBody(req.body);
    let received = 0;
    for (const event of events) {
      if (dedupe.seen(`${event.accountId}:${event.dedupeKey}`)) continue;
      received++;
      const work = serialized(accountLock(event.accountId), async () => {
        const account = (await accounts.load()).find(
          (a) => a.igId === event.accountId,
        );
        if (!account || account.subscriptionStatus !== "active") return;
        const key = `${event.accountId}:${event.dedupeKey}`;
        const claimed = await receipts.update((rows) => {
          const now = Date.now();
          for (const [k, v] of Object.entries(rows))
            if (now - v.at > 8 * 86400_000) delete rows[k];
          if (rows[key]) return false;
          rows[key] = { accountId: event.accountId, at: now };
          return true;
        });
        if (!claimed) return;
        hub.broadcast(event);
        if (event.type === "comment")
          await comments.add({
            id: event.commentId,
            accountId: event.accountId,
            mediaId: event.mediaId,
            parentId: event.parentId,
            text: event.text,
            fromId: event.from?.id,
            fromUsername: event.from?.username,
            timestamp: event.timestamp,
            status: "open",
          });
        if (engine) await engine.handleEvent(event);
      })
        .catch(() => {
          req.log.error(
            "Webhook processing failed; inspect storage and connection status.",
          );
        })
        .finally(() => inFlight.delete(work));
      inFlight.add(work);
    }
    return reply.send({ received });
  });
  async function deleteSubject(subject: string) {
    const all = await accounts.load();
    const matching = all.filter((a) => a.authorizationSubjectId === subject);
    // A Unified business system user is not the person who authorized the app.
    // Never claim that a person's callback removed data when that mapping is unavailable.
    if (!matching.length && all.length) {
      app.log.warn(
        "A signed privacy request needs operator review: authorization subject could not be mapped.",
      );
      throw new Error("Privacy request requires operator review.");
    }
    for (const account of matching)
      await purgeAccount(config, account.igId, stores);
  }
  app.post("/oauth/instagram/deauthorize", async (req, reply) => {
    const sr = (req.body as { signed_request?: unknown } | null)
      ?.signed_request;
    const data =
      typeof sr === "string"
        ? parseSignedRequest(sr, config.metaAppSecret)
        : null;
    if (!data) return reply.code(400).send({ error: "invalid_signed_request" });
    await deleteSubject(data.user_id);
    return { ok: true };
  });
  app.post("/privacy/data-deletion", async (req, reply) => {
    const sr = (req.body as { signed_request?: unknown } | null)
      ?.signed_request;
    const data =
      typeof sr === "string"
        ? parseSignedRequest(sr, config.metaAppSecret)
        : null;
    if (!data) return reply.code(400).send({ error: "invalid_signed_request" });
    const code = randomUUID();
    let status: Deletion["status"] = "completed";
    try {
      await deleteSubject(data.user_id);
    } catch {
      status = "failed";
    }
    await deletions.update((rows) => {
      const now = Date.now();
      for (const [k, v] of Object.entries(rows))
        if (now - v.createdAt > 30 * 86400_000) delete rows[k];
      rows[code] = { status, createdAt: now };
    });
    return {
      url: `${config.publicUrl.replace(/\/$/, "")}/privacy/data-deletion/status?code=${code}`,
      confirmation_code: code,
    };
  });
  app.get("/privacy/data-deletion/status", async (req, reply) => {
    const code = (req.query as { code?: string }).code,
      status = code ? (await deletions.read())[code] : undefined;
    if (!status || Date.now() - status.createdAt > 30 * 86400_000)
      return reply
        .code(404)
        .type("text/html")
        .send(
          resultPage(
            "Request not found",
            "Check your confirmation link. Status records expire after 30 days.",
          ),
        );
    return reply
      .type("text/html")
      .send(
        resultPage(
          status.status === "completed"
            ? "Deletion completed"
            : "Deletion needs attention",
          status.status === "completed"
            ? "The locally stored data associated with this request has been removed."
            : "Deletion did not complete. Contact the installation operator using the privacy page.",
        ),
      );
  });
  app.get("/ws", { websocket: true }, (socket: WebSocket, req) => {
    const url = new URL(req.url, "http://localhost"),
      ids = (url.searchParams.get("accounts") ?? "").split(",").filter(Boolean);
    const client: HubClient = {
      id: randomUUID(),
      accounts: new Set(ids),
      send: (data) => socket.send(data),
      isOpen: () =>
        socket.readyState === socket.OPEN && auth.authenticated(req),
    };
    hub.add(client);
    socket.send(
      JSON.stringify({ kind: "ready", clientId: client.id, accounts: ids }),
    );
    socket.on("message", (raw: Buffer) => {
      if (!auth.authenticated(req)) {
        socket.close(1008, "session_expired");
        return;
      }
      try {
        const m = JSON.parse(raw.toString());
        if (m.kind === "subscribe" && typeof m.accountId === "string") {
          hub.subscribe(client, m.accountId);
          socket.send(
            JSON.stringify({ kind: "subscribed", accountId: m.accountId }),
          );
        } else if (m.kind === "ping")
          socket.send(JSON.stringify({ kind: "pong" }));
      } catch {}
    });
    const check = setInterval(() => {
      if (!auth.authenticated(req)) socket.close(1008, "session_expired");
    }, 30_000);
    check.unref();
    socket.on("close", () => {
      clearInterval(check);
      hub.remove(client);
    });
    socket.on("error", () => {
      clearInterval(check);
      hub.remove(client);
    });
  });
  app.addHook("onClose", async () => {
    states.clear();
    await Promise.allSettled(inFlight);
  });
  return { app, hub };
}
