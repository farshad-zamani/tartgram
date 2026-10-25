import { readJson, atomicJson } from "./storage.js";
import type { GatewayConfig } from "./config.js";
import { tokenFor } from "./account-client.js";
import { validFlow } from "./flow-validation.js";
import { GRAPH_BASE_URL } from "@app/shared";
import {
  AutomationEngine,
  GraphClient,
  InMemoryContactRepository,
  uuidIdGenerator,
  type AccountRepository,
  type AutomationRepository,
  type ContactRepository,
  type FlowRepository,
  type Logger,
  type Repositories,
  type StatsRecorder,
} from "@app/core";
import {
  type Account,
  type Automation,
  type Flow,
  type IceBreaker,
} from "@app/shared";
import { JsonAccountStore, type ConnectedAccount } from "./account-store.js";

/** Ice breaker taps arrive as postbacks with this payload prefix; synthesized ids use the others. */
export const IB_PAYLOAD_PREFIX = "ib:";
const IB_AUTO_PREFIX = "ibauto:";
const IB_FLOW_PREFIX = "ibflow:";

function synthIceBreakerAutomation(
  accountId: string,
  ib: IceBreaker,
): Automation {
  return {
    id: IB_AUTO_PREFIX + ib.id,
    accountId,
    name: ib.question,
    enabled: true,
    trigger: { kind: "postback", payload: IB_PAYLOAD_PREFIX + ib.id },
    flowId: IB_FLOW_PREFIX + ib.id,
    createdAt: 0,
    updatedAt: 0,
  };
}

function synthIceBreakerFlow(ib: IceBreaker): Flow {
  return {
    id: IB_FLOW_PREFIX + ib.id,
    name: ib.question,
    startNodeId: "n1",
    nodes: [
      {
        kind: "send",
        id: "n1",
        message: { type: "text", text: ib.response, quickReplies: [] },
      },
    ],
  };
}

/** Map a stored ConnectedAccount to the engine's domain Account (id === igId here). */
function toDomainAccount(c: ConnectedAccount): Account {
  return {
    id: c.igId,
    igId: c.igId,
    username: c.username,
    loginMethod: c.loginMethod,
    accessTokenRef: c.igId,
    tokenExpiresAt: c.expiresAt,
    scopes: c.scopes,
    connectedAt: c.connectedAt,
    active:
      !c.reconnectRequired &&
      c.subscriptionStatus === "active" &&
      (!c.expiresAt || c.expiresAt > Date.now()),
  };
}

class ConnectedAccountRepository implements AccountRepository {
  constructor(private readonly store: JsonAccountStore) {}
  async getById(id: string): Promise<Account | null> {
    const all = await this.store.load();
    const c = all.find((a) => a.igId === id);
    return c ? toDomainAccount(c) : null;
  }
  getByIgId(igId: string): Promise<Account | null> {
    return this.getById(igId);
  }
  async list(): Promise<Account[]> {
    return (await this.store.load()).map(toDomainAccount);
  }
  async upsert(): Promise<void> {}
  async setActive(): Promise<void> {}
}

export interface AutomationsFile {
  automations: Automation[];
  flows: Record<string, Flow[]>;
  iceBreakers?: Record<string, IceBreaker[]>;
}

/** Missing files start empty; invalid stored data must be repaired or restored explicitly. */
export async function loadAutomationsFile(
  path: string,
): Promise<Required<AutomationsFile>> {
  const def = await readJson<AutomationsFile>(path, () => ({
    automations: [],
    flows: {},
    iceBreakers: {},
  }));
  if (!Array.isArray(def.automations) || !def.flows)
    throw new Error("Invalid automations file.");
  return {
    automations: def.automations,
    flows: def.flows,
    iceBreakers: def.iceBreakers ?? {},
  };
}
export async function saveAutomationsFile(
  path: string,
  def: AutomationsFile,
): Promise<void> {
  await atomicJson(path, def);
}

