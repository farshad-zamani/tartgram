import type { StatKind, StatsRecorder } from "@app/core";
import { JsonFile } from "./storage.js";
export interface StatsData {
  totals: Record<StatKind, number>;
  perAutomation: Record<string, { triggered: number; sent: number }>;
  updatedAt: number;
}
function empty(): StatsData {
  return {
    totals: {
      triggered: 0,
      sent: 0,
      follow_gate_prompt: 0,
      follow_gate_pass: 0,
    },
    perAutomation: {},
    updatedAt: 0,
  };
}
export class JsonStatsRecorder implements StatsRecorder {
  private db: JsonFile<Record<string, StatsData>>;
  constructor(file?: string) {
    this.db = new JsonFile(file, () => ({}));
  }
  async record(
    kind: StatKind,
    meta: { accountId: string; automationId?: string; count?: number },
  ): Promise<void> {
    await this.db.update((all) => {
      const d = (all[meta.accountId] ??= empty()),
        n = meta.count ?? 1;
      d.totals[kind] += n;
      if (meta.automationId) {
        const a = (d.perAutomation[meta.automationId] ??= {
          triggered: 0,
          sent: 0,
        });
        if (kind === "triggered") a.triggered += n;
        if (kind === "sent") a.sent += n;
      }
      d.updatedAt = Date.now();
    });
  }
  async snapshot(): Promise<StatsData> {
    const result = empty();
    for (const d of Object.values(await this.db.read())) {
      for (const k of Object.keys(result.totals) as StatKind[])
        result.totals[k] += d.totals[k];
      Object.assign(result.perAutomation, d.perAutomation);
      result.updatedAt = Math.max(result.updatedAt, d.updatedAt);
    }
    return result;
  }
  async removeAccount(id: string): Promise<void> {
    await this.db.update((all) => {
      delete all[id];
    });
  }
}
