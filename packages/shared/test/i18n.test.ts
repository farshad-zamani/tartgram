import { describe, expect, it } from "vitest";
import { MESSAGE_LIMITS, TIMING } from "../src/constants.js";
import { directionOf, getMessages, messages } from "../src/i18n/index.js";

/** Collect all leaf key paths of a nested object, e.g. "common.save". */
function keyPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("i18n catalogs", () => {
  it("fa and en expose exactly the same keys (no missing translations)", () => {
    const fa = keyPaths(messages.fa).sort();
    const en = keyPaths(messages.en).sort();
    expect(en).toEqual(fa);
  });

  it("every string is non-empty in both locales", () => {
    for (const locale of ["fa", "en"] as const) {
      const flat = keyPaths(messages[locale]);
      expect(flat.length).toBeGreaterThan(0);
      for (const path of flat) {
        const value = path
          .split(".")
          .reduce<unknown>(
            (acc, k) => (acc as Record<string, unknown>)[k],
            messages[locale],
          );
        expect(typeof value).toBe("string");
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("resolves direction per locale", () => {
    expect(directionOf("fa")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });

  it("getMessages falls back to the default locale for an unknown code", () => {
    // @ts-expect-error intentionally passing an invalid locale
    expect(getMessages("de")).toBe(messages.fa);
  });
});

describe("Meta API constants", () => {
  it("encodes the documented messaging windows and limits", () => {
    expect(TIMING.privateReplyWindowDays).toBe(7);
    expect(TIMING.messagingWindowHours).toBe(24);
    expect(MESSAGE_LIMITS.maxQuickReplies).toBe(13);
    expect(MESSAGE_LIMITS.maxIceBreakers).toBe(4);
    expect(MESSAGE_LIMITS.textMaxBytes).toBe(1000);
  });
});
