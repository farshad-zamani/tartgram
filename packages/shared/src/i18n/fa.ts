import type { Messages } from "./types.js";

/** Persian catalog — the source of truth for the message contract. */
export const fa: Messages = {
  app: {
    name: "دستیار اینستاگرام",
    tagline: "اتوماسیون کامنت و دایرکت بر پایه‌ی API رسمی اینستاگرام",
  },
  common: {
    save: "ذخیره",
    cancel: "انصراف",
    delete: "حذف",
    edit: "ویرایش",
    enabled: "فعال",
    disabled: "غیرفعال",
    loading: "در حال بارگذاری…",
    connect: "اتصال",
    disconnect: "قطع اتصال",
  },
  connection: {
    status_connected: "متصل",
    status_disconnected: "قطع",
    status_connecting: "در حال اتصال…",
    webhook_healthy: "وب‌هوک سالم است",
    webhook_unhealthy: "وب‌هوک پاسخ نمی‌دهد",
  },
  automation: {
    title: "اتوماسیون‌ها",
    new: "اتوماسیون جدید",
    trigger_comment: "کامنت روی پست",
    trigger_dm_keyword: "کلیدواژه در دایرکت",
    trigger_story_reply: "پاسخ به استوری",
    trigger_welcome: "پیام خوش‌آمد",
    trigger_default_reply: "پاسخ پیش‌فرض",
  },
};
