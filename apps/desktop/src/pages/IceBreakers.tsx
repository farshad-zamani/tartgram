import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { IconPlus, IconSpark } from "../components/icons.js";
import { EmptyState, PageHeader } from "../components/ui.js";
import { useI18n } from "../i18n.js";
import { defaultIg, type IceBreaker, type Status } from "../types.js";

export function IceBreakers({ status }: { status: Status }) {
  const { t } = useI18n();
  const [igId, setIgId] = useState(defaultIg(status));
  const [items, setItems] = useState<IceBreaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!igId) return;
    setLoading(true);
    api
      .iceBreakers(igId)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [igId]);

  function update(i: number, patch: Partial<IceBreaker>) {
    setItems((prev) =>
      prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
    );
  }
  function add() {
    if (items.length >= 4) return;
    setItems((prev) => [...prev, { question: "", response: "" }]);
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const clean = items.filter((x) => x.question.trim() && x.response.trim());
      const res = await api.putIceBreakers(igId, clean);
      setItems(res.items);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } finally {
      setSaving(false);
    }
  }

  if (status.accounts.length === 0) {
    return (
      <div>
        <PageHeader title={t("ib.title")} subtitle={t("ib.subtitle")} />
        <EmptyState
          icon={<IconSpark className="h-7 w-7" />}
          title={t("common.noAccount")}
          body={t("common.connectFirst")}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("ib.title")}
        subtitle={t("ib.subtitle")}
        action={
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving
              ? t("common.saving")
              : saved
                ? t("common.saved")
                : t("ib.saveApply")}
          </button>
        }
      />

      {status.accounts.length > 1 && (
        <select
          className="field mb-4 max-w-xs"
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

      {loading ? (
        <div className="panel p-10 text-center text-sand">
          {t("common.loading")}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((ib, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              className="panel p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="chip">{t("ib.question", { n: i + 1 })}</span>
                <button
                  onClick={() => remove(i)}
                  className="text-xs text-sand transition-colors hover:text-coral-400"
                >
                  {t("common.delete")}
                </button>
              </div>
              <input
                className="field mb-2"
                placeholder={t("ib.questionPlaceholder")}
                maxLength={80}
                value={ib.question}
                onChange={(e) => update(i, { question: e.target.value })}
              />
              <textarea
                className="field min-h-[70px] resize-none"
                placeholder={t("ib.answerPlaceholder")}
                value={ib.response}
                onChange={(e) => update(i, { response: e.target.value })}
              />
            </motion.div>
          ))}

          {items.length < 4 && (
            <button
              onClick={add}
              className="btn-ghost justify-center border-dashed py-4"
            >
              <IconPlus className="h-4 w-4" />{" "}
              {t("ib.add", { n: items.length })}
            </button>
          )}

          {items.length === 0 && (
            <p className="text-center text-xs text-sand">{t("ib.empty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
