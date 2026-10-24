import { motion } from "framer-motion";
import { useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n.js";
import { IconInstagram, IconSpark } from "./icons.js";

export function TokenGate({ onAuthed }: { onAuthed: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.login(value.trim());
      setValue("");
      onAuthed();
    } catch {
      setError(t("login.invalid"));
      setBusy(false);
    }
  }

  return (
    <div className="relative z-10 grid min-h-screen place-items-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="panel w-full max-w-md p-8"
      >
        <div className="mb-7 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral-500 text-ink-950 shadow-glow">
            <IconInstagram className="h-6 w-6" />
          </span>
          <div className="leading-tight">
            <div className="text-lg font-extrabold tracking-tight text-cream-50">
              {t("app.name")}
            </div>
            <div className="text-xs text-sand">{t("app.subtitle")}</div>
          </div>
        </div>

        <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-cream-50">
          <IconSpark className="h-5 w-5 text-amber-400" /> {t("login.title")}
        </h1>
        <p className="mb-6 text-sm leading-7 text-cream-300">
          {t("login.desc")}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="tok">
              {t("login.token")}
            </label>
            <input
              id="tok"
              className="field font-mono text-left"
              dir="ltr"
              placeholder="••••••••••••••••••••"
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-coral-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? t("login.checking") : t("login.submit")}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-sand">
          Made by{" "}
          <a
            className="text-coral-300 underline underline-offset-4"
            href="https://cloudtart.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            CloudTart
          </a>
        </p>
        <div className="mt-3 flex justify-center gap-4 text-xs text-sand">
          <a href="/privacy">{t("brand.privacy")}</a>
          <a href="/terms">{t("brand.terms")}</a>
        </div>
      </motion.div>
    </div>
  );
}
