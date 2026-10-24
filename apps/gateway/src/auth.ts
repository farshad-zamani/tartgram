import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { GatewayConfig } from "./config.js";

export function equalSecret(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export async function registerAuth(
  app: FastifyInstance,
  config: GatewayConfig,
) {
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    max: 10,
    timeWindow: "1 minute",
  });
  const sessions = new Map<string, number>();
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const name = "tartgram_session";
  function sessionId(req: FastifyRequest): string | null {
    const raw = req.cookies[name];
    if (!raw) return null;
    const key = hash(raw),
      expiry = sessions.get(key);
    if (!expiry || expiry <= Date.now()) {
      sessions.delete(key);
      return null;
    }
    return key;
  }
  function bearer(req: FastifyRequest): boolean {
    const h = req.headers.authorization;
    return Boolean(
      h?.startsWith("Bearer ") && equalSecret(h.slice(7), config.clientToken),
    );
  }
  const origin = new URL(config.publicUrl).origin;
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: !config.allowInsecureLocalhost,
    sameSite: "lax" as const,
  };
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0]!;
    const protectedRoute =
      path.startsWith("/api/") ||
      path === "/ws" ||
      path === "/oauth/instagram/start";
    if (!protectedRoute) return;
    const login = path === "/api/auth/session" && req.method === "POST";
    const authBearer = bearer(req),
      session = sessionId(req);
    if (
      login ||
      (session && !["GET", "HEAD", "OPTIONS"].includes(req.method)) ||
      (path === "/ws" && session)
    ) {
      if (req.headers.origin !== origin)
        return reply.code(403).send({ error: "origin_not_allowed" });
    }
    if (req.headers.origin && req.headers.origin !== origin)
      return reply.code(403).send({ error: "origin_not_allowed" });
    if (!login && !session && !authBearer)
      return reply.code(401).send({ error: "unauthorized" });
    if (path === "/oauth/instagram/start" && !session)
      return reply.code(401).send({ error: "browser_session_required" });
    if (path === "/ws" && new URL(req.url, origin).searchParams.has("token"))
      return reply.code(400).send({ error: "tokens_in_urls_not_supported" });
  });
  app.post(
    "/api/auth/session",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const token = (req.body as { token?: unknown } | null)?.token;
      if (
        typeof token !== "string" ||
        token.length > 1024 ||
        !equalSecret(token, config.clientToken)
      )
        return reply.code(401).send({ error: "invalid_token" });
      for (const [id, expiry] of sessions)
        if (expiry <= Date.now()) sessions.delete(id);
      if (sessions.size >= 1000)
        return reply.code(503).send({ error: "session_capacity" });
      const old = sessionId(req);
      if (old) sessions.delete(old);
      const raw = randomBytes(32).toString("base64url");
      sessions.set(hash(raw), Date.now() + config.sessionTtlMs);
      return reply
        .setCookie(name, raw, {
          ...cookieOptions,
          maxAge: Math.floor(config.sessionTtlMs / 1000),
        })
        .send({ ok: true });
    },
  );
  app.get("/api/auth/session", async () => ({ ok: true }));
  app.delete("/api/auth/session", async (req, reply) => {
    const id = sessionId(req);
    if (id) sessions.delete(id);
    return reply.clearCookie(name, cookieOptions).send({ ok: true });
  });
  app.addHook("onClose", async () => sessions.clear());
  return {
    sessionId,
    authenticated: (req: FastifyRequest) =>
      Boolean(sessionId(req) || bearer(req)),
  };
}
