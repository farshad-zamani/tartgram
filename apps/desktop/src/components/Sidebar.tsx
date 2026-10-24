import { useI18n, type MsgKey } from "../i18n.js";
import {
  IconBolt,
  IconCalendar,
  IconChat,
  IconGear,
  IconGrid,
  IconInbox,
  IconInstagram,
  IconLogout,
  IconUsers,
} from "./icons.js";

export type Page =
  | "dashboard"
  | "inbox"
  | "contacts"
  | "automations"
  | "icebreakers"
  | "publish"
  | "accounts"
  | "settings";

const NAV: {
  id: Page;
  label: MsgKey;
  icon: (p: { className?: string }) => JSX.Element;
}[] = [
  { id: "dashboard", label: "nav.dashboard", icon: IconGrid },
  { id: "inbox", label: "nav.inbox", icon: IconInbox },
  { id: "contacts", label: "nav.contacts", icon: IconUsers },
  { id: "automations", label: "nav.automations", icon: IconBolt },
  { id: "icebreakers", label: "nav.icebreakers", icon: IconChat },
  { id: "publish", label: "nav.publish", icon: IconCalendar },
  { id: "accounts", label: "nav.accounts", icon: IconInstagram },
  { id: "settings", label: "nav.settings", icon: IconGear },
];

export function Sidebar({
  page,
  onNavigate,
  onLogout,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  return (
    <aside className="flex w-16 md:w-64 shrink-0 flex-col border-e border-ink-800/70 bg-ink-900/40 px-2 py-6 md:px-4 backdrop-blur-sm">
      <div className="mb-8 flex items-center gap-3 px-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-coral-500 text-ink-950 shadow-glow">
          <IconInstagram className="h-5 w-5" />
        </span>
        <div className="hidden leading-tight md:block">
          <div className="text-sm font-extrabold text-cream-50">
            {t("app.name")}
          </div>
          <div className="text-[11px] text-sand">v0.1</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5">
        {NAV.map((item) => {
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={t(item.label)}
              aria-label={t(item.label)}
              className={`group flex items-center gap-3 rounded-xl px-2 py-2.5 md:px-3.5 text-sm font-medium transition-all ${
                active
                  ? "bg-coral-500/12 text-cream-50 ring-1 ring-coral-500/30"
                  : "text-cream-300 hover:bg-ink-850 hover:text-cream-50"
              }`}
            >
              <item.icon
                className={`h-[18px] w-[18px] ${active ? "text-coral-400" : "text-sand group-hover:text-cream-100"}`}
              />
              <span className="hidden md:inline">{t(item.label)}</span>
              {active && (
                <span className="ms-auto hidden h-1.5 md:block w-1.5 rounded-full bg-coral-400" />
              )}
            </button>
          );
        })}
      </nav>

      <a
        href="https://cloudtart.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 break-all text-center text-xs leading-6 text-sand underline underline-offset-4"
        aria-label="Made by CloudTart"
      >
        <span className="hidden md:inline">Made by </span>CloudTart
      </a>
      <button
        aria-label={t("nav.logout")}
        onClick={onLogout}
        className="mt-4 flex items-center gap-3 rounded-xl px-2 py-2.5 md:px-3.5 text-sm text-sand transition-colors hover:bg-ink-850 hover:text-cream-100"
      >
        <IconLogout className="h-[18px] w-[18px]" />
        <span className="hidden md:inline">{t("nav.logout")}</span>
      </button>
    </aside>
  );
}
