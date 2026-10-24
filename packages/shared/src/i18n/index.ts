import { en } from "./en.js";
import { fa } from "./fa.js";
import {
  DEFAULT_LOCALE,
  LOCALES,
  type LocaleCode,
  type Messages,
} from "./types.js";

export * from "./types.js";

export const messages: Record<LocaleCode, Messages> = { fa, en };

/** Returns the full catalog for a locale, falling back to the default locale. */
export function getMessages(locale: LocaleCode): Messages {
  return messages[locale] ?? messages[DEFAULT_LOCALE];
}

/** Text direction for a locale. */
export function directionOf(locale: LocaleCode): "rtl" | "ltr" {
  return (LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE]).dir;
}
