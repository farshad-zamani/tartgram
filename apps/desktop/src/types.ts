export interface AccountInfo {
  igId: string;
  username: string;
  scopes?: string[];
  tokenExpiresAt?: number;
  loginMethod?: string;
  subscriptionStatus?: string;
  reconnectRequired?: boolean;
}

export interface Status {
  engine: boolean;
  connectUrl: string;
  accounts: AccountInfo[];
  setup: {
    loginMode: string;
    graphVersion: string;
    oauthConfigured: boolean;
    webhookUrl: string;
    redirectUri: string;
    deauthorizeUrl: string;
    dataDeletionUrl: string;
    privacyUrl: string;
    termsUrl: string;
    requiredScopes: string[];
    humanAgentEnabled: boolean;
  };
  automationsCount: number;
  defaultAccountId?: string;
}

/** The account a page should default to (explicit default, else the first one). */
export function defaultIg(status: Status): string {
  const ids = status.accounts.map((a) => a.igId);
  return (
    (status.defaultAccountId && ids.includes(status.defaultAccountId)
      ? status.defaultAccountId
      : ids[0]) ?? ""
  );
}

export type TriggerKind =
  "comment" | "dm_keyword" | "story_reply" | "welcome" | "default_reply";

export interface KeywordMatch {
  mode: "any" | "all" | "exact";
  matchAll: boolean;
  caseSensitive: boolean;
  include: string[];
  exclude: string[];
}

export interface Automation {
  id: string;
  accountId: string;
  name: string;
  enabled: boolean;
  trigger:
    | {
        kind: "comment";
        keyword: KeywordMatch;
        mediaIds: string[];
        includeLive: boolean;
      }
    | { kind: "dm_keyword"; keyword: KeywordMatch }
    | { kind: "story_reply"; keyword: KeywordMatch }
    | { kind: "story_mention" }
    | { kind: "welcome" }
    | { kind: "default_reply" };
  flowId: string;
  commentAction?: {
    privateReply: boolean;
    publicReply?: string;
    hideComment: boolean;
  };
  followGate?: {
    enabled: boolean;
    promptMessage: string;
    buttonLabel: string;
    notFollowingMessage: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface FlowNode {
  kind: "send";
  id: string;
  message: { type: "text"; text: string; quickReplies: [] };
}

export interface Flow {
  id: string;
  name: string;
  startNodeId: string;
  nodes: FlowNode[];
}

export interface AutomationsFile {
  automations: Automation[];
  flows: Record<string, Flow[]>;
}

export interface MediaItem {
  id: string;
  caption: string;
  mediaType: string;
  thumbnail: string;
  permalink: string;
  timestamp: string;
}

export interface IceBreaker {
  id?: string;
  question: string;
  response: string;
}

export interface Stats {
  totals: {
    triggered: number;
    sent: number;
    follow_gate_prompt: number;
    follow_gate_pass: number;
  };
  perAutomation: Record<string, { triggered: number; sent: number }>;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  userId: string;
  username: string;
  updatedTime: string;
  snippet: string;
}

export interface InboxMessage {
  id: string;
  fromId: string;
  fromUsername: string;
  text: string;
  createdTime: string;
  isBusiness: boolean;
}

export interface StoredComment {
  id: string;
  accountId: string;
  mediaId?: string;
  parentId?: string;
  text: string;
  fromId?: string;
  fromUsername?: string;
  timestamp: number;
  status: "open" | "hidden" | "deleted" | "replied";
}

export type PostType = "image" | "reel" | "story";

export interface ScheduledPost {
  id: string;
  igId: string;
  type: PostType;
  url: string;
  caption?: string;
  scheduleAt: number;
  status: "pending" | "publishing" | "uncertain" | "published" | "failed";
  publishedMediaId?: string;
  warnings?: string[];
  error?: string;
  createdAt: number;
}

export interface PublishLimit {
  used: number;
  total: number;
}

export interface Caption {
  id: string;
  title: string;
  text: string;
}

export interface Contact {
  id: string;
  accountId: string;
  igsid: string;
  username?: string;
  name?: string;
  followerCount?: number;
  isFollower?: boolean;
  isVerified?: boolean;
  tags: string[];
  attributes: Record<string, string>;
  lastInboundAt?: number;
  createdAt: number;
}
