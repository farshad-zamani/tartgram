import { OAUTH_REFRESH_TOKEN_URL, TIMING, type Account } from "@app/shared";
import {
  systemClock,
  type Clock,
  type Logger,
  type TokenStore,
} from "../ports.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TokenManagerOptions {
  store: TokenStore;
  clock?: Clock;
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

/**
 * Resolves valid access tokens for accounts, refreshing long-lived Instagram-Login tokens before
 * they expire. The token value lives in the `TokenStore` (encrypted at rest); this class never logs
 * token contents. When a refresh happens, `onRefreshed(expiresAtMs)` is invoked so the caller can
 * persist the new expiry on the account.
 */
export class TokenManager {
  private readonly store: TokenStore;
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: Logger;

  constructor(opts: TokenManagerOptions) {
    this.store = opts.store;
    this.clock = opts.clock ?? systemClock;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.logger = opts.logger;
  }

  /**
   * Returns a valid token for the account, refreshing first if it expires within the refresh
   * threshold. Throws if no token is stored for the account.
   */
  async getToken(
    account: Account,
    onRefreshed?: (expiresAtMs: number) => Promise<void>,
  ): Promise<string> {
    const current = await this.store.get(account.accessTokenRef);
    if (!current) {
      throw new Error(`No stored token for account ${account.id}`);
    }

    if (this.shouldRefresh(account)) {
      // Only Instagram-Login long-lived tokens are self-refreshable via this endpoint.
      if (account.loginMethod === "instagram_login") {
        try {
          const refreshed = await this.refreshLongLived(current);
          await this.store.set(account.accessTokenRef, refreshed.token);
          const expiresAt =
            this.clock.now() + refreshed.expiresInSeconds * 1000;
          await onRefreshed?.(expiresAt);
          return refreshed.token;
        } catch (err) {
          this.logger?.warn("Token refresh failed; using existing token", {
            accountId: account.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    return current;
  }

  /** True if the account token is missing an expiry or within the refresh threshold of expiring. */
  shouldRefresh(account: Account): boolean {
    if (!account.tokenExpiresAt) return false;
    const remainingMs = account.tokenExpiresAt - this.clock.now();
    return remainingMs <= TIMING.tokenRefreshThresholdDays * DAY_MS;
  }

  /** Exchange a long-lived Instagram-Login token for a fresh one (extends ~60 days). */
  async refreshLongLived(
    currentToken: string,
  ): Promise<{ token: string; expiresInSeconds: number }> {
    const url = new URL(OAUTH_REFRESH_TOKEN_URL);
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", currentToken);

    const res = await this.fetchImpl(url);
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!res.ok || !json.access_token) {
      throw new Error(
        json.error?.message ?? `Token refresh failed (HTTP ${res.status})`,
      );
    }
    return {
      token: json.access_token,
      expiresInSeconds:
        json.expires_in ?? TIMING.longLivedTokenDays * 24 * 60 * 60,
    };
  }
}
