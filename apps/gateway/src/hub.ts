import type { NormalizedEvent } from "@app/shared";

/** A connected client (desktop app or self-hosted server) able to receive events. */
export interface HubClient {
  id: string;
  /** Account ids this client is subscribed to. */
  accounts: Set<string>;
  send(data: string): void;
  isOpen(): boolean;
}

/**
 * Routes normalized events to the clients that own the relevant account. This is the core of the
 * gateway's job: Meta delivers every tenant's events to our one webhook URL, and we fan each event
 * out only to the client(s) that authorized that account.
 */
export class FanoutHub {
  private readonly clients = new Set<HubClient>();
  private readonly byAccount = new Map<string, Set<HubClient>>();

  add(client: HubClient): void {
    this.clients.add(client);
    for (const accountId of client.accounts) this.index(accountId, client);
  }

  remove(client: HubClient): void {
    this.clients.delete(client);
    for (const accountId of client.accounts) {
      this.byAccount.get(accountId)?.delete(client);
      if (this.byAccount.get(accountId)?.size === 0)
        this.byAccount.delete(accountId);
    }
  }

  subscribe(client: HubClient, accountId: string): void {
    client.accounts.add(accountId);
    this.index(accountId, client);
  }

  /** Deliver an event to every open client subscribed to its account. Returns delivery count. */
  broadcast(event: NormalizedEvent): number {
    const targets = this.byAccount.get(event.accountId);
    if (!targets || targets.size === 0) return 0;
    const payload = JSON.stringify({ kind: "event", event });
    let delivered = 0;
    for (const client of targets) {
      if (!client.isOpen()) continue;
      try {
        client.send(payload);
        delivered++;
      } catch {
        // Broken socket; drop it from the hub.
        this.remove(client);
      }
    }
    return delivered;
  }

  stats(): { clients: number; accounts: number } {
    return { clients: this.clients.size, accounts: this.byAccount.size };
  }

  private index(accountId: string, client: HubClient): void {
    let set = this.byAccount.get(accountId);
    if (!set) {
      set = new Set();
      this.byAccount.set(accountId, set);
    }
    set.add(client);
  }
}
