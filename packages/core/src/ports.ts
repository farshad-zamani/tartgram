import type {
  Account,
  Automation,
  Contact,
  Flow,
  MessageContent,
  NormalizedEvent,
} from "@app/shared";

/** Storage and API boundaries used by the engine and gateway adapters. */
export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface Clock {
  /** Current time in epoch milliseconds. */
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface IdGenerator {
  newId(): string;
}

/**
 * Encrypted-at-rest token storage. Implementations return the decrypted token from `get`.
 * Tokens must never be logged or included in error messages.
 */
export interface TokenStore {
  get(ref: string): Promise<string | null>;
  set(ref: string, token: string): Promise<void>;
  delete(ref: string): Promise<void>;
}

export interface AccountRepository {
  getById(id: string): Promise<Account | null>;
  getByIgId(igId: string): Promise<Account | null>;
  list(): Promise<Account[]>;
  upsert(account: Account): Promise<void>;
  setActive(id: string, active: boolean): Promise<void>;
}

export interface ContactRepository {
  getByIgsid(accountId: string, igsid: string): Promise<Contact | null>;
  upsert(contact: Contact): Promise<void>;
  addTags(id: string, tags: string[]): Promise<void>;
  removeTags(id: string, tags: string[]): Promise<void>;
  setAttribute(id: string, key: string, value: string): Promise<void>;
}

export interface AutomationRepository {
  listEnabledForAccount(accountId: string): Promise<Automation[]>;
  getById(id: string): Promise<Automation | null>;
  upsert(automation: Automation): Promise<void>;
}

export interface FlowRepository {
  getById(accountId: string, flowId: string): Promise<Flow | null>;
  upsert(accountId: string, flow: Flow): Promise<void>;
}

export interface Repositories {
  accounts: AccountRepository;
  contacts: ContactRepository;
  automations: AutomationRepository;
  flows: FlowRepository;
}

/** A conversation participant's profile (subset used for follow-gating and contact enrichment). */
export interface UserProfile {
  name?: string;
  username?: string;
  profile_pic?: string;
  follower_count?: number;
  is_user_follow_business?: boolean;
  is_business_follow_user?: boolean;
  is_verified_user?: boolean;
}

/**
 * The Instagram API surface the automation engine depends on. `GraphClient` implements it against
 * the real Graph API; tests inject a fake. Keeping this an interface is what lets the engine run
 * anywhere without dragging in network code.
 */
export interface InstagramApi {
  sendMessage(
    recipientIgsid: string,
    content: MessageContent,
  ): Promise<{ message_id?: string }>;
  sendPrivateReply(
    commentId: string,
    content: MessageContent,
  ): Promise<{ message_id?: string }>;
  replyToComment(commentId: string, text: string): Promise<{ id?: string }>;
  setCommentHidden(commentId: string, hide: boolean): Promise<unknown>;
  getUserProfile(
    igsid: string,
    fields?: readonly string[],
  ): Promise<UserProfile>;
}

/** Records automation funnel events for analytics. Implemented by the app (file/DB backed). */
export type StatKind =
  "triggered" | "sent" | "follow_gate_prompt" | "follow_gate_pass";

export interface StatsRecorder {
  record(
    kind: StatKind,
    meta: { accountId: string; automationId?: string; count?: number },
  ): void | Promise<void>;
}

export type EventHandler = (event: NormalizedEvent) => void | Promise<void>;

/**
 * Source of normalized events for the engine. In desktop mode this is a WebSocket client that dials
 * the gateway; in cloud/server mode it can be an in-process queue fed directly by the receiver.
 */
export interface EventTransport {
  onEvent(handler: EventHandler): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
