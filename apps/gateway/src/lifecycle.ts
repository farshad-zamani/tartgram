import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { JsonFile, serialized } from "./storage.js";
import type { GatewayConfig } from "./config.js";
import { JsonAccountStore } from "./account-store.js";
import type { JsonContactStore } from "./contacts-store.js";
import type { JsonCommentStore } from "./comments-store.js";
import type { JsonStatsRecorder } from "./stats.js";
import { loadAutomationsFile, saveAutomationsFile } from "./engine-adapters.js";
import { ScheduledStore } from "./publishing.js";
export interface UploadRecord {
  name: string;
  accountId: string;
  mime: string;
  createdAt: number;
}
import { accountLock } from "./operations.js";
export async function purgeAccount(
  c: GatewayConfig,
  id: string,
  stores: {
    contacts: JsonContactStore;
    comments: JsonCommentStore;
    stats: JsonStatsRecorder;
  },
): Promise<void> {
  await serialized(c.accountsFile + "#workspace-write", () =>
    serialized(accountLock(id), async () => {
      const accounts = new JsonAccountStore(
        c.accountsFile,
        c.tokenEncryptionKey,
      );
      // Disable access first; queued events and scheduled jobs recheck under this same account lock.
      const record = (await accounts.load()).find((a) => a.igId === id);
      if (record)
        await accounts.upsert({
          ...record,
          reconnectRequired: true,
          subscriptionStatus: "failed",
        });
      await stores.contacts.removeAccount(id);
      await stores.comments.removeAccount(id);
      await stores.stats.removeAccount(id);
      await serialized(c.automationsFile, async () => {
        const def = await loadAutomationsFile(c.automationsFile);
        def.automations = def.automations.filter((a) => a.accountId !== id);
        delete def.flows[id];
        delete def.iceBreakers[id];
        await saveAutomationsFile(c.automationsFile, def);
      });
      await new ScheduledStore(c.scheduledFile).removeAccount(id);
      const uploads = new JsonFile<UploadRecord[]>(c.uploadsFile, () => []);
      await uploads.update(async (rows) => {
        for (let i = rows.length - 1; i >= 0; i--)
          if (rows[i]!.accountId === id) {
            const row = rows[i]!;
            if (/^[a-f0-9-]+\.(jpg|mp4)$/.test(row.name))
              await unlink(join(c.uploadsDir, row.name)).catch((e) => {
                if (e.code !== "ENOENT") throw e;
              });
            rows.splice(i, 1);
          }
      });
      const settings = new JsonFile<{ defaultAccountId?: string }>(
        c.settingsFile,
        () => ({}),
      );
      await settings.update((s) => {
        if (s.defaultAccountId === id) delete s.defaultAccountId;
      });
      const receipts = new JsonFile<
        Record<string, { accountId: string; at: number }>
      >(c.receiptsFile, () => ({}));
      await receipts.update((rows) => {
        for (const [k, v] of Object.entries(rows))
          if (v.accountId === id) delete rows[k];
      });
      await accounts.remove(id);
    }),
  );
}
