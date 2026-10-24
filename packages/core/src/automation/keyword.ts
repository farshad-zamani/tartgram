import type { KeywordMatch } from "@app/shared";

/** Unicode-aware word character test (works for Persian/Arabic script, not just ASCII). */
function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  return /[\p{L}\p{N}]/u.test(ch);
}

/**
 * Does `needle` appear in `haystack` as a whole word/phrase (bounded by non-word chars)?
 * Boundary-aware so "cat" does not match inside "category", and it works for Persian text where
 * the ASCII `\b` boundary is unreliable.
 */
function containsPhrase(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return false;
    const before = idx > 0 ? haystack[idx - 1] : undefined;
    const after =
      idx + needle.length < haystack.length
        ? haystack[idx + needle.length]
        : undefined;
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = idx + 1;
  }
}

/**
 * Evaluate a `KeywordMatch` rule against incoming text.
 *
 * Order of precedence:
 *  1. Any `exclude` keyword present → never matches.
 *  2. `matchAll` → matches everything else.
 *  3. `mode`: `any` (≥1 include present), `all` (every include present), `exact` (text equals an include).
 */
export function matchKeyword(rawText: string, rule: KeywordMatch): boolean {
  const norm = (s: string) => {
    const t = s.trim();
    return rule.caseSensitive ? t : t.toLocaleLowerCase();
  };

  const text = norm(rawText);
  const excludes = rule.exclude.map(norm).filter((s) => s.length > 0);
  if (excludes.some((kw) => containsPhrase(text, kw))) return false;

  if (rule.matchAll) return true;

  const includes = rule.include.map(norm).filter((s) => s.length > 0);
  if (includes.length === 0) return false;

  switch (rule.mode) {
    case "exact":
      return includes.some((kw) => text === kw);
    case "all":
      return includes.every((kw) => containsPhrase(text, kw));
    case "any":
    default:
      return includes.some((kw) => containsPhrase(text, kw));
  }
}
