import type { Account, Automation, Contact, Flow } from "@app/shared";
import { randomUUID } from "node:crypto";
import type {
  AccountRepository,
  AutomationRepository,
  ContactRepository,
  FlowRepository,
  IdGenerator,
  Logger,
  Repositories,
  TokenStore,
} from "../ports.js";

/**
 * In-memory adapter implementations. Used for tests and quick local runs; the desktop app swaps in
 * SQLite-backed repositories and the cloud/server swap in Postgres, all behind the same ports.
 */

export class InMemoryAccountRepository implements AccountRepository {
  private readonly byId = new Map<string, Account>();
  async getById(id: string): Promise<Account | null> {
    return this.byId.get(id) ?? null;
  }
  async getByIgId(igId: string): Promise<Account | null> {
    for (const a of this.byId.values()) if (a.igId === igId) return a;
    return null;
  }
  async list(): Promise<Account[]> {
    return [...this.byId.values()];
  }
  async upsert(account: Account): Promise<void> {
    this.byId.set(account.id, account);
  }
  async setActive(id: string, active: boolean): Promise<void> {
    const a = this.byId.get(id);
    if (a) this.byId.set(id, { ...a, active });
  }
}

export class InMemoryContactRepository implements ContactRepository {
  private readonly byId = new Map<string, Contact>();
  private key(accountId: string, igsid: string): string {
    return `${accountId}:${igsid}`;
  }
  private readonly byKey = new Map<string, string>();

  async getByIgsid(accountId: string, igsid: string): Promise<Contact | null> {
    const id = this.byKey.get(this.key(accountId, igsid));
    return id ? (this.byId.get(id) ?? null) : null;
  }
  async upsert(contact: Contact): Promise<void> {
    this.byId.set(contact.id, contact);
    this.byKey.set(this.key(contact.accountId, contact.igsid), contact.id);
  }
  async addTags(id: string, tags: string[]): Promise<void> {
    const c = this.byId.get(id);
    if (c)
      this.byId.set(id, { ...c, tags: [...new Set([...c.tags, ...tags])] });
  }
  async removeTags(id: string, tags: string[]): Promise<void> {
    const c = this.byId.get(id);
    if (c)
      this.byId.set(id, {
        ...c,
        tags: c.tags.filter((t) => !tags.includes(t)),
      });
  }
  async setAttribute(id: string, key: string, value: string): Promise<void> {
    const c = this.byId.get(id);
    if (c)
      this.byId.set(id, {
        ...c,
        attributes: { ...c.attributes, [key]: value },
      });
  }
}

export class InMemoryAutomationRepository implements AutomationRepository {
  private readonly byId = new Map<string, Automation>();
  async listEnabledForAccount(accountId: string): Promise<Automation[]> {
    return [...this.byId.values()].filter(
      (a) => a.accountId === accountId && a.enabled,
    );
  }
  async getById(id: string): Promise<Automation | null> {
    return this.byId.get(id) ?? null;
  }
  async upsert(automation: Automation): Promise<void> {
    this.byId.set(automation.id, automation);
  }
}

export class InMemoryFlowRepository implements FlowRepository {
  private readonly byKey = new Map<string, Flow>();
  private key(accountId: string, flowId: string): string {
    return `${accountId}:${flowId}`;
  }
  async getById(accountId: string, flowId: string): Promise<Flow | null> {
    return this.byKey.get(this.key(accountId, flowId)) ?? null;
  }
  async upsert(accountId: string, flow: Flow): Promise<void> {
    this.byKey.set(this.key(accountId, flow.id), flow);
  }
}

export class InMemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, string>();
  async get(ref: string): Promise<string | null> {
    return this.map.get(ref) ?? null;
  }
  async set(ref: string, token: string): Promise<void> {
    this.map.set(ref, token);
  }
  async delete(ref: string): Promise<void> {
    this.map.delete(ref);
  }
}

export function createInMemoryRepositories(): Repositories {
  return {
    accounts: new InMemoryAccountRepository(),
    contacts: new InMemoryContactRepository(),
    automations: new InMemoryAutomationRepository(),
    flows: new InMemoryFlowRepository(),
  };
}

export const uuidIdGenerator: IdGenerator = { newId: () => randomUUID() };

/** No-op logger for tests. */
export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/** Console logger for quick local runs. */
export const consoleLogger: Logger = {
  debug: (m, meta) => console.debug(m, meta ?? ""),
  info: (m, meta) => console.info(m, meta ?? ""),
  warn: (m, meta) => console.warn(m, meta ?? ""),
  error: (m, meta) => console.error(m, meta ?? ""),
};
