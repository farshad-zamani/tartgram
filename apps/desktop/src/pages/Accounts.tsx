import { useState } from "react";
import { api } from "../api.js";
import { motion } from "framer-motion";
import { IconInstagram, IconPlus } from "../components/icons.js";
import { Badge, EmptyState, PageHeader } from "../components/ui.js";
import { useI18n } from "../i18n.js";
import type { Status } from "../types.js";

export function Accounts({ status }: { status: Status }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function disconnect(id: string) {
    if (!window.confirm(t("accounts.confirmDelete"))) return;
    setBusy(id);
    setError("");
    try {
      await api.disconnect(id);
      window.location.reload();
    } catch {
      setError(t("accounts.deleteFailed"));
    } finally {
      setBusy("");
    }
  }
  const connect = () => {
    window.location.href = status.connectUrl;
  };
  const daysLeft = (expiresAt?: number): string => {
    if (!expiresAt) return "—";
    const d = Math.round((expiresAt - Date.now()) / 86_400_000);
    return d > 0 ? t("accounts.daysLeft", { n: d }) : t("accounts.expired");
  };

  return (
    <div>
      <PageHeader
        title={t("accounts.title")}
        subtitle={t("accounts.subtitle")}
        action={
          <button
            onClick={connect}
            disabled={!status.setup.oauthConfigured}
            className="btn-primary"
          >
            <IconPlus className="h-4 w-4" /> {t("accounts.connect")}
          </button>
        }
      />

      <p className="mb-6 text-sm leading-7 text-cream-300">
        {t("accounts.permissions")}
      </p>
      {error && (
        <p role="alert" className="mb-4 text-coral-300">
          {error}
        </p>
      )}
      {status.accounts.length === 0 ? (
        <EmptyState
          icon={<IconInstagram className="h-7 w-7" />}
          title={t("accounts.emptyTitle")}
          body={t("accounts.emptyBody")}
          action={
            <button
              onClick={connect}
              disabled={!status.setup.oauthConfigured}
              className="btn-primary mt-1"
            >
              {t("accounts.connect")}
            </button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {status.accounts.map((a, i) => (
            <motion.div
              key={a.igId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="panel flex flex-wrap items-center gap-4 p-4"
            >
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-coral-500 to-amber-500 text-ink-950">
                <IconInstagram className="h-6 w-6" />
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-cream-50" dir="ltr">
                    @{a.username}
                  </span>
                  <Badge
                    tone={
                      a.subscriptionStatus === "active" && !a.reconnectRequired
                        ? "moss"
                        : "amber"
                    }
                  >
                    {t(
                      a.subscriptionStatus === "active" && !a.reconnectRequired
                        ? "accounts.active"
                        : "accounts.attention",
                    )}
                  </Badge>
                </div>
                <div className="font-mono text-xs text-sand" dir="ltr">
                  {a.igId}
                </div>
              </div>
              <div className="text-xs text-sand">
                {daysLeft(a.tokenExpiresAt)}
              </div>
              <button
                className="btn-ghost text-coral-300"
                disabled={Boolean(busy)}
                onClick={() => void disconnect(a.igId)}
              >
                {t("accounts.disconnect")}
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
