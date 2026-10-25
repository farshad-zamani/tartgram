import { useState } from "react";
import { api } from "../api.js";
import {
  IconCheck,
  IconCopy,
  IconLink,
  IconSpark,
} from "../components/icons.js";
import { Badge, PageHeader } from "../components/ui.js";
import { useI18n } from "../i18n.js";
import { defaultIg, type Status } from "../types.js";

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-2 border-b sm:flex-row sm:items-center sm:gap-4 border-ink-800/60 py-3 last:border-0">
      <span className="text-sm text-sand">{label}</span>
      <span
        className={`min-w-0 break-all text-sm text-cream-100 ${mono ? "font-mono" : ""}`}
        dir={mono ? "ltr" : "auto"}
      >
        {value}
      </span>
    </div>
  );
}

export function Settings({ status }: { status: Status }) {
  const { t, lang, setLang } = useI18n();
  const [copied, setCopied] = useState(false);
  const [defAcc, setDefAcc] = useState(defaultIg(status));
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const endpoint = new URL(status.setup.webhookUrl).origin;

  async function changeDefault(id: string) {
    setSaving(true);
    setError(false);
    try {
      await api.saveDefaultAccount(id);
      setDefAcc(id);
      window.location.reload();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  function copyConnect() {
    setError(false);
    void navigator.clipboard
      .writeText(status.connectUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => setError(true));
  }

  return (
    <div>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />

      <div className="grid gap-4">
        {error && (
          <p role="alert" className="text-sm text-coral-300">
            {t("conn.error")}
          </p>
        )}
        <section className="panel min-w-0 p-5 md:p-6">
          <h2 className="text-lg font-bold text-cream-50">
            {t("setup.title")}
          </h2>
          <p className="mt-2 text-sm leading-7 text-cream-300">
            {t("setup.desc")}
          </p>
          <div className="my-4 flex flex-wrap gap-2">
            <Badge tone={status.setup.oauthConfigured ? "moss" : "amber"}>
              {t(
                status.setup.oauthConfigured ? "setup.ready" : "setup.missing",
              )}
            </Badge>
            <Badge>
              {status.setup.loginMode === "unified"
                ? "Unified Login"
                : "Instagram Login"}{" "}
              · {status.setup.graphVersion}
            </Badge>
          </div>
          <h3 className="mt-5 text-sm font-bold">{t("setup.callbacks")}</h3>
          <dl className="mt-3 space-y-3 text-sm">
            {(
              [
                ["OAuth redirect", status.setup.redirectUri],
                ["Webhook", status.setup.webhookUrl],
                ["Deauthorize", status.setup.deauthorizeUrl],
                ["Data deletion", status.setup.dataDeletionUrl],
                ["Privacy", status.setup.privacyUrl],
                ["Terms", status.setup.termsUrl],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-sand">{label}</dt>
                <dd
                  className="mt-1 break-all font-mono text-xs text-cream-100"
                  dir="ltr"
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-6 text-sm font-bold">{t("setup.scopes")}</h3>
          <ul
            className="mt-3 space-y-1 break-all font-mono text-xs text-cream-300"
            dir="ltr"
          >
            {status.setup.requiredScopes.map((scope) => (
              <li key={scope}>{scope}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-7 text-sand">
            {t("setup.permissionsNote")}
          </p>
          <p className="mt-4 text-sm leading-7 text-cream-300">
            {t("setup.review")}
          </p>
          <a
            className="btn-ghost mt-4"
            href="https://github.com/farshad-zamani/tartgram/blob/main/docs/meta-setup.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("setup.guide")}
          </a>
          <p className="mt-6 text-xs text-sand">
            TartGram · CPAL-1.0 · Made by{" "}
            <a
              className="underline underline-offset-4"
              href="https://cloudtart.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              CloudTart
            </a>
          </p>
        </section>
        {status.accounts.length > 0 && (
          <div className="panel p-6">
            <h3 className="mb-2 text-sm font-bold text-cream-50">
              {t("settings.defaultAccount")}
            </h3>
            <p className="mb-3 text-sm text-sand">
              {t("settings.defaultAccountDesc")}
            </p>
            <select
              className="field max-w-xs"
              value={defAcc}
              disabled={saving}
              onChange={(e) => changeDefault(e.target.value)}
            >
              {status.accounts.map((a) => (
                <option key={a.igId} value={a.igId} className="bg-ink-900">
                  @{a.username}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="panel p-6">
          <h3 className="mb-2 text-sm font-bold text-cream-50">
            {t("settings.language")}
          </h3>
          <p className="mb-3 text-sm text-sand">{t("settings.languageDesc")}</p>
          <div className="inline-grid grid-cols-2 gap-1 rounded-xl border border-ink-700 bg-ink-950/60 p-1">
            {(["fa", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-lg px-6 py-2 text-sm font-semibold transition-colors ${lang === l ? "bg-coral-500 text-ink-950" : "text-cream-300 hover:text-cream-50"}`}
              >
                {l === "fa" ? "فارسی" : "English"}
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-cream-50">
            <IconSpark className="h-4 w-4 text-amber-400" />{" "}
            {t("settings.system")}
          </h3>
          <Row
            label={t("settings.engineRow")}
            value={
              <Badge tone={status.engine ? "moss" : "neutral"}>
                {status.engine
                  ? t("settings.engineOnCloud")
                  : t("dash.engineOff")}
              </Badge>
            }
          />
          <Row
            label={t("settings.connectedAccounts")}
            value={status.accounts.length}
          />
          <Row
            label={t("settings.activeAutomations")}
            value={status.automationsCount}
          />
          <Row
            label={t("settings.webhookUrl")}
            value={`${endpoint}/webhooks/instagram`}
            mono
          />
        </div>

        <div className="panel p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-cream-50">
            <IconLink className="h-4 w-4 text-coral-400" />{" "}
            {t("settings.connectLink")}
          </h3>
          <p className="mb-4 text-sm leading-7 text-sand">
            {t("settings.connectDesc")}
          </p>
          <div className="flex items-center gap-2">
            <input
              className="field font-mono text-xs"
              dir="ltr"
              readOnly
              value={status.connectUrl}
            />
            <button onClick={copyConnect} className="btn-ghost shrink-0">
              {copied ? (
                <IconCheck className="h-4 w-4 text-moss" />
              ) : (
                <IconCopy className="h-4 w-4" />
              )}
              {copied ? t("settings.copied") : t("settings.copy")}
            </button>
          </div>
          <a href={status.connectUrl} className="btn-primary mt-3 inline-flex">
            {t("settings.openConnect")}
          </a>
        </div>

        {status.accounts.map((a) => (
          <div key={a.igId} className="panel p-6">
            <h3 className="mb-2 text-sm font-bold text-cream-50" dir="ltr">
              @{a.username}
            </h3>
            <Row label={t("settings.igId")} value={a.igId} mono />
            <Row
              label={t("settings.tokenExpiry")}
              value={
                a.tokenExpiresAt
                  ? t("settings.days", {
                      n: Math.max(
                        0,
                        Math.round(
                          (a.tokenExpiresAt - Date.now()) / 86_400_000,
                        ),
                      ),
                    })
                  : "—"
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
