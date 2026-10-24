import { useEffect, useState } from "react";
import { api } from "../api.js";
import { IconUsers } from "../components/icons.js";
import { Badge, EmptyState, PageHeader } from "../components/ui.js";
import { useI18n } from "../i18n.js";
import { defaultIg, type Contact, type Status } from "../types.js";

function toCsv(list: Contact[]): string {
  const rows = [
    ["igsid", "username", "isFollower", "tags", "lastInboundAt", "createdAt"],
    ...list.map((c) => [
      c.igsid,
      c.username ?? "",
      String(c.isFollower ?? ""),
      c.tags.join("|"),
      c.lastInboundAt ? new Date(c.lastInboundAt).toISOString() : "",
      new Date(c.createdAt).toISOString(),
    ]),
  ];
  return rows
    .map((r) =>
      r
        .map(
          (v) =>
            `"${String(v)
              .replace(/^[\s]*[=+@\-\t\r]/, "'$&")
              .replace(/"/g, '""')}"`,
        )
        .join(","),
    )
    .join("\n");
}

export function Contacts({ status }: { status: Status }) {
  const { t } = useI18n();
  const [igId, setIgId] = useState(defaultIg(status));
  const [list, setList] = useState<Contact[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");

  function refresh() {
    if (!igId) return;
    setList(null);
    api
      .contacts(igId)
      .then(setList)
      .catch(() => setList([]));
  }
  useEffect(refresh, [igId]);

  function exportCsv() {
    if (!list) return;
    const blob = new Blob(["﻿" + toCsv(list)], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function broadcast() {
    if (!text.trim()) return;
    setSending(true);
    setResult("");
    try {
      const res = await api.broadcast(igId, text.trim());
      setResult(
        t("contacts.broadcastResult", {
          sent: res.sent,
          eligible: res.eligible,
        }),
      );
      setText("");
    } catch {
      setResult(t("contacts.broadcastFail"));
    } finally {
      setSending(false);
    }
  }

  if (status.accounts.length === 0) {
    return (
      <div>
        <PageHeader
          title={t("contacts.title")}
          subtitle={t("contacts.subtitle")}
        />
        <EmptyState
          icon={<IconUsers className="h-7 w-7" />}
          title={t("common.noAccount")}
          body={t("common.connectFirst")}
        />
      </div>
    );
  }

  const eligible = (list ?? []).filter(
    (c) => c.lastInboundAt && Date.now() - c.lastInboundAt < 24 * 3600 * 1000,
  ).length;

  return (
    <div>
      <PageHeader
        title={t("contacts.title")}
        subtitle={t("contacts.subtitle")}
        action={
          <div className="flex items-center gap-2">
            {status.accounts.length > 1 && (
              <select
                className="field max-w-[10rem]"
                value={igId}
                onChange={(e) => setIgId(e.target.value)}
              >
                {status.accounts.map((a) => (
                  <option key={a.igId} value={a.igId} className="bg-ink-900">
                    @{a.username}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={exportCsv}
              className="btn-ghost"
              disabled={!list?.length}
            >
              {t("contacts.export")}
            </button>
          </div>
        }
      />

      {/* Broadcast composer */}
      <div className="panel mb-5 p-5">
        <h3 className="mb-1 text-sm font-bold text-cream-50">
          {t("contacts.broadcast")}
        </h3>
        <p className="mb-3 text-xs leading-6 text-sand">
          {t("contacts.broadcastDesc")}{" "}
          {t("contacts.eligibleNow", { n: eligible })}
        </p>
        <textarea
          className="field min-h-[80px] resize-none"
          placeholder={t("contacts.broadcastPlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={broadcast}
            className="btn-primary"
            disabled={sending || !text.trim() || eligible === 0}
          >
            {sending
              ? t("common.saving")
              : t("contacts.sendToN", { n: eligible })}
          </button>
          {result && <span className="text-xs text-moss">{result}</span>}
        </div>
      </div>

      {/* Contacts list */}
      {list === null ? (
        <div className="panel p-10 text-center text-sand">
          {t("common.loading")}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-7 w-7" />}
          title={t("contacts.emptyTitle")}
          body={t("contacts.emptyBody")}
        />
      ) : (
        <div className="panel divide-y divide-ink-800/60 overflow-hidden">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-800 text-xs font-bold text-coral-400">
                {(c.username ?? c.igsid).slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-sm font-medium text-cream-50"
                  dir="ltr"
                >
                  @{c.username || c.igsid}
                </div>
                {c.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {c.isFollower && (
                <Badge tone="moss">{t("contacts.follower")}</Badge>
              )}
              <span className="text-xs text-sand">
                {c.lastInboundAt
                  ? new Date(c.lastInboundAt).toLocaleDateString("fa-IR")
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
