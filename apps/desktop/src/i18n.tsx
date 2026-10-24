import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "fa" | "en";

type Entry = { fa: string; en: string };

/** Full UI string catalog. Persian is the primary market; English is required for Meta App Review. */
import { releaseStrings } from "./release-strings.js";
const DICT = {
  ...releaseStrings,
  "app.name": { fa: "TartGram", en: "TartGram" },
  "app.subtitle": {
    fa: "پنل مدیریت اتوماسیون",
    en: "Automation control panel",
  },
  "common.loading": { fa: "در حال بارگذاری…", en: "Loading…" },
  "common.save": { fa: "ذخیره", en: "Save" },
  "common.cancel": { fa: "انصراف", en: "Cancel" },
  "common.delete": { fa: "حذف", en: "Delete" },
  "common.edit": { fa: "ویرایش", en: "Edit" },
  "common.send": { fa: "ارسال", en: "Send" },
  "common.saving": { fa: "در حال ذخیره…", en: "Saving…" },
  "common.saved": { fa: "ذخیره شد ✓", en: "Saved ✓" },
  "common.connectFirst": {
    fa: "ابتدا یک اکانت اینستاگرام را متصل کنید.",
    en: "Connect an Instagram account first.",
  },
  "common.noAccount": { fa: "اکانتی متصل نیست", en: "No account connected" },

  "login.title": { fa: "ورود به پنل", en: "Sign in" },
  "login.desc": {
    fa: "توکن دسترسیِ پنل را وارد کنید تا به اکانت‌ها و اتوماسیون‌ها دسترسی پیدا کنید.",
    en: "Enter your panel access token to manage connected accounts and automations.",
  },
  "login.token": { fa: "توکن دسترسی", en: "Access token" },
  "login.submit": { fa: "ورود", en: "Sign in" },
  "login.checking": { fa: "در حال بررسی…", en: "Checking…" },
  "login.invalid": {
    fa: "توکن نامعتبر است یا سرور در دسترس نیست.",
    en: "Invalid token or the server is unreachable.",
  },

  "nav.dashboard": { fa: "داشبورد", en: "Dashboard" },
  "nav.inbox": { fa: "اینباکس", en: "Inbox" },
  "nav.contacts": { fa: "مخاطبان", en: "Contacts" },
  "nav.automations": { fa: "اتوماسیون‌ها", en: "Automations" },
  "nav.icebreakers": { fa: "شروع گفتگو", en: "Ice Breakers" },
  "nav.publish": { fa: "انتشار", en: "Publish" },
  "nav.accounts": { fa: "اکانت‌ها", en: "Accounts" },
  "nav.settings": { fa: "تنظیمات", en: "Settings" },
  "nav.logout": { fa: "خروج", en: "Sign out" },

  "conn.error": {
    fa: "اتصال به سرور برقرار نشد. توکن یا دسترسی شبکه را بررسی کنید.",
    en: "Could not reach the server. Check the token or your network.",
  },

  "dash.title": { fa: "داشبورد", en: "Dashboard" },
  "dash.subtitle": {
    fa: "نمای کلیِ اتصال‌ها و اتوماسیون‌ها",
    en: "Overview of connections and automations",
  },
  "dash.accounts": { fa: "اکانت‌های متصل", en: "Connected accounts" },
  "dash.activeAutomations": {
    fa: "اتوماسیون‌های فعال",
    en: "Active automations",
  },
  "dash.engine": { fa: "موتور اتوماسیون", en: "Automation engine" },
  "dash.engineOn": { fa: "روشن", en: "On" },
  "dash.engineOff": { fa: "خاموش", en: "Off" },
  "dash.cloudMode": { fa: "حالت ابری", en: "Cloud mode" },
  "dash.inactive": { fa: "غیرفعال", en: "Inactive" },
  "dash.webhook": { fa: "وضعیت وب‌هوک", en: "Webhook status" },
  "dash.healthy": { fa: "سالم", en: "Healthy" },
  "dash.perf": { fa: "آمار عملکرد", en: "Performance" },
  "dash.triggered": {
    fa: "اتوماسیون‌های اجراشده",
    en: "Automations triggered",
  },
  "dash.sent": { fa: "پیام‌های ارسال‌شده", en: "Messages sent" },
  "dash.fgPrompt": { fa: "درخواست فالو", en: "Follow prompts" },
  "dash.fgPass": { fa: "فالوهای تأییدشده", en: "Verified follows" },
  "dash.viaFollowGate": { fa: "از طریق قفل فالو", en: "via follow-gate" },
  "dash.connected": { fa: "متصل", en: "Connected" },
  "dash.manageAccounts": { fa: "مدیریت اکانت‌ها", en: "Manage accounts" },
  "dash.noAccountTitle": {
    fa: "هنوز اکانتی متصل نشده",
    en: "No account connected yet",
  },
  "dash.noAccountBody": {
    fa: "برای شروع، یک اکانت اینستاگرام بیزنس/کریتور را از طریق ورود امن متا متصل کنید.",
    en: "To get started, connect an Instagram Business/Creator account via Meta's secure login.",
  },
  "dash.connectAccount": { fa: "اتصال اکانت", en: "Connect account" },

  "accounts.title": { fa: "اکانت‌ها", en: "Accounts" },
  "accounts.subtitle": {
    fa: "اکانت‌های اینستاگرام متصل به پلتفرم",
    en: "Instagram accounts connected to the platform",
  },
  "accounts.connect": { fa: "اتصال اینستاگرام", en: "Connect Instagram" },
  "accounts.emptyTitle": { fa: "اکانتی متصل نیست", en: "No account connected" },
  "accounts.emptyBody": {
    fa: "روی «اتصال اینستاگرام» بزنید تا به صفحهٔ ورود امن متا هدایت شوید و اکانت بیزنس خود را وصل کنید.",
    en: "Click “Connect Instagram” to go to Meta's secure login and connect your business account.",
  },
  "accounts.active": { fa: "فعال", en: "Active" },
  "accounts.daysLeft": {
    fa: "{n} روز تا انقضای توکن",
    en: "{n} days until token expiry",
  },
  "accounts.expired": { fa: "توکن منقضی شده", en: "Token expired" },

  "settings.title": { fa: "تنظیمات و اتصال", en: "Settings & connection" },
  "settings.subtitle": {
    fa: "وضعیت زیرساخت و لینک اتصال اکانت",
    en: "Infrastructure status and account connect link",
  },
  "settings.system": { fa: "وضعیت سیستم", en: "System status" },
  "settings.engineRow": { fa: "موتور اتوماسیون", en: "Automation engine" },
  "settings.engineOnCloud": { fa: "روشن (ابری)", en: "On (cloud)" },
  "settings.connectedAccounts": {
    fa: "اکانت‌های متصل",
    en: "Connected accounts",
  },
  "settings.activeAutomations": {
    fa: "اتوماسیون‌های فعال",
    en: "Active automations",
  },
  "settings.webhookUrl": { fa: "آدرس وب‌هوک", en: "Webhook URL" },
  "settings.connectLink": {
    fa: "لینک اتصال اینستاگرام",
    en: "Instagram connect link",
  },
  "settings.connectDesc": {
    fa: "این لینک اتصال را در مرورگری که به پنل وارد شده باز کنید. فقط مدیران مجاز می‌توانند حسابی به این نصب اضافه کنند. ورود اینستاگرام در صفحهٔ رسمی متا انجام می‌شود.",
    en: "Open this connection link in a browser signed into the panel. Only authorized administrators can add accounts to this installation. Instagram login takes place on Meta's official page.",
  },
  "settings.copy": { fa: "کپی", en: "Copy" },
  "settings.copied": { fa: "کپی شد", en: "Copied" },
  "settings.openConnect": {
    fa: "باز کردن لینک اتصال",
    en: "Open connect link",
  },
  "settings.igId": { fa: "شناسهٔ اینستاگرام", en: "Instagram id" },
  "settings.tokenExpiry": { fa: "انقضای توکن", en: "Token expiry" },
  "settings.days": { fa: "{n} روز", en: "{n} days" },
  "settings.language": { fa: "زبان", en: "Language" },
  "settings.languageDesc": {
    fa: "زبان و جهت رابط کاربری را انتخاب کنید.",
    en: "Choose the interface language and direction.",
  },
  "settings.defaultAccount": { fa: "اکانت پیش‌فرض", en: "Default account" },
  "settings.defaultAccountDesc": {
    fa: "اکانتی که در همهٔ صفحات به‌صورت پیش‌فرض انتخاب می‌شود.",
    en: "The account selected by default across all pages.",
  },

  "inbox.title": { fa: "اینباکس", en: "Inbox" },
  "inbox.subtitle": {
    fa: "گفتگوهای دایرکت را ببینید و پاسخ دهید",
    en: "View and reply to direct conversations",
  },
  "inbox.tabDm": { fa: "دایرکت‌ها", en: "Direct" },
  "inbox.tabComments": { fa: "کامنت‌ها", en: "Comments" },
  "inbox.noConvos": { fa: "هنوز گفتگویی نیست.", en: "No conversations yet." },
  "inbox.pickConvo": {
    fa: "یک گفتگو را انتخاب کنید.",
    en: "Select a conversation.",
  },
  "inbox.noMessages": {
    fa: "پیامی برای نمایش نیست.",
    en: "No messages to show.",
  },
  "inbox.placeholder": { fa: "پیام خود را بنویسید…", en: "Type a message…" },
  "inbox.sendFail": {
    fa: "ارسال ناموفق بود — احتمالاً خارج از پنجرهٔ ۲۴ ساعته‌اید. گزینهٔ «اپراتور انسانی» را امتحان کنید.",
    en: "Send failed — you may be outside the 24-hour window. Try the “human agent” option.",
  },
  "inbox.humanAgent": {
    fa: "پاسخ به‌عنوان اپراتور انسانی (برای خارج از پنجرهٔ ۲۴ ساعته، تا ۷ روز)",
    en: "Reply as a human agent (outside the 24h window, up to 7 days)",
  },
  "inbox.attachment": { fa: "[پیوست]", en: "[attachment]" },
  "inbox.commentsEmptyTitle": { fa: "کامنتی نیست", en: "No comments" },
  "inbox.commentsEmptyBody": {
    fa: "کامنت‌های جدیدِ پست‌ها و ریلزهای شما همین‌جا لحظه‌ای نمایش داده می‌شوند.",
    en: "New comments on your posts and reels appear here in real time.",
  },
  "inbox.reply": { fa: "پاسخ", en: "Reply" },
  "inbox.hide": { fa: "مخفی‌کردن", en: "Hide" },
  "inbox.unhide": { fa: "نمایش", en: "Unhide" },
  "inbox.replied": { fa: "پاسخ داده شد", en: "Replied" },
  "inbox.hidden": { fa: "مخفی", en: "Hidden" },
  "inbox.deleted": { fa: "حذف شد", en: "Deleted" },
  "inbox.publicReply": {
    fa: "پاسخ عمومی به کامنت…",
    en: "Public reply to the comment…",
  },

  "contacts.title": { fa: "مخاطبان", en: "Contacts" },
  "contacts.subtitle": {
    fa: "افرادی که با اکانت شما پیام رد و بدل کرده‌اند",
    en: "People who have messaged your account",
  },
  "contacts.export": { fa: "خروجی CSV", en: "Export CSV" },
  "contacts.broadcast": { fa: "پیام گروهی (برادکست)", en: "Broadcast" },
  "contacts.broadcastDesc": {
    fa: "طبق سیاست متا، پیام گروهی فقط برای مخاطبانی ارسال می‌شود که در ۲۴ ساعت گذشته به شما پیام داده‌اند.",
    en: "Per Meta policy, a broadcast is sent only to contacts who messaged you in the last 24 hours.",
  },
  "contacts.eligibleNow": {
    fa: "هم‌اکنون {n} مخاطب واجد شرایط هستند.",
    en: "{n} contacts are currently eligible.",
  },
  "contacts.broadcastPlaceholder": {
    fa: "متن پیام گروهی…",
    en: "Broadcast message…",
  },
  "contacts.sendToN": { fa: "ارسال به {n} مخاطب", en: "Send to {n} contacts" },
  "contacts.broadcastResult": {
    fa: "به {sent} مخاطب (از {eligible} واجد شرایط) ارسال شد.",
    en: "Sent to {sent} of {eligible} eligible contacts.",
  },
  "contacts.broadcastFail": {
    fa: "ارسال با خطا مواجه شد.",
    en: "Broadcast failed.",
  },
  "contacts.emptyTitle": { fa: "هنوز مخاطبی نیست", en: "No contacts yet" },
  "contacts.emptyBody": {
    fa: "به‌محض اینکه کاربری به اکانت شما پیام دهد، اینجا اضافه می‌شود.",
    en: "As soon as someone messages your account, they appear here.",
  },
  "contacts.follower": { fa: "فالوئر", en: "Follower" },

  "ib.title": { fa: "شروع گفتگو (Ice Breakers)", en: "Ice Breakers" },
  "ib.subtitle": {
    fa: "تا ۴ سؤال آماده که وقتی کاربر دایرکت را باز می‌کند نمایش داده می‌شود",
    en: "Up to 4 FAQ starters shown when a user opens the DM",
  },
  "ib.saveApply": {
    fa: "ذخیره و اعمال روی اینستاگرام",
    en: "Save & apply to Instagram",
  },
  "ib.question": { fa: "سؤال {n}", en: "Question {n}" },
  "ib.questionPlaceholder": {
    fa: "سؤال (مثلاً: قیمت‌ها چنده؟)",
    en: "Question (e.g. What are your prices?)",
  },
  "ib.answerPlaceholder": {
    fa: "پاسخی که به‌صورت دایرکت فرستاده می‌شود…",
    en: "The reply sent as a DM…",
  },
  "ib.add": { fa: "افزودن سؤال ({n}/۴)", en: "Add question ({n}/4)" },
  "ib.empty": {
    fa: "هنوز سؤالی اضافه نکرده‌اید. با «افزودن سؤال» شروع کنید.",
    en: "No questions yet. Start with “Add question”.",
  },

  "pub.title": { fa: "انتشار و زمان‌بندی", en: "Publish & schedule" },
  "pub.subtitle": {
    fa: "عکس، ریلز یا استوری را منتشر یا زمان‌بندی کنید",
    en: "Publish or schedule a photo, reel, or story",
  },
  "pub.todayCount": {
    fa: "{used} از {total} پست امروز",
    en: "{used} of {total} posts today",
  },
  "pub.type": { fa: "نوع", en: "Type" },
  "pub.image": { fa: "عکس", en: "Photo" },
  "pub.reel": { fa: "ریلز", en: "Reel" },
  "pub.story": { fa: "استوری", en: "Story" },
  "pub.file": { fa: "فایل رسانه", en: "Media file" },
  "pub.chooseFile": { fa: "انتخاب فایل از سیستم", en: "Choose a file" },
  "pub.uploading": { fa: "در حال آپلود…", en: "Uploading…" },
  "pub.uploaded": { fa: "فایل آپلود شد ✓", en: "File uploaded ✓" },
  "pub.orUrl": {
    fa: "یا آدرس مستقیم فایل را وارد کنید",
    en: "Or enter a direct file URL",
  },
  "pub.caption": { fa: "کپشن", en: "Caption" },
  "pub.captionPlaceholder": { fa: "متن پست…", en: "Post text…" },
  "pub.saveToLibrary": { fa: "ذخیره در کتابخانه", en: "Save to library" },
  "pub.library": { fa: "کتابخانهٔ کپشن ({n})", en: "Caption library ({n})" },
  "pub.when": { fa: "زمان انتشار", en: "When to publish" },
  "pub.now": { fa: "همین حالا", en: "Now" },
  "pub.schedule": { fa: "زمان‌بندی", en: "Schedule" },
  "pub.publish": { fa: "انتشار", en: "Publish" },
  "pub.processing": { fa: "در حال پردازش…", en: "Processing…" },
  "pub.note": {
    fa: "توجه: طبق API متا، فایل باید عمومی باشد. برای ویدیو/ریلز پردازش چند لحظه طول می‌کشد.",
    en: "Note: per Meta's API the file must be public. Video/reel processing takes a moment.",
  },
  "pub.scheduled": { fa: "پست زمان‌بندی شد ✅", en: "Post scheduled ✅" },
  "pub.published": { fa: "پست منتشر شد ✅", en: "Post published ✅" },
  "pub.publishFail": {
    fa: "انتشار ناموفق بود — فایل باید عمومی/معتبر باشد و محدودیت روزانه رعایت شود.",
    en: "Publish failed — the file must be public/valid and within the daily limit.",
  },
  "pub.uploadFail": {
    fa: "آپلود ناموفق بود (حداکثر ۲۰۰ مگابایت).",
    en: "Upload failed (max 200MB).",
  },
  "pub.scheduledList": { fa: "پست‌های زمان‌بندی‌شده", en: "Scheduled posts" },
  "pub.noScheduled": {
    fa: "پستی زمان‌بندی نشده است.",
    en: "No scheduled posts.",
  },
  "pub.stPending": { fa: "در انتظار", en: "Pending" },
  "pub.stPublished": { fa: "منتشر شد", en: "Published" },
  "pub.stFailed": { fa: "ناموفق", en: "Failed" },

  "auto.title": { fa: "اتوماسیون‌ها", en: "Automations" },
  "auto.subtitleRules": {
    fa: "قوانین پاسخ خودکار به کامنت و دایرکت",
    en: "Auto-reply rules for comments and DMs",
  },
  "auto.new": { fa: "اتوماسیون جدید", en: "New automation" },
  "auto.emptyTitle": {
    fa: "هنوز اتوماسیونی نساخته‌اید",
    en: "No automations yet",
  },
  "auto.emptyBody": {
    fa: "یک قانون بسازید: وقتی کسی روی یک پست کلمهٔ خاصی را کامنت کرد یا دایرکت داد، خودکار پیام بفرست.",
    en: "Create a rule: when someone comments a keyword on a post or DMs it, auto-send a message.",
  },
  "auto.createFirst": {
    fa: "ساخت اولین اتوماسیون",
    en: "Create your first automation",
  },
  "auto.allPosts": { fa: "همهٔ پست‌ها", en: "All posts" },
  "auto.nSelected": { fa: "{n} پست انتخابی", en: "{n} selected posts" },
  "auto.allComments": { fa: "همهٔ کامنت‌ها", en: "All comments" },
  "auto.followGate": { fa: "قفل فالو", en: "Follow gate" },
  "auto.edit": { fa: "ویرایش", en: "Edit" },
  "auto.delete": { fa: "حذف", en: "Delete" },
  "auto.editTitle": { fa: "ویرایش اتوماسیون", en: "Edit automation" },
  "auto.newTitle": { fa: "اتوماسیون جدید", en: "New automation" },
  "auto.name": { fa: "نام اتوماسیون", en: "Automation name" },
  "auto.namePlaceholder": {
    fa: "مثلاً: ارسال لینک قیمت",
    en: "e.g. Send price link",
  },
  "auto.account": { fa: "اکانت", en: "Account" },
  "auto.triggerType": { fa: "نوع تریگر", en: "Trigger type" },
  "auto.tComment": { fa: "کامنت روی پست", en: "Comment on a post" },
  "auto.tDm": { fa: "کلیدواژه در دایرکت", en: "Keyword in DM" },
  "auto.tStoryReply": { fa: "پاسخ به استوری", en: "Story reply" },
  "auto.tStoryMention": { fa: "منشن در استوری", en: "Story mention" },
  "auto.tDefault": { fa: "پاسخ پیش‌فرض", en: "Default reply" },
  "auto.hintMention": {
    fa: "هر بار که پیج شما در استوریِ یک کاربر منشن شود، این پیام خودکار برایش ارسال می‌شود.",
    en: "Whenever your page is mentioned in a user's story, this message is auto-sent to them.",
  },
  "auto.hintDefault": {
    fa: "برای پیام‌هایی در دایرکت که با هیچ کیورد دیگری مطابقت ندارند، این پاسخ ارسال می‌شود.",
    en: "This reply is sent for DMs that match no other keyword.",
  },
  "auto.whichPosts": {
    fa: "این اتوماسیون روی کدام پست‌ها اجرا شود؟",
    en: "Which posts should this run on?",
  },
  "auto.selectPosts": { fa: "پست‌های انتخابی", en: "Selected posts" },
  "auto.matchAll": {
    fa: "پاسخ به همهٔ کامنت‌ها (بدون کلیدواژه)",
    en: "Reply to all comments (no keyword)",
  },
  "auto.keywords": {
    fa: "کلیدواژه‌ها (با ویرگول جدا کنید)",
    en: "Keywords (comma-separated)",
  },
  "auto.modeAny": { fa: "هر کدام", en: "Any" },
  "auto.modeAll": { fa: "همه", en: "All" },
  "auto.modeExact": { fa: "دقیق", en: "Exact" },
  "auto.dmText": { fa: "متن پیامِ دایرکت", en: "DM message text" },
  "auto.dmPlaceholder": {
    fa: "سلام 👋 ممنون که پیام دادی! لینک محصول: https://…",
    en: "Hi 👋 thanks for reaching out! Product link: https://…",
  },
  "auto.publicReplyOpt": {
    fa: "پاسخ عمومی زیر کامنت (اختیاری)",
    en: "Public reply under the comment (optional)",
  },
  "auto.publicReplyPlaceholder": {
    fa: "برات دایرکت کردم 📩",
    en: "Sent you a DM 📩",
  },
  "auto.fgTitle": { fa: "قفل فالو (Follow Gate)", en: "Follow Gate" },
  "auto.fgDesc": {
    fa: "اول از کاربر می‌خواهد فالو کند؛ پس از زدن دکمهٔ «فالو کردم» و تأیید فالو بودن، پیام نهایی بالا ارسال می‌شود.",
    en: "First asks the user to follow; after they tap “I followed” and the follow is verified, the reward message above is sent.",
  },
  "auto.fgPrompt": { fa: "پیام درخواست فالو", en: "Follow request message" },
  "auto.fgButton": { fa: "متن دکمه (حداکثر ۲۰)", en: "Button label (max 20)" },
  "auto.fgNotFollowing": {
    fa: "پیام «هنوز فالو نکردی»",
    en: "“Not following yet” message",
  },
  "auto.saveChanges": { fa: "ذخیرهٔ تغییرات", en: "Save changes" },
  "auto.create": { fa: "ساخت اتوماسیون", en: "Create automation" },
  "auto.mediaError": {
    fa: "دریافت پست‌ها ممکن نشد (اکانت باید پست داشته باشد).",
    en: "Couldn't load posts (the account must have posts).",
  },
  "auto.mediaLoading": { fa: "در حال بارگذاری پست‌ها…", en: "Loading posts…" },
  "auto.mediaEmpty": {
    fa: "این اکانت هنوز پستی ندارد.",
    en: "This account has no posts yet.",
  },
} as const satisfies Record<string, Entry>;

export type MsgKey = keyof typeof DICT;

interface I18nValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: (key: MsgKey, vars?: Record<string, string | number>) => string;
  setLang: (l: Lang) => void;
}

const I18nCtx = createContext<I18nValue>({
  lang: "fa",
  dir: "rtl",
  t: (k) => k,
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("lang") as Lang) || "fa",
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    localStorage.setItem("lang", lang);
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir: lang === "fa" ? "rtl" : "ltr",
      setLang,
      t: (key, vars) => {
        let s: string = DICT[key]?.[lang] ?? key;
        if (vars)
          for (const k of Object.keys(vars))
            s = s.replaceAll(`{${k}}`, String(vars[k]));
        return s;
      },
    }),
    [lang],
  );

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
