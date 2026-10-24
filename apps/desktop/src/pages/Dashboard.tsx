import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import {
  IconBolt,
  IconChat,
  IconCheck,
  IconInstagram,
  IconLink,
  IconSpark,
  IconUsers,
} from "../components/icons.js";
import { Badge, EmptyState, PageHeader, StatCard } from "../components/ui.js";
import { useI18n } from "../i18n.js";
import type { Stats, Status } from "../types.js";

export function Dashboard({
  status,
  onGoAccounts,
}: {
  status: Status;
  onGoAccounts: () => void;
}) {
  const { t } = useI18n();
  const account = status.accounts[0];
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title={t("dash.title")} subtitle={t("dash.subtitle")} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          index={0}
          label={t("dash.accounts")}
          value={status.accounts.length}
          icon={<IconUsers className="h-[18px] w-[18px]" />}
        />
        <StatCard
          index={1}
          label={t("dash.activeAutomations")}
          value={status.automationsCount}
          icon={<IconBolt className="h-[18px] w-[18px]" />}
        />
        <StatCard
          index={2}
          label={t("dash.engine")}
          value={status.engine ? t("dash.engineOn") : t("dash.engineOff")}
          hint={status.engine ? t("dash.cloudMode") : t("dash.inactive")}
          icon={<IconSpark className="h-[18px] w-[18px]" />}
        />
        <StatCard
          index={3}
          label={t("dash.webhook")}
          value={
            status.accounts.some((a) => a.subscriptionStatus === "active")
              ? t("dash.connected")
              : "?"
          }
          hint={new URL(status.setup.webhookUrl).hostname}
          icon={<IconLink className="h-[18px] w-[18px]" />}
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold text-sand">
        {t("dash.perf")}
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          index={0}
          label={t("dash.triggered")}
          value={stats?.totals.triggered ?? 0}
          icon={<IconBolt className="h-[18px] w-[18px]" />}
        />
        <StatCard
          index={1}
          label={t("dash.sent")}
          value={stats?.totals.sent ?? 0}
          icon={<IconChat className="h-[18px] w-[18px]" />}
        />
        <StatCard
          index={2}
          label={t("dash.fgPrompt")}
          value={stats?.totals.follow_gate_prompt ?? 0}
          icon={<IconSpark className="h-[18px] w-[18px]" />}
        />
        <StatCard
          index={3}
          label={t("dash.fgPass")}
          value={stats?.totals.follow_gate_pass ?? 0}
          hint={t("dash.viaFollowGate")}
          icon={<IconCheck className="h-[18px] w-[18px]" />}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6"
      >
        {account ? (
          <div className="panel flex items-center gap-5 p-6">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-coral-500 to-amber-500 text-ink-950">
              <IconInstagram className="h-7 w-7" />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-cream-50" dir="ltr">
                  @{account.username}
                </span>
                <Badge tone="moss">
                  <span className="h-1.5 w-1.5 rounded-full bg-moss" />{" "}
                  {t("dash.connected")}
                </Badge>
              </div>
              <div className="mt-0.5 font-mono text-xs text-sand" dir="ltr">
                {account.igId}
              </div>
            </div>
            <button onClick={onGoAccounts} className="btn-ghost">
              {t("dash.manageAccounts")}
            </button>
          </div>
        ) : (
          <EmptyState
            icon={<IconInstagram className="h-7 w-7" />}
            title={t("dash.noAccountTitle")}
            body={t("dash.noAccountBody")}
            action={
              <button onClick={onGoAccounts} className="btn-primary mt-1">
                {t("dash.connectAccount")}
              </button>
            }
          />
        )}
      </motion.div>
    </div>
  );
}
