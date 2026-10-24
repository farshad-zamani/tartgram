import { systemClock, type Clock } from "../ports.js";

/**
 * In-memory TTL set for idempotency. Meta can redeliver the same webhook event, so callers check
 * `seen(dedupeKey)` before processing. For a single gateway instance this is sufficient; a
 * multi-instance deployment would back this with Redis (same interface).
 */
export class DedupeCache {
  private readonly ttlMs: number;
  private readonly clock: Clock;
  private readonly entries = new Map<string, number>();
  private lastSweep = 0;

  constructor(opts?: { ttlMs?: number; clock?: Clock }) {
    this.ttlMs = opts?.ttlMs ?? 10 * 60 * 1000;
    this.clock = opts?.clock ?? systemClock;
  }

  /** Returns true if the key was already seen within the TTL; otherwise records it and returns false. */
  seen(key: string): boolean {
    const now = this.clock.now();
    this.maybeSweep(now);
    const expiry = this.entries.get(key);
    if (expiry !== undefined && expiry > now) return true;
    this.entries.set(key, now + this.ttlMs);
    return false;
  }

  get size(): number {
    return this.entries.size;
  }

  private maybeSweep(now: number): void {
    if (now - this.lastSweep < this.ttlMs) return;
    this.lastSweep = now;
    for (const [key, expiry] of this.entries) {
      if (expiry <= now) this.entries.delete(key);
    }
  }
}
