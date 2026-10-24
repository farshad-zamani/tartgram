/** Supported UI locales. Persian is primary; English is the secondary switchable locale. */
export type LocaleCode = "fa" | "en";

export type Direction = "rtl" | "ltr";

export interface LocaleMeta {
  code: LocaleCode;
  /** English name of the language. */
  name: string;
  /** Endonym (name in its own script). */
  nativeName: string;
  dir: Direction;
}

export const LOCALES: Record<LocaleCode, LocaleMeta> = {
  fa: { code: "fa", name: "Persian", nativeName: "فارسی", dir: "rtl" },
  en: { code: "en", name: "English", nativeName: "English", dir: "ltr" },
};

export const DEFAULT_LOCALE: LocaleCode = "fa";

/**
 * The message catalog contract. `fa` is the source of truth; every other locale must
 * satisfy this same shape, so a missing key is a compile error rather than a runtime blank.
 */
export interface Messages {
  app: {
    name: string;
    tagline: string;
  };
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    enabled: string;
    disabled: string;
    loading: string;
    connect: string;
    disconnect: string;
  };
  connection: {
    status_connected: string;
    status_disconnected: string;
    status_connecting: string;
    webhook_healthy: string;
    webhook_unhealthy: string;
  };
  automation: {
    title: string;
    new: string;
    trigger_comment: string;
    trigger_dm_keyword: string;
    trigger_story_reply: string;
    trigger_welcome: string;
    trigger_default_reply: string;
  };
}
