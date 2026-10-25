import { describe, expect, it } from "vitest";
import { zMessageContent } from "../src/domain.js";
describe("current Instagram text quick replies", () => {
  const text = (quickReplies: unknown[]) => ({
    type: "text",
    text: "Example",
    quickReplies,
  });
  it("accepts thirteen text quick replies with twenty-character titles", () =>
    expect(
      zMessageContent.safeParse(
        text(
          Array.from({ length: 13 }, (_, i) => ({
            title: "x".repeat(20),
            payload: String(i),
          })),
        ),
      ).success,
    ).toBe(true));
  it("rejects an overlong quick reply title", () =>
    expect(
      zMessageContent.safeParse(
        text([{ title: "x".repeat(21), payload: "reply" }]),
      ).success,
    ).toBe(false));
  it("rejects more than thirteen quick replies", () =>
    expect(
      zMessageContent.safeParse(
        text(
          Array.from({ length: 14 }, (_, i) => ({
            title: "Example",
            payload: String(i),
          })),
        ),
      ).success,
    ).toBe(false));
});
