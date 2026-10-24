import { GraphClient, type Logger } from "@app/core";
import type { GatewayConfig } from "./config.js";
import { JsonAccountStore } from "./account-store.js";
import { JsonFile, serialized } from "./storage.js";
import { clientForAccount } from "./account-client.js";
import { accountLock } from "./operations.js";
export type PostType = "image" | "reel" | "story";
export interface ScheduledPost {
  id: string;
  igId: string;
  type: PostType;
  url: string;
  caption?: string;
  scheduleAt: number;
  status: "pending" | "publishing" | "published" | "failed" | "uncertain";
  publishedMediaId?: string;
  error?: string;
  warnings?: string[];
  createdAt: number;
}
export class ScheduledStore {
  private db: JsonFile<ScheduledPost[]>;
  constructor(file: string) {
    this.db = new JsonFile(file, () => []);
  }
  load() {
    return this.db.read();
  }
  async add(post: ScheduledPost) {
    await this.db.update((rows) => {
      rows.push(post);
    });
  }
  async remove(id: string, igId: string) {
    await this.db.update((rows) => {
      const i = rows.findIndex((x) => x.id === id && x.igId === igId);
      if (i >= 0) rows.splice(i, 1);
    });
  }
  async update(id: string, patch: Partial<ScheduledPost>) {
    await this.db.update((rows) => {
      const p = rows.find((x) => x.id === id);
      if (p) Object.assign(p, patch);
    });
  }
  async removeAccount(igId: string) {
    await this.db.update((rows) => {
      for (let i = rows.length - 1; i >= 0; i--)
        if (rows[i]!.igId === igId) rows.splice(i, 1);
    });
  }
}
export async function publishNow(
  client: GraphClient,
  type: PostType,
  url: string,
  caption?: string,
): Promise<string> {
  const quota = (await client.getContentPublishingLimit()).data?.[0];
  if (
    typeof quota?.quota_usage !== "number" ||
    typeof quota?.config?.quota_total !== "number"
  )
    throw new Error("Publishing quota unavailable. Try again later.");
  if (quota.quota_usage >= quota.config.quota_total)
    throw new Error("The account publishing quota is exhausted.");
  if (type === "image") return client.publishImage(url, caption);
  if (type === "reel") return client.publishReel(url, caption);
  return client.publishStory(url, /\.mp4(?:\?|#|$)/i.test(url), caption);
}
export function startScheduler(opts: {
  accounts: JsonAccountStore;
  scheduled: ScheduledStore;
  logger: Logger;
  config: GatewayConfig;
  intervalMs?: number;
}): () => Promise<void> {
  let stopping = false,
    running: Promise<void> | null = null,
    initialized = false;
  async function tick() {
    if (stopping || running) return;
    running = (async () => {
      if (!initialized) {
        for (const p of await opts.scheduled.load())
          if (p.status === "publishing")
            await opts.scheduled.update(p.id, {
              status: "uncertain",
              error:
                "Interrupted during publishing. Check Instagram before trying again.",
            });
        initialized = true;
      }
      const due = (await opts.scheduled.load()).filter(
        (p) => p.status === "pending" && p.scheduleAt <= Date.now(),
      );
      for (const post of due) {
        if (stopping) break;
        await serialized(accountLock(post.igId), async () => {
          const current = (await opts.scheduled.load()).find(
            (p) => p.id === post.id,
          );
          if (current?.status !== "pending") return;
          const client = await clientForAccount(
            opts.accounts,
            post.igId,
            opts.config,
          );
          if (!client) {
            await opts.scheduled.update(post.id, {
              status: "failed",
              error: "Account is disconnected.",
            });
            return;
          }
          await opts.scheduled.update(post.id, { status: "publishing" });
          try {
            const mediaId = await publishNow(
              client,
              post.type,
              post.url,
              post.caption,
            );
            await opts.scheduled.update(post.id, {
              status: "published",
              publishedMediaId: mediaId,
              warnings: client.publishWarnings,
            });
          } catch {
            await opts.scheduled.update(post.id, {
              status: "failed",
              error:
                "Publishing failed. Check permissions, quota and media requirements. Check Instagram before retrying a timed-out request.",
            });
          }
        });
      }
    })()
      .catch(() =>
        opts.logger.error(
          "Scheduler failed; inspect storage and account setup.",
        ),
      )
      .finally(() => {
        running = null;
      });
    await running;
  }
  const interval = setInterval(() => void tick(), opts.intervalMs ?? 30_000);
  interval.unref();
  void tick();
  return async () => {
    stopping = true;
    clearInterval(interval);
    await running;
  };
}
