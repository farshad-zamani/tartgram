import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { IconBolt, IconInstagram, IconPlus } from "../components/icons.js";
import { Badge, EmptyState, PageHeader, Toggle } from "../components/ui.js";
import { useI18n, type MsgKey } from "../i18n.js";
import {
  defaultIg,
  type Automation,
  type AutomationsFile,
  type Flow,
  type MediaItem,
  type Status,
} from "../types.js";

const TRIGGER_KEY: Record<string, MsgKey> = {
  comment: "auto.tComment",
  dm_keyword: "auto.tDm",
  story_reply: "auto.tStoryReply",
  story_mention: "auto.tStoryMention",
  default_reply: "auto.tDefault",
};

const newId = () => crypto.randomUUID();
const splitKeywords = (s: string) =>
  s
    .split(/[,،]/)
    .map((x) => x.trim())
    .filter(Boolean);

function flowMessage(flow?: Flow): string {
  return flow?.nodes.find((n) => n.kind === "send")?.message.text ?? "";
}

export function Automations({ status }: { status: Status }) {
  const { t } = useI18n();
  const [file, setFile] = useState<AutomationsFile>({
    automations: [],
    flows: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{
    automation?: Automation;
    flow?: Flow;
  } | null>(null);

  useEffect(() => {
    api
      .getAutomations()
      .then(setFile)
      .catch(() => setError(t("common.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  async function persist(next: AutomationsFile) {
    const previous = file;
    setFile(next);
    setSaving(true);
    setError("");
    try {
      await api.putAutomations(next);
      return true;
    } catch {
      setFile(previous);
      setError(t("common.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function toggle(a: Automation) {
    void persist({
      ...file,
      automations: file.automations.map((x) =>
        x.id === a.id ? { ...x, enabled: !x.enabled } : x,
      ),
    });
  }

  function remove(a: Automation) {
    void persist({
      automations: file.automations.filter((x) => x.id !== a.id),
      flows: Object.fromEntries(
        Object.entries(file.flows).map(([acc, list]) => [
          acc,
          list.filter((f) => f.id !== a.flowId),
        ]),
      ),
    });
  }

  async function save(draft: Draft) {
    const automationId = editing?.automation?.id ?? newId();
    const flowId = editing?.automation?.flowId ?? newId();
    const flow: Flow = {
      id: flowId,
      name: draft.name,
      startNodeId: "n1",
      nodes: [
        {
          kind: "send",
          id: "n1",
          message: { type: "text", text: draft.message, quickReplies: [] },
        },
      ],
    };
    const keyword = {
      mode: draft.mode,
      matchAll: draft.kind === "comment" ? draft.matchAll : false,
      caseSensitive: false,
      include: splitKeywords(draft.keywords),
      exclude: splitKeywords(draft.exclude),
    };
    const automation: Automation = {
      id: automationId,
      accountId: draft.accountId,
      name: draft.name,
      enabled: editing?.automation?.enabled ?? true,
      trigger:
        draft.kind === "comment"
          ? {
              kind: "comment",
              keyword,
              mediaIds: draft.targetAll ? [] : draft.mediaIds,
              includeLive: false,
            }
          : draft.kind === "dm_keyword"
            ? { kind: "dm_keyword", keyword }
            : draft.kind === "story_reply"
              ? { kind: "story_reply", keyword }
              : draft.kind === "story_mention"
                ? { kind: "story_mention" }
                : { kind: "default_reply" },
      flowId,
      commentAction:
        draft.kind === "comment"
          ? {
              privateReply: true,
              publicReply: draft.publicReply || undefined,
              hideComment: false,
            }
          : undefined,
      followGate: draft.fgEnabled
        ? {
            enabled: true,
            promptMessage: draft.fgPrompt || FG_DEFAULTS.prompt,
            buttonLabel: (draft.fgButton || FG_DEFAULTS.button).slice(0, 20),
            notFollowingMessage:
              draft.fgNotFollowing || FG_DEFAULTS.notFollowing,
          }
        : undefined,
      createdAt: editing?.automation?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    const exists = file.automations.some((x) => x.id === automationId);
    const automations = exists
      ? file.automations.map((x) => (x.id === automationId ? automation : x))
      : [...file.automations, automation];

    // Rebuild flows: drop this flow everywhere, then attach it under the chosen account.
    const flows: Record<string, Flow[]> = {};
    for (const [acc, list] of Object.entries(file.flows)) {
      const filtered = list.filter((f) => f.id !== flowId);
      if (filtered.length) flows[acc] = filtered;
    }
    flows[draft.accountId] = [...(flows[draft.accountId] ?? []), flow];

    if (!(await persist({ automations, flows }))) return;
    setEditing(null);
  }

  function openCreate() {
    setEditing({});
  }
  function openEdit(a: Automation) {
    setEditing({
      automation: a,
      flow: file.flows[a.accountId]?.find((f) => f.id === a.flowId),
    });
  }

  return (
    <div>
      <PageHeader
        title={t("auto.title")}
        subtitle={saving ? t("common.saving") : t("auto.subtitleRules")}
        action={
          status.accounts.length > 0 ? (
            <button onClick={openCreate} className="btn-primary">
              <IconPlus className="h-4 w-4" /> {t("auto.new")}
            </button>
          ) : undefined
        }
      />

      {error && (
        <p role="alert" className="mb-4 text-sm text-coral-300">
          {error}
        </p>
      )}
      {loading ? (
        <div className="panel p-10 text-center text-sand">
          {t("common.loading")}
        </div>
      ) : file.automations.length === 0 ? (
        <EmptyState
          icon={<IconBolt className="h-7 w-7" />}
          title={t("auto.emptyTitle")}
          body={t("auto.emptyBody")}
          action={
            status.accounts.length > 0 ? (
              <button onClick={openCreate} className="btn-primary mt-1">
                {t("auto.createFirst")}
              </button>
            ) : (
              <p className="mt-1 text-xs text-coral-400">
                {t("common.connectFirst")}
              </p>
            )
          }
        />
      ) : (
        <div className="grid gap-3">
          {file.automations.map((a, i) => {
            const kw = "keyword" in a.trigger ? a.trigger.keyword : null;
            const target =
              a.trigger.kind === "comment"
                ? a.trigger.mediaIds.length === 0
                  ? t("auto.allPosts")
                  : t("auto.nSelected", { n: a.trigger.mediaIds.length })
                : null;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="panel flex items-center gap-4 p-4"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-850 text-coral-400 ring-1 ring-ink-700">
                  <IconBolt className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-cream-50">{a.name}</span>
                    <Badge tone="coral">
                      {TRIGGER_KEY[a.trigger.kind]
                        ? t(TRIGGER_KEY[a.trigger.kind]!)
                        : a.trigger.kind}
                    </Badge>
                    {target && <Badge tone="amber">{target}</Badge>}
                    {a.followGate?.enabled && (
                      <Badge tone="moss">{t("auto.followGate")}</Badge>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {kw?.matchAll ? (
                      <span className="chip">{t("auto.allComments")}</span>
                    ) : (
                      kw?.include.map((k) => (
                        <span key={k} className="chip" dir="auto">
                          {k}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openEdit(a)}
                  className="text-xs text-sand transition-colors hover:text-cream-50"
                >
                  {t("auto.edit")}
                </button>
                <Toggle checked={a.enabled} onChange={() => toggle(a)} />
                <button
                  onClick={() => remove(a)}
                  className="text-xs text-sand transition-colors hover:text-coral-400"
                >
                  {t("common.delete")}
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <AutomationForm
            status={status}
            editing={editing}
            onClose={() => setEditing(null)}
            onSave={save}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

type DraftKind =
  "comment" | "dm_keyword" | "story_reply" | "story_mention" | "default_reply";

interface Draft {
  name: string;
  accountId: string;
  kind: DraftKind;
  matchAll: boolean;
  mode: "any" | "all" | "exact";
  keywords: string;
  exclude: string;
  message: string;
  publicReply: string;
  targetAll: boolean;
  mediaIds: string[];
  fgEnabled: boolean;
  fgPrompt: string;
  fgButton: string;
  fgNotFollowing: string;
}

const FG_DEFAULTS = {
  prompt: "برای دریافت لینک، لطفاً پیج ما را فالو کن ✅ سپس روی دکمهٔ زیر بزن.",
  button: "فالو کردم ✅",
  notFollowing:
    "هنوز فالو نکردی 🙃 اول پیج رو فالو کن، بعد دوباره روی دکمه بزن.",
};

function draftFrom(
  editing: { automation?: Automation; flow?: Flow },
  status: Status,
): Draft {
  const a = editing.automation;
  const kw = a && "keyword" in a.trigger ? a.trigger.keyword : null;
  const kind: DraftKind = (() => {
    switch (a?.trigger.kind) {
      case "dm_keyword":
      case "story_reply":
      case "story_mention":
      case "default_reply":
        return a.trigger.kind;
      default:
        return "comment";
    }
  })();
  return {
    name: a?.name ?? "",
    accountId: a?.accountId ?? defaultIg(status),
    kind,
    matchAll: kw?.matchAll ?? false,
    mode: kw?.mode ?? "any",
    keywords: kw?.include.join("، ") ?? "",
    exclude: kw?.exclude.join("، ") ?? "",
    message: flowMessage(editing.flow),
    publicReply: a?.commentAction?.publicReply ?? "",
    targetAll:
      a?.trigger.kind === "comment" ? a.trigger.mediaIds.length === 0 : true,
    mediaIds: a?.trigger.kind === "comment" ? a.trigger.mediaIds : [],
    fgEnabled: a?.followGate?.enabled ?? false,
    fgPrompt: a?.followGate?.promptMessage ?? FG_DEFAULTS.prompt,
    fgButton: a?.followGate?.buttonLabel ?? FG_DEFAULTS.button,
    fgNotFollowing:
      a?.followGate?.notFollowingMessage ?? FG_DEFAULTS.notFollowing,
  };
}

function AutomationForm({
  status,
  editing,
  onClose,
  onSave,
}: {
  status: Status;
  editing: { automation?: Automation; flow?: Flow };
  onClose: () => void;
  onSave: (d: Draft) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(editing, status));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const keywordsRequired =
    (draft.kind === "comment" && !draft.matchAll) ||
    draft.kind === "dm_keyword" ||
    draft.kind === "story_reply";
  const valid =
    draft.name.trim() &&
    draft.accountId &&
    draft.message.trim() &&
    (!keywordsRequired || draft.keywords.trim()) &&
    (draft.kind !== "comment" || draft.targetAll || draft.mediaIds.length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.form
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="panel my-6 w-full max-w-lg p-6"
      >
        <h2 className="mb-5 text-lg font-bold text-cream-50">
          {editing.automation ? t("auto.editTitle") : t("auto.newTitle")}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="label">{t("auto.name")}</label>
            <input
              className="field"
              placeholder={t("auto.namePlaceholder")}
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("auto.account")}</label>
              <select
                className="field"
                value={draft.accountId}
                onChange={(e) =>
                  set({ accountId: e.target.value, mediaIds: [] })
                }
              >
                {status.accounts.map((a) => (
                  <option key={a.igId} value={a.igId} className="bg-ink-900">
                    @{a.username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("auto.triggerType")}</label>
              <select
                className="field"
                value={draft.kind}
                onChange={(e) => set({ kind: e.target.value as DraftKind })}
              >
                <option value="comment" className="bg-ink-900">
                  {t("auto.tComment")}
                </option>
                <option value="dm_keyword" className="bg-ink-900">
                  {t("auto.tDm")}
                </option>
                <option value="story_reply" className="bg-ink-900">
                  {t("auto.tStoryReply")}
                </option>
                <option value="story_mention" className="bg-ink-900">
                  {t("auto.tStoryMention")}
                </option>
                <option value="default_reply" className="bg-ink-900">
                  {t("auto.tDefault")}
                </option>
              </select>
            </div>
          </div>

          {(draft.kind === "story_mention" ||
            draft.kind === "default_reply") && (
            <p className="-mt-1 text-xs leading-6 text-sand">
              {draft.kind === "story_mention"
                ? t("auto.hintMention")
                : t("auto.hintDefault")}
            </p>
          )}

          {draft.kind === "comment" && (
            <div className="rounded-xl border border-ink-700 bg-ink-950/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-sand">
                  {t("auto.whichPosts")}
                </span>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-lg border border-ink-700 bg-ink-950/60 p-1">
                <button
                  type="button"
                  onClick={() => set({ targetAll: true })}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors ${draft.targetAll ? "bg-coral-500 text-ink-950" : "text-cream-300"}`}
                >
                  {t("auto.allPosts")}
                </button>
                <button
                  type="button"
                  onClick={() => set({ targetAll: false })}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors ${!draft.targetAll ? "bg-coral-500 text-ink-950" : "text-cream-300"}`}
                >
                  {t("auto.selectPosts")}
                </button>
              </div>
              {!draft.targetAll && (
                <MediaPicker
                  accountId={draft.accountId}
                  selected={draft.mediaIds}
                  onChange={(ids) => set({ mediaIds: ids })}
                />
              )}
            </div>
          )}

          {draft.kind === "comment" && (
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-ink-700 bg-ink-950/40 px-3.5 py-2.5">
              <span className="text-sm text-cream-100">
                {t("auto.matchAll")}
              </span>
              <Toggle
                checked={draft.matchAll}
                onChange={(v) => set({ matchAll: v })}
              />
            </label>
          )}

          {keywordsRequired && (
            <div>
              <label className="label">{t("auto.keywords")}</label>
              <input
                className="field"
                placeholder="قیمت، price، link"
                value={draft.keywords}
                onChange={(e) => set({ keywords: e.target.value })}
              />
              <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl border border-ink-700 bg-ink-950/60 p-1">
                {(
                  [
                    ["any", "auto.modeAny"],
                    ["all", "auto.modeAll"],
                    ["exact", "auto.modeExact"],
                  ] as const
                ).map(([m, key]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set({ mode: m })}
                    className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${draft.mode === m ? "bg-ink-700 text-cream-50" : "text-sand hover:text-cream-100"}`}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">{t("auto.dmText")}</label>
            <textarea
              className="field min-h-[92px] resize-none"
              placeholder={t("auto.dmPlaceholder")}
              value={draft.message}
              onChange={(e) => set({ message: e.target.value })}
            />
          </div>

          {draft.kind === "comment" && (
            <div>
              <label className="label">{t("auto.publicReplyOpt")}</label>
              <input
                className="field"
                placeholder={t("auto.publicReplyPlaceholder")}
                value={draft.publicReply}
                onChange={(e) => set({ publicReply: e.target.value })}
              />
            </div>
          )}

          <div className="rounded-xl border border-ink-700 bg-ink-950/40 p-3">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <div>
                <span className="text-sm font-medium text-cream-100">
                  {t("auto.fgTitle")}
                </span>
                <p className="mt-0.5 text-xs leading-6 text-sand">
                  {t("auto.fgDesc")}
                </p>
              </div>
              <Toggle
                checked={draft.fgEnabled}
                onChange={(v) => set({ fgEnabled: v })}
              />
            </label>
            {draft.fgEnabled && (
              <div className="mt-3 space-y-3 border-t border-ink-800 pt-3">
                <div>
                  <label className="label">{t("auto.fgPrompt")}</label>
                  <textarea
                    className="field min-h-[68px] resize-none"
                    value={draft.fgPrompt}
                    onChange={(e) => set({ fgPrompt: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t("auto.fgButton")}</label>
                    <input
                      className="field"
                      maxLength={20}
                      value={draft.fgButton}
                      onChange={(e) => set({ fgButton: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">{t("auto.fgNotFollowing")}</label>
                    <input
                      className="field"
                      value={draft.fgNotFollowing}
                      onChange={(e) => set({ fgNotFollowing: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-start gap-2">
          <button
            type="submit"
            className="btn-primary"
            disabled={!valid || busy}
          >
            {busy
              ? t("common.saving")
              : editing.automation
                ? t("auto.saveChanges")
                : t("auto.create")}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            {t("common.cancel")}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function MediaPicker({
  accountId,
  selected,
  onChange,
}: {
  accountId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setMedia(null);
    setError(false);
    api
      .media(accountId)
      .then(setMedia)
      .catch(() => setError(true));
  }, [accountId]);

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }

  if (error)
    return <p className="text-xs text-coral-400">{t("auto.mediaError")}</p>;
  if (!media)
    return <p className="text-xs text-sand">{t("auto.mediaLoading")}</p>;
  if (media.length === 0)
    return <p className="text-xs text-sand">{t("auto.mediaEmpty")}</p>;

  return (
    <div className="grid max-h-52 grid-cols-4 gap-2 overflow-y-auto pe-1">
      {media.map((m) => {
        const on = selected.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${on ? "border-coral-500" : "border-transparent hover:border-ink-600"}`}
            title={m.caption}
          >
            {m.thumbnail ? (
              <img
                src={m.thumbnail}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center bg-ink-850 text-sand">
                <IconInstagram className="h-5 w-5" />
              </span>
            )}
            {on && (
              <span className="absolute inset-0 grid place-items-center bg-coral-500/30 text-lg font-bold text-ink-950">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
