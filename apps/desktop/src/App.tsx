import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { useI18n } from "./i18n.js";
import { Sidebar, type Page } from "./components/Sidebar.js";
import { TokenGate } from "./components/TokenGate.js";
import { Accounts } from "./pages/Accounts.js";
import { Automations } from "./pages/Automations.js";
import { Contacts } from "./pages/Contacts.js";
import { Dashboard } from "./pages/Dashboard.js";
import { IceBreakers } from "./pages/IceBreakers.js";
import { Inbox } from "./pages/Inbox.js";
import { Publish } from "./pages/Publish.js";
import { Settings } from "./pages/Settings.js";
import type { Status } from "./types.js";

export function App() {
  const { t } = useI18n();
  const [authed, setAuthed] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [error, setError] = useState(false);

  useEffect(() => {
    localStorage.removeItem("ig_mgmt_token");
    void api
      .session()
      .then(() => setAuthed(true))
      .catch(() => {});
    const expired = () => {
      setAuthed(false);
      setStatus(null);
    };
    window.addEventListener("tartgram:unauthorized", expired);
    return () => window.removeEventListener("tartgram:unauthorized", expired);
  }, []);

  const load = useCallback(async () => {
    try {
      setStatus(await api.status());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  async function logout() {
    try {
      await api.logout();
    } catch {
      setError(true);
      return;
    }
    setAuthed(false);
    setStatus(null);
  }

  if (!authed) {
    return <TokenGate onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div className="relative z-10 flex min-h-screen">
      <Sidebar page={page} onNavigate={setPage} onLogout={logout} />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-4xl">
          {error && (
            <div className="panel mb-6 border-coral-500/30 bg-coral-500/5 p-4 text-sm text-coral-400">
              {t("conn.error")}
            </div>
          )}
          {!status ? (
            <div className="panel p-10 text-center text-sand">
              {t("common.loading")}
            </div>
          ) : page === "dashboard" ? (
            <Dashboard
              status={status}
              onGoAccounts={() => setPage("accounts")}
            />
          ) : page === "inbox" ? (
            <Inbox status={status} />
          ) : page === "contacts" ? (
            <Contacts status={status} />
          ) : page === "accounts" ? (
            <Accounts status={status} />
          ) : page === "automations" ? (
            <Automations status={status} />
          ) : page === "icebreakers" ? (
            <IceBreakers status={status} />
          ) : page === "publish" ? (
            <Publish status={status} />
          ) : (
            <Settings status={status} />
          )}
        </div>
      </main>
    </div>
  );
}