/** Repositories that read the automations file on each call, so edits go live without a restart. */
class FileAutomationRepository implements AutomationRepository {
  constructor(private readonly path: string) {}
  async listEnabledForAccount(accountId: string): Promise<Automation[]> {
    const { automations, iceBreakers } = await loadAutomationsFile(this.path);
    const synth = (iceBreakers[accountId] ?? []).map((ib) =>
      synthIceBreakerAutomation(accountId, ib),
    );
    return [
      ...automations.filter((a) => a.accountId === accountId && a.enabled),
      ...synth,
    ];
  }
  async getById(id: string): Promise<Automation | null> {
    const { automations, iceBreakers } = await loadAutomationsFile(this.path);
    const found = automations.find((a) => a.id === id);
    if (found) return found;
    if (id.startsWith(IB_AUTO_PREFIX)) {
      const ibId = id.slice(IB_AUTO_PREFIX.length);
      for (const [accountId, list] of Object.entries(iceBreakers)) {
        const ib = list.find((x) => x.id === ibId);
        if (ib) return synthIceBreakerAutomation(accountId, ib);
      }
    }
    return null;
  }
  async upsert(): Promise<void> {}
}

class FileFlowRepository implements FlowRepository {
  constructor(private readonly path: string) {}
  async getById(accountId: string, flowId: string): Promise<Flow | null> {
    const { flows, iceBreakers } = await loadAutomationsFile(this.path);
    if (flowId.startsWith(IB_FLOW_PREFIX)) {
      const ibId = flowId.slice(IB_FLOW_PREFIX.length);
      const ib = (iceBreakers[accountId] ?? []).find((x) => x.id === ibId);
      return ib ? synthIceBreakerFlow(ib) : null;
    }
    const flow = (flows[accountId] ?? []).find((f) => f.id === flowId) ?? null;
    if (flow && !validFlow(flow))
      throw new Error(
        "Stored flow is invalid. Repair its graph before enabling the automation.",
      );
    return flow;
  }
  async upsert(): Promise<void> {}
}

/** Wrap a Fastify (pino) logger in the core Logger interface. */
export function toCoreLogger(log: {
  debug: (o: object, m?: string) => void;
  info: (o: object, m?: string) => void;
  warn: (o: object, m?: string) => void;
  error: (o: object, m?: string) => void;
}): Logger {
  return {
    debug: (m, meta) => log.debug(meta ?? {}, m),
    info: (m, meta) => log.info(meta ?? {}, m),
    warn: (m, meta) => log.warn(meta ?? {}, m),
    error: (m, meta) => log.error(meta ?? {}, m),
  };
}

/**
 * Build an AutomationEngine backed by the accounts + automations files. Returns null if there is no
 * automations file (the gateway then runs as a pure fan-out relay). The engine sends via a real
 * GraphClient bound to each account's stored token.
 */
export async function buildEngineFromFiles(
  accountsFile: string,
  automationsFile: string,
  logger: Logger,
  stats: StatsRecorder | undefined,
  contacts: ContactRepository | undefined,
  config: GatewayConfig,
): Promise<AutomationEngine | null> {
  await loadAutomationsFile(automationsFile);
  const store = new JsonAccountStore(accountsFile, config.tokenEncryptionKey);
  const repos: Repositories = {
    accounts: new ConnectedAccountRepository(store),
    contacts: contacts ?? new InMemoryContactRepository(),
    automations: new FileAutomationRepository(automationsFile),
    flows: new FileFlowRepository(automationsFile),
  };

  return new AutomationEngine({
    repos,
    getApi: (account) =>
      new GraphClient({
        igUserId: account.igId,
        version: config.graphVersion,
        baseUrl:
          account.loginMethod === "unified_login"
            ? GRAPH_BASE_URL.facebookLogin
            : GRAPH_BASE_URL.instagramLogin,
        getToken: () => tokenFor(store, account.igId),
        onInvalidToken: (token) => store.invalidateToken(token),
        logger,
      }),
    logger,
    idGen: uuidIdGenerator,
    stats,
  });
}
