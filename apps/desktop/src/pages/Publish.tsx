import { useEffect, useRef, useState } from "react";
import { api, ApiError, uploadMedia } from "../api.js";
import { IconCheck } from "../components/icons.js";
import { Badge, PageHeader } from "../components/ui.js";
import { useI18n, type MsgKey } from "../i18n.js";
import {
  defaultIg,
  type Caption,
  type PostType,
  type PublishLimit,
  type ScheduledPost,
  type Status,
} from "../types.js";

const TYPE_KEY: Record<PostType, MsgKey> = {
  image: "pub.image",
  reel: "pub.reel",
  story: "pub.story",
};
const STATUS: Record<
  string,
  { key: MsgKey; tone: "amber" | "moss" | "coral" }
> = {
  publishing: { key: "pub.stPublishing", tone: "amber" },
  uncertain: { key: "pub.stUncertain", tone: "coral" },
  pending: { key: "pub.stPending", tone: "amber" },
  published: { key: "pub.stPublished", tone: "moss" },
  failed: { key: "pub.stFailed", tone: "coral" },
};

export function Publish({ status }: { status: Status }) {
  const { t } = useI18n();
  const [igId, setIgId] = useState(defaultIg(status));
  const [type, setType] = useState<PostType>("image");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [limit, setLimit] = useState<PublishLimit | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    isVideo: boolean;
  } | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const publishingRef = useRef(false);

  useEffect(() => {
    api
      .captionsList()
      .then(setCaptions)
      .catch(() => {});
  }, []);

  async function saveCurrentCaption() {
    const title = window.prompt(t("pub.captionTitle"));
    if (!title?.trim() || !caption.trim()) return;
    const next = [
      ...captions,
      { id: crypto.randomUUID(), title: title.trim(), text: caption },
    ];
    try {
      await api.saveCaptions(next);
      setCaptions(next);
    } catch {
      setMsg({ ok: false, text: t("pub.publishFail") });
    }
  }
  async function deleteCaption(id: string) {
    const next = captions.filter((c) => c.id !== id);
    try {
      await api.saveCaptions(next);
      setCaptions(next);
    } catch {
      setMsg({ ok: false, text: t("pub.publishFail") });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !igId) return;
    setUploading(true);
    setMsg(null);
    try {
      const res = await uploadMedia(igId, file);
      setUrl(res.url);
      setPreview({ url: res.url, isVideo: res.mime.startsWith("video/") });
    } catch {
      setMsg({ ok: false, text: t("pub.uploadFail") });
    } finally {
      setUploading(false);
    }
  }

  function refresh() {
    if (!igId) return;
    api
      .publishLimit(igId)
      .then(setLimit)
      .catch(() => setLimit(null));
    api
      .scheduled(igId)
      .then(setScheduled)
      .catch(() => {});
  }
  useEffect(refresh, [igId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (publishingRef.current || !url.trim()) return;
    publishingRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const scheduleAt =
        mode === "schedule" && when ? new Date(when).getTime() : undefined;
      const res = await api.publish(igId, {
        type,
        url: url.trim(),
        caption: caption.trim() || undefined,
        scheduleAt,
      });
      setMsg({
        ok: true,
        text: res.warnings?.length
          ? t("pub.warning")
          : res.scheduled
            ? t("pub.scheduled")
            : t("pub.published"),
      });
      setUrl("");
      setCaption("");
      setWhen("");
      setPreview(null);
      refresh();
    } catch (error) {
      setMsg({
        ok: false,
        text: t(
          error instanceof ApiError && error.code === "publish_outcome_unknown"
            ? "pub.outcomeUnknown"
            : "pub.publishFail",
        ),
      });
      refresh();
    } finally {
      setBusy(false);
      publishingRef.current = false;
    }
  }

  async function del(id: string) {
    try {
      await api.deleteScheduled(igId, id);
      refresh();
    } catch {
      setMsg({ ok: false, text: t("pub.publishFail") });
    }
  }

  if (status.accounts.length === 0) {
    return (
      <div>
        <PageHeader title={t("pub.title")} subtitle={t("pub.subtitle")} />
        <div className="panel p-10 text-center text-sand">
          {t("common.connectFirst")}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("pub.title")}
        subtitle={t("pub.subtitle")}
        action={
          limit && (
            <Badge tone={limit.used >= limit.total ? "coral" : "moss"}>
              {t("pub.todayCount", { used: limit.used, total: limit.total })}
            </Badge>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={submit} className="panel space-y-4 p-5">
          {status.accounts.length > 1 && (
            <div>
              <label className="label">{t("common.accountLabel")}</label>
              <select
                className="field"
                value={igId}
                onChange={(e) => setIgId(e.target.value)}
              >
                {status.accounts.map((a) => (
                  <option key={a.igId} value={a.igId} className="bg-ink-900">
                    @{a.username}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">{t("pub.type")}</label>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-ink-700 bg-ink-950/60 p-1">
              {(["image", "reel", "story"] as const).map((ty) => (
                <button
                  key={ty}
                  type="button"
                  onClick={() => setType(ty)}
                  className={`rounded-lg py-2 text-xs font-medium transition-colors ${type === ty ? "bg-coral-500 text-ink-950" : "text-cream-300 hover:text-cream-50"}`}
                >
                  {t(TYPE_KEY[ty])}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">
              {t("pub.file")} (
              {type === "image"
                ? "JPEG"
                : type === "reel"
                  ? "MP4"
                  : "JPEG / MP4"}
              )
            </label>
            <input
              ref={fileRef}
              type="file"
              accept={
                type === "reel"
                  ? "video/mp4"
                  : type === "story"
                    ? "image/jpeg,video/mp4"
                    : "image/jpeg"
              }
              className="hidden"
              onChange={onFile}
            />
            {preview ? (
              <div className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-950/40 p-2">
                {preview.isVideo ? (
                  <video
                    src={preview.url}
                    className="h-16 w-16 rounded-lg object-cover"
                    muted
                  />
                ) : (
                  <img
                    src={preview.url}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                )}
                <span className="flex-1 truncate text-xs text-moss">
                  {t("pub.uploaded")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setUrl("");
                  }}
                  className="text-xs text-sand hover:text-coral-400"
                >
                  {t("common.delete")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn-ghost w-full justify-center border-dashed py-6"
              >
                {uploading ? t("pub.uploading") : t("pub.chooseFile")}
              </button>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-sand">
                {t("pub.orUrl")}
              </summary>
              <input
                className="field mt-2 font-mono text-xs"
                dir="ltr"
                placeholder="https://example.com/media.jpg"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </details>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label mb-0">{t("pub.caption")}</label>
              {caption.trim() && (
                <button
                  type="button"
                  onClick={saveCurrentCaption}
                  className="text-xs text-coral-400 hover:text-coral-500"
                >
                  {t("pub.saveToLibrary")}
                </button>
              )}
            </div>
            <textarea
              className="field min-h-[80px] resize-none"
              placeholder={t("pub.captionPlaceholder")}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            {captions.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-sand">
                  {t("pub.library", { n: captions.length })}
                </summary>
                <div className="mt-2 grid gap-1.5">
                  {captions.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-950/40 p-2"
                    >
                      <button
                        type="button"
                        onClick={() => setCaption(c.text)}
                        className="min-w-0 flex-1 text-start"
                      >
                        <div className="truncate text-xs font-medium text-cream-100">
                          {c.title}
                        </div>
                        <div className="truncate text-[11px] text-sand">
                          {c.text}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCaption(c.id)}
                        className="shrink-0 text-xs text-sand hover:text-coral-400"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <div>
            <label className="label">{t("pub.when")}</label>
            <div className="mb-2 grid grid-cols-2 gap-1.5 rounded-xl border border-ink-700 bg-ink-950/60 p-1">
              {(["now", "schedule"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-lg py-2 text-xs font-medium transition-colors ${mode === m ? "bg-coral-500 text-ink-950" : "text-cream-300"}`}
                >
                  {m === "now" ? t("pub.now") : t("pub.schedule")}
                </button>
              ))}
            </div>
            {mode === "schedule" && (
              <input
                className="field"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            )}
          </div>

          {msg && (
            <p
              role={msg.ok ? "status" : "alert"}
              className={`text-sm ${msg.ok ? "text-moss" : "text-coral-400"}`}
            >
              {msg.text}
            </p>
          )}

          <button
            className="btn-primary w-full"
            disabled={busy || !url.trim() || (mode === "schedule" && !when)}
          >
            {busy
              ? t("pub.processing")
              : mode === "now"
                ? t("pub.publish")
                : t("pub.schedule")}
          </button>
          <p className="text-xs leading-6 text-sand">{t("pub.note")}</p>
        </form>

        <div className="panel p-5">
          <h3 className="mb-3 text-sm font-bold text-cream-50">
            {t("pub.scheduledList")}
          </h3>
          {scheduled.length === 0 ? (
            <p className="text-sm text-sand">{t("pub.noScheduled")}</p>
          ) : (
            <div className="grid gap-2">
              {scheduled.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-950/40 p-3"
                >
                  <Badge tone="neutral">{t(TYPE_KEY[p.type])}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-cream-100">
                      {p.caption || p.url}
                    </div>
                    <div className="text-[11px] text-sand">
                      {new Date(p.scheduleAt).toLocaleString()}
                    </div>
                    {p.error && (
                      <p className="mt-2 text-xs text-coral-300">{p.error}</p>
                    )}
                    {Boolean(p.warnings?.length) && (
                      <p className="mt-2 text-xs text-amber-300">
                        {t("pub.warning")}
                      </p>
                    )}
                  </div>
                  <Badge tone={STATUS[p.status]?.tone ?? "neutral"}>
                    {STATUS[p.status] ? t(STATUS[p.status]!.key) : p.status}
                  </Badge>
                  {p.status === "pending" && (
                    <button
                      onClick={() => del(p.id)}
                      className="text-xs text-sand hover:text-coral-400"
                    >
                      {t("common.delete")}
                    </button>
                  )}
                  {p.status === "published" && (
                    <IconCheck className="h-4 w-4 text-moss" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
