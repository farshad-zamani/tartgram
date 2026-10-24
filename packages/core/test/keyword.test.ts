import { describe, expect, it } from "vitest";
import type { KeywordMatch } from "@app/shared";
import { matchKeyword } from "../src/automation/keyword.js";

function rule(partial: Partial<KeywordMatch>): KeywordMatch {
  return {
    mode: "any",
    matchAll: false,
    caseSensitive: false,
    include: [],
    exclude: [],
    ...partial,
  };
}

describe("matchKeyword", () => {
  it("matches when any include keyword is present (case-insensitive)", () => {
    const r = rule({ mode: "any", include: ["price", "buy"] });
    expect(matchKeyword("What is the PRICE?", r)).toBe(true);
    expect(matchKeyword("just browsing", r)).toBe(false);
  });

  it("respects whole-word boundaries (no partial-word matches)", () => {
    const r = rule({ include: ["cat"] });
    expect(matchKeyword("i love my cat", r)).toBe(true);
    expect(matchKeyword("this is a category", r)).toBe(false);
  });

  it("matches Persian keywords with correct boundaries", () => {
    const r = rule({ include: ["قیمت"] });
    expect(matchKeyword("سلام قیمت این محصول چند؟", r)).toBe(true);
    expect(matchKeyword("سلام خوبی", r)).toBe(false);
  });

  it("mode=all requires every include keyword", () => {
    const r = rule({ mode: "all", include: ["size", "color"] });
    expect(matchKeyword("what size and color?", r)).toBe(true);
    expect(matchKeyword("what size?", r)).toBe(false);
  });

  it("mode=exact requires the whole text to equal a keyword", () => {
    const r = rule({ mode: "exact", include: ["link"] });
    expect(matchKeyword("link", r)).toBe(true);
    expect(matchKeyword(" LINK ", r)).toBe(true);
    expect(matchKeyword("send me the link", r)).toBe(false);
  });

  it("exclude keywords veto a match", () => {
    const r = rule({ include: ["price"], exclude: ["wholesale"] });
    expect(matchKeyword("price please", r)).toBe(true);
    expect(matchKeyword("wholesale price", r)).toBe(false);
  });

  it("matchAll matches everything except excluded", () => {
    const r = rule({ matchAll: true, exclude: ["spam"] });
    expect(matchKeyword("literally anything", r)).toBe(true);
    expect(matchKeyword("this is spam", r)).toBe(false);
  });

  it("empty include with matchAll=false never matches", () => {
    expect(matchKeyword("hello", rule({}))).toBe(false);
  });

  it("caseSensitive respects case", () => {
    const r = rule({ include: ["Buy"], caseSensitive: true });
    expect(matchKeyword("Buy now", r)).toBe(true);
    expect(matchKeyword("buy now", r)).toBe(false);
  });
});
