import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { open, unlink, rename } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { zAutomation, zFlow, zIceBreaker, TIMING } from "@app/shared";
import { PublicationUncertainError } from "@app/core";
import type { FastifyInstance, FastifyReply } from "fastify";
import { oauthReady, type GatewayConfig } from "./config.js";
import { JsonAccountStore } from "./account-store.js";
import { clientForAccount } from "./account-client.js";
import { JsonFile, readJson, atomicJson, serialized } from "./storage.js";
import {
  IB_PAYLOAD_PREFIX,
  loadAutomationsFile,
  saveAutomationsFile,
  toCoreLogger,
} from "./engine-adapters.js";
import { ScheduledStore, startScheduler, publishNow } from "./publishing.js";
import type { JsonStatsRecorder } from "./stats.js";
import type { JsonContactStore } from "./contacts-store.js";
import type { JsonCommentStore } from "./comments-store.js";
import { purgeAccount, type UploadRecord } from "./lifecycle.js";
import { accountLock } from "./operations.js";
import { scopesFor } from "./oauth.js";
import { validFlow } from "./flow-validation.js";
const text = z
  .string()
  .min(1)
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 1000,
    "Maximum 1000 UTF-8 bytes.",
  );
const definition = z.object({
  automations: z.array(zAutomation).max(1000),
  flows: z.record(z.string(), z.array(zFlow)),
  iceBreakers: z.record(z.string(), z.array(zIceBreaker)).optional(),
});
const mediaUrl = z.url().refine((v) => {
  const u = new URL(v);
  return u.protocol === "https:" && !u.username && !u.password;
}, "A public HTTPS media URL is required.");
function invalid(reply: FastifyReply) {
  return reply.code(400).send({ error: "invalid_input" });
}
function remoteError(reply: FastifyReply) {
  return reply.code(502).send({
    error: "meta_request_failed",
    message:
      "Check the account permissions, authorization, quota and media format, then try again.",
  });
}
export function csvCell(value: unknown): string {
  const v = String(value).replace(/^[\s]*[=+@\-\t\r]/, "'$&");
  return `"${v.replace(/"/g, '""')}"`;
}
export async function registerManagementApi(
  app: FastifyInstance,
  c: GatewayConfig,
  engine: boolean,
  stats: JsonStatsRecorder,
  contacts: JsonContactStore,
  comments: JsonCommentStore,
): Promise<void> {
  const accounts = new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey),
    base = c.publicUrl.replace(/\/$/, ""),
    uploads = new JsonFile<UploadRecord[]>(c.uploadsFile, () => []);
  const scheduled = new ScheduledStore(c.scheduledFile),
    settings = new JsonFile<{ defaultAccountId?: string }>(
      c.settingsFile,
      () => ({}),
    );
  const clientFor = (id: string) => clientForAccount(accounts, id, c);
  app.addHook("onRoute", (route) => {
    if (
      typeof route.url !== "string" ||
      !route.url.startsWith("/api/") ||
      route.url === "/api/accounts/:igId"
    )
      return;
    const original = route.handler,
      accountRoute = route.url.startsWith("/api/accounts/:igId/");
    route.handler = async function (req, reply) {
      const run = async () => {
        if (!accountRoute) return original.call(this, req, reply);
        const id = (req.params as { igId: string }).igId;
        return serialized(accountLock(id), async () => {
          if (
            !(await accounts.load()).some(
              (a) => a.igId === id && !a.reconnectRequired,
            )
          )
            return reply.code(404).send({ error: "account_not_found" });
          return original.call(this, req, reply);
        });
      };
      return ["GET", "HEAD"].includes(req.method)
        ? run()
        : serialized(c.accountsFile + "#workspace-write", run);
    };
  });
  await app.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024, files: 1, fields: 4, parts: 5 },
  });
  await app.register(fastifyStatic, {
    root: c.uploadsDir,
    prefix: "/uploads/",
    decorateReply: false,
    list: false,
    dotfiles: "deny",
  });
  app.get("/api/status", async () => ({
    engine,
    connectUrl: `${base}/oauth/instagram/start`,
    accounts: (await accounts.load()).map((a) => ({
      igId: a.igId,
      username: a.username,
      tokenExpiresAt: a.expiresAt,
      loginMethod: a.loginMethod,
      subscriptionStatus: a.subscriptionStatus,
      reconnectRequired: Boolean(
        a.reconnectRequired || (a.expiresAt && a.expiresAt <= Date.now()),
      ),
    })),
    automationsCount: (
      await loadAutomationsFile(c.automationsFile)
    ).automations.filter((a) => a.enabled).length,
    ...(await settings.read()),
    setup: {
      loginMode: c.metaLoginMode,
      graphVersion: c.graphVersion,
      oauthConfigured: oauthReady(c),
      webhookUrl: `${base}/webhooks/instagram`,
      redirectUri: c.oauthRedirectUri,
      deauthorizeUrl: `${base}/oauth/instagram/deauthorize`,
      dataDeletionUrl: `${base}/privacy/data-deletion`,
      privacyUrl: `${base}/privacy`,
      termsUrl: `${base}/terms`,
      requiredScopes: scopesFor(c),
      humanAgentEnabled: c.humanAgentEnabled,
    },
  }));
  app.get("/api/settings", () => settings.read());
  app.put("/api/settings", async (req, reply) => {
    const p = z
      .object({ defaultAccountId: z.string().optional() })
      .safeParse(req.body);
    if (!p.success) return invalid(reply);
    if (
      p.data.defaultAccountId &&
      !(await accounts.load()).some((a) => a.igId === p.data.defaultAccountId)
    )
      return invalid(reply);
    await settings.replace(p.data);
    return { ok: true };
  });
  app.get("/api/accounts", async () =>
    (await accounts.load()).map((a) => ({
      igId: a.igId,
      username: a.username,
      scopes: a.scopes,
      tokenExpiresAt: a.expiresAt,
      loginMethod: a.loginMethod,
      subscriptionStatus: a.subscriptionStatus,
      reconnectRequired: Boolean(
        a.reconnectRequired || (a.expiresAt && a.expiresAt <= Date.now()),
      ),
    })),
  );
  app.delete("/api/accounts/:igId", async (req) => {
    await purgeAccount(c, (req.params as { igId: string }).igId, {
      contacts,
      comments,
      stats,
    });
    return { ok: true };
  });
  app.get("/api/accounts/:igId/media", async (req, reply) => {
    const { igId } = req.params as { igId: string },
      client = (await clientFor(igId))!;
    try {
      return ((await client.getRecentMedia(24)).data ?? []).map((m) => ({
        id: m.id,
        caption: m.caption ?? "",
        mediaType: m.media_type ?? "",
        thumbnail: m.thumbnail_url ?? m.media_url ?? "",
        permalink: m.permalink ?? "",
        timestamp: m.timestamp ?? "",
      }));
    } catch {
      return remoteError(reply);
    }
  });
  app.get("/api/accounts/:igId/conversations", async (req, reply) => {
    const { igId } = req.params as { igId: string },
      client = (await clientFor(igId))!;
    try {
      return ((await client.getConversations(20)).data ?? []).map(
        (conversation) => {
          const other = conversation.participants?.data?.find(
            (p) => p.id !== igId,
          );
          return {
            id: conversation.id,
            userId: other?.id ?? "",
            username: other?.username ?? "",
            updatedTime: conversation.updated_time ?? "",
            snippet: conversation.messages?.data?.[0]?.message ?? "",
          };
        },
      );
    } catch {
      return remoteError(reply);
    }
  });
  app.get(
    "/api/accounts/:igId/conversations/:convId/messages",
    async (req, reply) => {
      const { igId, convId } = req.params as { igId: string; convId: string },
        client = (await clientFor(igId))!;
      try {
        const res = await client.getConversationMessages(convId, 40);
        for (const m of res.messages?.data ?? []) {
          const stamp = m.created_time ? Date.parse(m.created_time) : NaN;
          if (
            m.from?.id &&
            m.from.id !== igId &&
            Number.isFinite(stamp) &&
            stamp <= Date.now()
          ) {
            const old = await contacts.getByIgsid(igId, m.from.id);
            if (!old?.lastInboundAt || stamp > old.lastInboundAt)
              await contacts.upsert({
                ...old,
                id: old?.id ?? randomUUID(),
                accountId: igId,
                igsid: m.from.id,
                username: m.from.username,
                tags: old?.tags ?? [],
                attributes: old?.attributes ?? {},
                createdAt: old?.createdAt ?? Date.now(),
                lastInboundAt: stamp,
              });
          }
        }
        return (res.messages?.data ?? [])
          .map((m) => ({
            id: m.id,
            fromId: m.from?.id ?? "",
            fromUsername: m.from?.username ?? "",
            text: m.message ?? "",
            createdTime: m.created_time ?? "",
            isBusiness: m.from?.id === igId,
          }))
          .reverse();
      } catch {
        return remoteError(reply);
      }
    },
  );
  app.post("/api/accounts/:igId/send", async (req, reply) => {
    const { igId } = req.params as { igId: string },
      p = z
        .object({
          recipientId: z.string().min(1),
          text,
          humanAgent: z.boolean().optional(),
          replyToMid: z.string().min(1).max(1000).optional(),
        })
        .safeParse(req.body);
    if (!p.success) return invalid(reply);
    const contact = await contacts.getByIgsid(igId, p.data.recipientId),
      age = contact?.lastInboundAt
        ? Date.now() - contact.lastInboundAt
        : Infinity;
    if (
      !(p.data.humanAgent
        ? c.humanAgentEnabled && age >= 0 && age < 7 * 86400_000
        : age >= 0 && age < 24 * 3600_000)
    )
      return reply.code(403).send({ error: "messaging_window_closed" });
    try {
      const result = await (await clientFor(igId))!.sendMessage(
        p.data.recipientId,
        { type: "text", text: p.data.text, quickReplies: [] },
        {
          ...(p.data.humanAgent ? { tag: "HUMAN_AGENT" as const } : {}),
          replyToMid: p.data.replyToMid,
        },
      );
      return { ok: true, messageId: result.message_id };
    } catch {
      return remoteError(reply);
    }
  });
  app.get("/api/accounts/:igId/publish-limit", async (req, reply) => {
    try {
      const row = (
        await (await clientFor(
          (req.params as { igId: string }).igId,
        ))!.getContentPublishingLimit()
      ).data?.[0];
      if (
        typeof row?.quota_usage !== "number" ||
        !Number.isFinite(row.quota_usage) ||
        row.quota_usage < 0 ||
        typeof row.config?.quota_total !== "number" ||
        !Number.isFinite(row.config.quota_total) ||
        row.config.quota_total < 0
      )
        return reply.code(502).send({ error: "quota_unavailable" });
      return { used: row.quota_usage, total: row.config.quota_total };
    } catch {
      return reply.code(502).send({ error: "quota_unavailable" });
    }
  });
  app.get("/api/accounts/:igId/scheduled", async (req) =>
    (await scheduled.load())
      .filter((p) => p.igId === (req.params as { igId: string }).igId)
      .sort((a, b) => a.scheduleAt - b.scheduleAt),
  );
  app.delete("/api/accounts/:igId/scheduled/:id", async (req) => {
    const { id, igId } = req.params as { id: string; igId: string };
    await scheduled.remove(id, igId);
    return { ok: true };
  });
  app.post("/api/accounts/:igId/publish", async (req, reply) => {
    const { igId } = req.params as { igId: string },
      p = z
        .object({
          type: z.enum(["image", "reel", "story"]),
          url: mediaUrl,
          caption: z.string().max(2200).optional(),
          scheduleAt: z.number().int().positive().optional(),
        })
        .safeParse(req.body);
    if (!p.success) return invalid(reply);
    const { type, url, caption, scheduleAt } = p.data;
    const source = new URL(url);
    if (
      source.origin === new URL(c.publicUrl).origin &&
      source.pathname.startsWith("/uploads/")
    ) {
      const name = source.pathname.slice("/uploads/".length);
      if (
        !(await uploads.read()).some(
          (u) => u.name === name && u.accountId === igId,
        ) ||
        !existsSync(join(c.uploadsDir, name))
      )
        return reply.code(400).send({ error: "upload_not_owned_or_missing" });
    }
    if (scheduleAt) {
      if (scheduleAt <= Date.now() + 5000)
        return reply.code(400).send({ error: "schedule_in_past" });
      const post = {
        id: randomUUID(),
        igId,
        type,
        url,
        caption,
        scheduleAt,
        status: "pending" as const,
        createdAt: Date.now(),
      };
      await scheduled.add(post);
      return { scheduled: true, post };
    }
    const post = {
      id: randomUUID(),
      igId,
      type,
      url,
      caption,
      scheduleAt: Date.now(),
      createdAt: Date.now(),
      status: "publishing" as const,
    };
    await scheduled.add(post);
    let mediaId: string;
    const client = (await clientFor(igId))!;
    try {
      mediaId = await publishNow(client, type, url, caption);
    } catch (error) {
      const uncertain = error instanceof PublicationUncertainError;
      await scheduled.update(post.id, {
        status: uncertain ? "uncertain" : "failed",
        containerId: uncertain ? error.containerId : undefined,
        error: uncertain
          ? error.message
          : "Publishing failed. Check permissions, quota and media requirements.",
      });
      if (uncertain)
        return reply
          .code(409)
          .send({ error: "publish_outcome_unknown", postId: post.id });
      return remoteError(reply);
    }
    await scheduled.update(post.id, {
      status: "published",
      publishedMediaId: mediaId,
      warnings: client.publishWarnings,
    });
    return { published: true, mediaId, warnings: client.publishWarnings };
  });
  app.post("/api/accounts/:igId/upload", async (req, reply) => {
    const { igId } = req.params as { igId: string },
      file = await req.file();
    if (!file) return invalid(reply);
    const ext = (
      { "image/jpeg": ".jpg", "video/mp4": ".mp4" } as Record<string, string>
    )[file.mimetype];
    if (!ext) {
      file.file.resume();
      return reply.code(415).send({ error: "jpeg_or_mp4_required" });
    }
    const name = randomUUID() + ext,
      dest = join(c.uploadsDir, name),
      staging = join(c.uploadsDir, `.pending-${name}`);
    try {
      await pipeline(
        file.file,
        createWriteStream(staging, { flags: "wx", mode: 0o600 }),
      );
      if (file.file.truncated) {
        await unlink(staging);
        return reply.code(413).send({ error: "file_too_large" });
      }
      const handle = await open(staging, "r"),
        head = Buffer.alloc(12);
      try {
        await handle.read(head, 0, 12, 0);
      } finally {
        await handle.close();
      }
      const valid =
        ext === ".jpg"
          ? head[0] === 255 && head[1] === 216 && head[2] === 255
          : head.subarray(4, 8).toString() === "ftyp";
      if (!valid) {
        await unlink(staging);
        return reply.code(415).send({ error: "file_content_mismatch" });
      }
      await rename(staging, dest);
      await uploads.update((rows) => {
        rows.push({
          name,
          accountId: igId,
          mime: file.mimetype,
          createdAt: Date.now(),
        });
      });
      return { url: `${base}/uploads/${name}`, mime: file.mimetype };
    } catch (error) {
      await unlink(staging).catch(() => {});
      await unlink(dest).catch(() => {});
      if (
        file.file.truncated ||
        (error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE"
      )
        return reply.code(413).send({ error: "file_too_large" });
      return reply.code(500).send({ error: "upload_failed" });
    }
  });
  app.get("/api/accounts/:igId/contacts", (req) =>
    contacts.list((req.params as { igId: string }).igId),
  );
  app.get("/api/accounts/:igId/contacts.csv", async (req, reply) => {
    const list = await contacts.list((req.params as { igId: string }).igId);
    const rows = [
      ["igsid", "username", "isFollower", "tags", "lastInboundAt", "createdAt"],
      ...list.map((c) => [
        c.igsid,
        c.username ?? "",
        String(c.isFollower ?? ""),
        c.tags.join("|"),
        c.lastInboundAt ? new Date(c.lastInboundAt).toISOString() : "",
        new Date(c.createdAt).toISOString(),
      ]),
    ];
    return reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", "attachment; filename=contacts.csv")
      .send(rows.map((r) => r.map(csvCell).join(",")).join("\n"));
  });
  app.post("/api/accounts/:igId/broadcast", async (req, reply) => {
    const { igId } = req.params as { igId: string },
      p = z.object({ text }).safeParse(req.body);
    if (!p.success) return invalid(reply);
    const client = (await clientFor(igId))!,
      now = Date.now(),
      audience = (await contacts.list(igId)).filter(
        (c) =>
          c.lastInboundAt &&
          now >= c.lastInboundAt &&
          now - c.lastInboundAt < TIMING.messagingWindowHours * 3600_000,
      );
    let sent = 0;
    for (const contact of audience) {
      if (
        !contact.lastInboundAt ||
        Date.now() - contact.lastInboundAt >= 24 * 3600_000
      )
        continue;
      try {
        await client.sendMessage(contact.igsid, {
          type: "text",
          text: p.data.text,
          quickReplies: [],
        });
        sent++;
        await new Promise((resolve) => setTimeout(resolve, 120));
      } catch {
        app.log.warn("A broadcast recipient could not be reached.");
      }
    }
    return { ok: true, eligible: audience.length, sent };
  });
  app.get("/api/accounts/:igId/comments", async (req, reply) => {
    const { igId } = req.params as { igId: string },
      stored = await comments.list(igId),
      byId = new Map(stored.map((c) => [c.id, c]));
    try {
      const client = (await clientFor(igId))!,
        media = (await client.getRecentMedia(15)).data ?? [];
      for (const m of media
        .filter((m) => (m.comments_count ?? 0) > 0)
        .slice(0, 10))
        for (const row of (await client.getMediaComments(m.id, 50)).data ?? [])
          if (!byId.has(row.id))
            byId.set(row.id, {
              id: row.id,
              accountId: igId,
              mediaId: m.id,
              text: row.text ?? "",
              fromUsername: row.username,
              timestamp: row.timestamp ? Date.parse(row.timestamp) : Date.now(),
              status: row.hidden ? "hidden" : "open",
            });
    } catch {
      app.log.warn("Recent comments could not be synchronized.");
      return reply
        .code(502)
        .send({ error: "comment_sync_failed", cached: stored });
    }
    return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
  });
  app.post(
    "/api/accounts/:igId/comments/:commentId/reply",
    async (req, reply) => {
      const { igId, commentId } = req.params as {
          igId: string;
          commentId: string;
        },
        p = z.object({ text }).safeParse(req.body);
      if (!p.success) return invalid(reply);
      try {
        await (await clientFor(igId))!.replyToComment(commentId, p.data.text);
        await comments.update(commentId, { status: "replied" });
        return { ok: true };
      } catch {
        return remoteError(reply);
      }
    },
  );
  app.post(
    "/api/accounts/:igId/comments/:commentId/hide",
    async (req, reply) => {
      const { igId, commentId } = req.params as {
          igId: string;
          commentId: string;
        },
        p = z.object({ hide: z.boolean() }).safeParse(req.body);
      if (!p.success) return invalid(reply);
      try {
        await (await clientFor(igId))!.setCommentHidden(commentId, p.data.hide);
        await comments.update(commentId, {
          status: p.data.hide ? "hidden" : "open",
        });
        return { ok: true };
      } catch {
        return remoteError(reply);
      }
    },
  );
  app.delete("/api/accounts/:igId/comments/:commentId", async (req, reply) => {
    const { igId, commentId } = req.params as {
      igId: string;
      commentId: string;
    };
    try {
      await (await clientFor(igId))!.deleteComment(commentId);
      await comments.update(commentId, { status: "deleted" });
      return { ok: true };
    } catch {
      return remoteError(reply);
    }
  });
  app.get("/api/captions", () => readJson(c.captionsFile, () => []));
  app.put("/api/captions", async (req, reply) => {
    const p = z
      .array(
        z.object({
          id: z.string(),
          title: z.string().min(1).max(200),
          text: z.string().min(1).max(2200),
        }),
      )
      .max(200)
      .safeParse(req.body);
    if (!p.success) return invalid(reply);
    await atomicJson(c.captionsFile, p.data);
    return { ok: true };
  });
  app.get("/api/stats", () => stats.snapshot());
  app.get("/api/automations", () => loadAutomationsFile(c.automationsFile));
  app.put("/api/automations", async (req, reply) => {
    const p = definition.safeParse(req.body);
    if (!p.success) return invalid(reply);
    const accountIds = new Set((await accounts.load()).map((a) => a.igId));
    if (
      new Set(p.data.automations.map((a) => a.id)).size !==
        p.data.automations.length ||
      p.data.automations.some((a) => !a.id || a.id.startsWith("ibauto:"))
    )
      return invalid(reply);
    if (
      p.data.automations.some(
        (a) => !accountIds.has(a.accountId) || a.trigger.kind === "welcome",
      )
    )
      return invalid(reply);
    for (const [id, flows] of Object.entries(p.data.flows)) {
      if (new Set(flows.map((f) => f.id)).size !== flows.length)
        return invalid(reply);
      for (const flow of flows) {
        if (
          !accountIds.has(id) ||
          flow.id.startsWith("ibflow:") ||
          !validFlow(flow)
        )
          return invalid(reply);
      }
    }
    for (const a of p.data.automations)
      if (!p.data.flows[a.accountId]?.some((f) => f.id === a.flowId))
        return invalid(reply);
    const saved = await serialized(c.automationsFile, async () => {
      const old = await loadAutomationsFile(c.automationsFile);
      if (
        p.data.iceBreakers &&
        JSON.stringify(p.data.iceBreakers) !== JSON.stringify(old.iceBreakers)
      )
        return false;
      await saveAutomationsFile(c.automationsFile, {
        ...p.data,
        iceBreakers: old.iceBreakers,
      });
      return true;
    });
    if (!saved)
      return reply.code(400).send({ error: "use_ice_breakers_endpoint" });
    return { ok: true, automationsCount: p.data.automations.length };
  });
  app.get(
    "/api/accounts/:igId/ice-breakers",
    async (req) =>
      (await loadAutomationsFile(c.automationsFile)).iceBreakers[
        (req.params as { igId: string }).igId
      ] ?? [],
  );
  app.put("/api/accounts/:igId/ice-breakers", async (req, reply) => {
    const { igId } = req.params as { igId: string },
      p = z
        .array(
          z.object({
            id: z.string().min(1).max(100).optional(),
            question: z.string().min(1).max(80),
            response: text,
          }),
        )
        .max(4)
        .safeParse(req.body);
    if (!p.success) return invalid(reply);
    const items = p.data.map((i) => ({ ...i, id: i.id ?? randomUUID() })),
      client = (await clientFor(igId))!;
    const current = await loadAutomationsFile(c.automationsFile);
    const otherIds = new Set(
      Object.entries(current.iceBreakers)
        .filter(([id]) => id !== igId)
        .flatMap(([, rows]) => rows.map((row) => row.id)),
    );
    if (
      new Set(items.map((i) => i.id)).size !== items.length ||
      items.some((i) => otherIds.has(i.id))
    )
      return invalid(reply);
    try {
      if (items.length)
        await client.setIceBreakers(
          items.map((i) => ({
            question: i.question,
            payload: IB_PAYLOAD_PREFIX + i.id,
          })),
        );
      else await client.deleteIceBreakers();
    } catch {
      return remoteError(reply);
    }
    await serialized(c.automationsFile, async () => {
      const file = await loadAutomationsFile(c.automationsFile);
      file.iceBreakers[igId] = items;
      await saveAutomationsFile(c.automationsFile, file);
    });
    return { ok: true, items };
  });
  const stop = startScheduler({
    accounts,
    scheduled,
    logger: toCoreLogger(app.log),
    config: c,
  });
  app.addHook("onClose", stop);
  async function cleanUploads() {
    return serialized(c.accountsFile + "#workspace-write", async () => {
      const posts = await scheduled.load();
      await uploads.update(async (rows) => {
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i]!;
          if (
            Date.now() - row.createdAt < 7 * 86400_000 ||
            posts.some(
              (p) =>
                ["pending", "publishing", "uncertain"].includes(p.status) &&
                p.url === `${base}/uploads/${row.name}`,
            )
          )
            continue;
          if (/^[a-f0-9-]+\.(jpg|mp4)$/.test(row.name))
            await unlink(join(c.uploadsDir, row.name)).catch((e) => {
              if (e.code !== "ENOENT") throw e;
            });
          rows.splice(i, 1);
        }
      });
    });
  }
  await cleanUploads();
  const timer = setInterval(
    () =>
      void cleanUploads().catch(() => app.log.error("Upload cleanup failed.")),
    3600_000,
  );
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
  if (existsSync(join(c.spaDir, "index.html"))) {
    await app.register(fastifyStatic, {
      root: c.spaDir,
      prefix: "/app/",
      list: false,
      dotfiles: "deny",
    });
    app.get("/app", async (_req, reply) => reply.redirect("/app/"));
  }
}
