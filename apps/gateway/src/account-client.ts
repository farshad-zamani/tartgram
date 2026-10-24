import { GraphClient, TokenManager } from "@app/core";
import { GRAPH_BASE_URL } from "@app/shared";
import type { GatewayConfig } from "./config.js";
import { JsonAccountStore } from "./account-store.js";
import { serialized } from "./storage.js";
export async function clientForAccount(
  store: JsonAccountStore,
  id: string,
  config: GatewayConfig,
): Promise<GraphClient | null> {
  const account = (await store.load()).find((a) => a.igId === id);
  return account
    ? new GraphClient({
        igUserId: id,
        version: config.graphVersion,
        baseUrl:
          account.loginMethod === "unified_login"
            ? GRAPH_BASE_URL.facebookLogin
            : GRAPH_BASE_URL.instagramLogin,
        getToken: () => tokenFor(store, id),
        onInvalidToken: (token) => store.invalidateToken(token),
      })
    : null;
}
export async function tokenFor(
  store: JsonAccountStore,
  id: string,
): Promise<string> {
  return serialized(`token-refresh:${id}`, async () => {
    const account = (await store.load()).find((a) => a.igId === id);
    if (!account || account.reconnectRequired)
      throw new Error("Reconnect this account in Accounts.");
    if (account.expiresAt && account.expiresAt <= Date.now())
      throw new Error("Account authorization expired. Reconnect in Accounts.");
    if (
      account.loginMethod === "instagram_login" &&
      account.expiresAt &&
      account.expiresAt - Date.now() < 10 * 86400_000 &&
      (!account.refreshAfter || account.refreshAfter <= Date.now())
    ) {
      try {
        const manager = new TokenManager({
          store: {
            get: async () => account.accessToken,
            set: async () => {},
            delete: async () => {},
          },
        });
        const fresh = await manager.refreshLongLived(account.accessToken);
        await store.upsert({
          ...account,
          accessToken: fresh.token,
          expiresAt: Date.now() + fresh.expiresInSeconds * 1000,
          refreshAfter: Date.now() + 86400_000,
        });
        return fresh.token;
      } catch {
        await store.upsert({ ...account, refreshAfter: Date.now() + 3600_000 });
      }
    }
    return account.accessToken;
  });
}
