import { describe, expect, it } from "vitest";
import { DedupeCache } from "../src/util/dedupe.js";

describe("DedupeCache", () => {
  it("returns false the first time and true on repeat within TTL", () => {
    let now = 1000;
    const cache = new DedupeCache({ ttlMs: 5000, clock: { now: () => now } });
    expect(cache.seen("k1")).toBe(false);
    expect(cache.seen("k1")).toBe(true);
    now += 4000;
    expect(cache.seen("k1")).toBe(true);
  });

  it("forgets keys after the TTL elapses", () => {
    let now = 1000;
    const cache = new DedupeCache({ ttlMs: 5000, clock: { now: () => now } });
    expect(cache.seen("k1")).toBe(false);
    now += 6000;
    expect(cache.seen("k1")).toBe(false);
  });

  it("tracks distinct keys independently", () => {
    const cache = new DedupeCache({ ttlMs: 5000 });
    expect(cache.seen("a")).toBe(false);
    expect(cache.seen("b")).toBe(false);
    expect(cache.seen("a")).toBe(true);
    expect(cache.seen("b")).toBe(true);
  });
});
