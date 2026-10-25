import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { IconBolt, IconChat, IconInstagram } from "../components/icons.js";
import { Badge, EmptyState, PageHeader } from "../components/ui.js";
import { useI18n } from "../i18n.js";
import {
  defaultIg,
  type Conversation,
  type InboxMessage,
  type StoredComment,
  type Status,
} from "../types.js";

export function Inbox({ status }: { status: Status }) {
  const { t } = useI18n();
  const [igId, setIgId] = useState(defaultIg(status));
  const [tab, setTab] = useState<"dm" | "comments">("dm");
  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<Conversation | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!igId) return;
    setConvos(null);
    setActive(null);
    setLoadError(false);
    let current = true;
    api
      .conversations(igId)
      .then((rows) => {
        if (current) setConvos(rows);
      })
      .catch(() => {
        if (current) setLoadError(true);
      });
    return () => {
      current = false;
    };
  }, [igId, reload]);

  if (status.accounts.length === 0) {
    return (
      <div>
        <PageHeader title={t("inbox.title")} subtitle={t("inbox.subtitle")} />
        <EmptyState
          icon={<IconChat className="h-7 w-7" />}
          title={t("common.noAccount")}
          body={t("common.connectFirst")}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("inbox.title")}
        subtitle={t("inbox.subtitle")}
        action={
          status.accounts.length > 1 ? (
            <select
              className="field max-w-[12rem]"
              value={igId}
              onChange={(e) => setIgId(e.target.value)}
            >
              {status.accounts.map((a) => (
                <option key={a.igId} value={a.igId} className="bg-ink-900">
                  @{a.username}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <div className="mb-4 inline-flex gap-1 rounded-xl border border-ink-700 bg-ink-950/60 p-1">
        {(["dm", "comments"] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === tb ? "bg-coral-500 text-ink-950" : "text-cream-300 hover:text-cream-50"}`}
          >
            {tb === "dm" ? t("inbox.tabDm") : t("inbox.tabComments")}
          </button>
        ))}
      </div>

      {tab === "comments" ? (
        <CommentsFeed key={igId} igId={igId} />
      ) : (
        <div className="panel flex h-[calc(100vh-16rem)] overflow-hidden p-0">
          {/* Conversation list */}
          <div
            className={`${active ? "hidden md:block" : "block"} w-full md:w-72 shrink-0 overflow-y-auto border-e border-ink-800/70`}
          >
            {loadError ? (
              <LoadError onRetry={() => setReload((n) => n + 1)} />
            ) : convos === null ? (
              <div className="p-6 text-center text-sm text-sand">
                {t("common.loading")}
              </div>
            ) : convos.length === 0 ? (
              <div className="p-6 text-center text-sm text-sand">
                {t("inbox.noConvos")}
              </div>
            ) : (
              convos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActive(c)}
                  className={`flex w-full items-center gap-3 border-b border-ink-800/50 p-3 text-start transition-colors ${
                    active?.id === c.id ? "bg-coral-500/10" : "hover:bg-ink-850"
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-coral-500 to-amber-500 text-ink-950">
                    <IconInstagram className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-sm font-semibold text-cream-50"
                      dir="ltr"
                    >
                      @{c.username || c.userId}
                    </div>
                    <div className="truncate text-xs text-sand">
                      {c.snippet || "—"}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Thread */}
          <div
            className={`${active ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}
          >
            {active ? (
              <Thread
                key={`${igId}:${active.id}`}
                igId={igId}
                convo={active}
                humanAgentEnabled={status.setup.humanAgentEnabled}
                onBack={() => setActive(null)}
              />
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-sand">
                {t("inbox.pickConvo")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="p-4 text-sm text-cream-100">
      <p>{t("inbox.loadFail")}</p>
      <button className="btn-secondary mt-3" onClick={onRetry}>
        {t("common.retry")}
      </button>
    </div>
  );
}

function CommentsFeed({ igId }: { igId: string }) {
  const { t } = useI18n();
  const [list, setList] = useState<StoredComment[] | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);

  function refresh() {
    if (!igId) return;
    setList(null);
    setLoadError(false);
    api
      .comments(igId)
      .then(setList)
      .catch(() => setLoadError(true));
  }
  useEffect(refresh, [igId]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(false);
    try {
      await fn();
      refresh();
      setReplyTo(null);
      setReplyText("");
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <LoadError onRetry={refresh} />;
  if (list === null)
    return (
      <div className="panel p-10 text-center text-sand">
        {t("common.loading")}
      </div>
    );
  if (list.length === 0)
    return (
      <EmptyState
        icon={<IconBolt className="h-7 w-7" />}
        title={t("inbox.commentsEmptyTitle")}
        body={t("inbox.commentsEmptyBody")}
      />
    );

  return (
    <div className="grid gap-2">
      {actionError && (
        <p role="alert" className="p-3 text-sm text-coral-300">
          {t("inbox.actionFail")}
        </p>
      )}
      {list.map((c) => (
        <div
          key={c.id}
          className={`panel p-4 ${c.status === "deleted" ? "opacity-50" : ""}`}
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-bold text-coral-400">
              {(c.fromUsername ?? "؟").slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-cream-50" dir="ltr">
                  @{c.fromUsername || c.fromId || t("common.person")}
                </span>
                {c.status === "replied" && (
                  <Badge tone="moss">{t("inbox.replied")}</Badge>
                )}
                {c.status === "hidden" && (
                  <Badge tone="amber">{t("inbox.hidden")}</Badge>
                )}
                {c.status === "deleted" && (
                  <Badge tone="coral">{t("inbox.deleted")}</Badge>
                )}
              </div>
              <p className="mt-1 text-sm leading-6 text-cream-100">{c.text}</p>

              {c.status !== "deleted" && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <button
                    onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                    className="text-sand hover:text-cream-50"
                  >
                    {t("inbox.reply")}
                  </button>
                  <button
                    onClick={() =>
                      act(() =>
                        api.hideComment(igId, c.id, c.status !== "hidden"),
                      )
                    }
                    disabled={busy}
                    className="text-sand hover:text-amber-400"
                  >
                    {c.status === "hidden"
                      ? t("inbox.unhide")
                      : t("inbox.hide")}
                  </button>
                  <button
                    onClick={() => act(() => api.deleteComment(igId, c.id))}
                    disabled={busy}
                    className="text-sand hover:text-coral-400"
                  >
                    {t("common.delete")}
                  </button>
                  <span className="ms-auto text-sand">
                    {new Date(c.timestamp).toLocaleString()}
                  </span>
                </div>
              )}

              {replyTo === c.id && (
                <div className="mt-2 flex items-end gap-2">
                  <input
                    className="field flex-1"
                    placeholder={t("inbox.publicReply")}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <button
                    onClick={() =>
                      replyText.trim() &&
                      act(() => api.replyComment(igId, c.id, replyText.trim()))
                    }
                    className="btn-primary shrink-0"
                    disabled={busy || !replyText.trim()}
                  >
                    {t("common.send")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Thread({
  igId,
  convo,
  humanAgentEnabled,
  onBack,
}: {
  igId: string;
  convo: Conversation;
  humanAgentEnabled: boolean;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<InboxMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [humanAgent, setHumanAgent] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const sendingRef = useRef(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    setLoadError(false);
    api
      .conversationMessages(igId, convo.id)
      .then(setMessages)
      .catch(() => setLoadError(true));
  }
  useEffect(load, [igId, convo.id]);
  useEffect(() => () => clearTimeout(reloadTimer.current), []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sendingRef.current || !text.trim() || !convo.userId) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      await api.sendDm(
        igId,
        convo.userId,
        text.trim(),
        humanAgent,
        replyTo?.id,
      );
      setText("");
      setReplyTo(null);
      reloadTimer.current = setTimeout(load, 600);
    } catch {
      setError(t("inbox.sendFail"));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-800/70 px-4 py-3">
        <button className="btn-secondary w-full md:hidden" onClick={onBack}>
          {t("inbox.back")}
        </button>
        <span className="hidden md:grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-coral-500 to-amber-500 text-ink-950">
          <IconInstagram className="h-4 w-4" />
        </span>
        <span
          className="min-w-0 break-all font-semibold text-cream-50"
          dir="ltr"
        >
          @{convo.username || convo.userId}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {loadError ? (
          <LoadError onRetry={load} />
        ) : messages === null ? (
          <div className="text-center text-sm text-sand">
            {t("common.loading")}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-sand">
            {t("inbox.noMessages")}
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-6 ${
                m.isBusiness
                  ? "ms-auto bg-coral-500 text-ink-950"
                  : "me-auto bg-ink-800 text-cream-100"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">
                {m.text || (
                  <span className="opacity-60">{t("inbox.attachment")}</span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setReplyTo(m)}
                className="mt-1 block text-xs underline underline-offset-2"
              >
                {t("inbox.replyTo")}
              </button>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="border-t border-ink-800/70 p-3">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 text-xs text-cream-100">
            <span className="min-w-0 flex-1 truncate">
              {t("inbox.replying")}: {replyTo.text || t("inbox.attachment")}
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setReplyTo(null)}
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
        {error && <p className="mb-2 text-xs text-coral-400">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            className="field max-h-32 min-h-[44px] flex-1 resize-none py-2.5"
            placeholder={t("inbox.placeholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(e as unknown as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            className="btn-primary shrink-0"
            disabled={sending || !text.trim()}
          >
            {sending ? "…" : t("common.send")}
          </button>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-sand">
          <input
            type="checkbox"
            disabled={!humanAgentEnabled}
            checked={humanAgent}
            onChange={(e) => setHumanAgent(e.target.checked)}
            className="accent-coral-500"
          />
          {t("inbox.humanAgent")}
        </label>
      </form>
    </>
  );
}
