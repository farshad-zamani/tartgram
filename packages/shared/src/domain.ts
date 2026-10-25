import { z } from "zod";

/**
 * Persisted domain model, shared across gateway, engine, desktop and server.
 * These storage-agnostic shapes are implemented by the gateway repositories.
 */

/** Which Meta login method an account authenticated with. */
export const zLoginMethod = z.enum([
  "unified_login",
  "instagram_login",
  "facebook_login",
]);
export type LoginMethod = z.infer<typeof zLoginMethod>;

/** A connected Instagram professional account. */
export const zAccount = z.object({
  /** Internal id. */
  id: z.string(),
  /** IG professional account id (as seen in webhook entry ids / recipient). */
  igId: z.string(),
  username: z.string(),
  name: z.string().optional(),
  profilePicUrl: z.string().url().optional(),
  loginMethod: zLoginMethod.default("instagram_login"),
  /** Encrypted at rest by the token store; never logged. */
  accessTokenRef: z.string(),
  tokenExpiresAt: z.number().int().optional(),
  scopes: z.array(z.string()).default([]),
  connectedAt: z.number().int(),
  active: z.boolean().default(true),
});
export type Account = z.infer<typeof zAccount>;

/** A person who has interacted with an account (keyed by IGSID). */
export const zContact = z.object({
  id: z.string(),
  accountId: z.string(),
  igsid: z.string(),
  username: z.string().optional(),
  name: z.string().optional(),
  profilePicUrl: z.string().url().optional(),
  followerCount: z.number().int().optional(),
  isFollower: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  /** Free-form tags for segmentation. */
  tags: z.array(z.string()).default([]),
  /** Arbitrary captured attributes (email, phone, answers...). */
  attributes: z.record(z.string(), z.string()).default({}),
  /** Epoch ms of the contact's last inbound message (drives the 24h window). */
  lastInboundAt: z.number().int().optional(),
  createdAt: z.number().int(),
});
export type Contact = z.infer<typeof zContact>;

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** How keyword lists are matched against incoming text. */
export const zKeywordMatch = z.object({
  /** `any`: matches if any include keyword is present. `all`: every include present.
   *  `exact`: whole text equals an include. `is`: legacy alias for exact. */
  mode: z.enum(["any", "all", "exact"]).default("any"),
  /** If true, match every message regardless of keywords (still honours `exclude`). */
  matchAll: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
});
export type KeywordMatch = z.infer<typeof zKeywordMatch>;

export const zTrigger = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("comment"),
    keyword: zKeywordMatch,
    /** Limit to specific media ids; empty = all media. */
    mediaIds: z.array(z.string()).default([]),
    /** Also handle Instagram Live comments. */
    includeLive: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("dm_keyword"),
    keyword: zKeywordMatch,
  }),
  z.object({
    kind: z.literal("story_reply"),
    keyword: zKeywordMatch,
  }),
  z.object({
    kind: z.literal("story_mention"),
  }),
  z.object({
    kind: z.literal("postback"),
    payload: z.string(),
  }),
  z.object({
    kind: z.literal("welcome"),
  }),
  z.object({
    kind: z.literal("default_reply"),
  }),
]);
export type Trigger = z.infer<typeof zTrigger>;

// ---------------------------------------------------------------------------
// Flow / message content
// ---------------------------------------------------------------------------

export const zButton = z.object({
  type: z.enum(["url", "postback"]),
  title: z.string(),
  url: z.string().url().optional(),
  payload: z.string().optional(),
});
export type Button = z.infer<typeof zButton>;

export const zQuickReply = z.object({
  title: z.string().min(1).max(20),
  payload: z.string().min(1).max(1000),
});
export type QuickReply = z.infer<typeof zQuickReply>;

export const zCard = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  imageUrl: z.string().url().optional(),
  buttons: z.array(zButton).default([]),
});
export type Card = z.infer<typeof zCard>;

/** A single message an action can send. */
export const zMessageContent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z
      .string()
      .min(1)
      .refine(
        (v) => new TextEncoder().encode(v).length <= 1000,
        "Maximum 1000 UTF-8 bytes.",
      ),
    quickReplies: z.array(zQuickReply).max(13).default([]),
  }),
  z.object({ type: z.literal("image"), url: z.string().url() }),
  z.object({ type: z.literal("cards"), cards: z.array(zCard) }),
]);
export type MessageContent = z.infer<typeof zMessageContent>;

/** A flow node. The graph is intentionally minimal for now; M1 expands node kinds. */
export const zFlowNode = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("send"),
    id: z.string(),
    message: zMessageContent,
    next: z.string().optional(),
  }),
  z.object({
    kind: z.literal("delay"),
    id: z.string(),
    seconds: z.number().int().positive(),
    next: z.string().optional(),
  }),
  z.object({
    kind: z.literal("tag"),
    id: z.string(),
    add: z.array(z.string()).default([]),
    remove: z.array(z.string()).default([]),
    next: z.string().optional(),
  }),
  z.object({
    kind: z.literal("follow_gate"),
    id: z.string(),
    ifFollower: z.string().optional(),
    ifNotFollower: z.string().optional(),
    promptMessage: zMessageContent.optional(),
  }),
]);
export type FlowNode = z.infer<typeof zFlowNode>;

export const zFlow = z.object({
  id: z.string(),
  name: z.string(),
  startNodeId: z.string(),
  nodes: z.array(zFlowNode),
});
export type Flow = z.infer<typeof zFlow>;

/** What happens on a public comment when a comment automation fires. */
export const zCommentAction = z.object({
  /** Send the flow/message privately to the commenter (Private Reply). */
  privateReply: z.boolean().default(true),
  /** Optionally post a public reply under the comment. */
  publicReply: z.string().optional(),
  /** Hide the original comment after handling. */
  hideComment: z.boolean().default(false),
});
export type CommentAction = z.infer<typeof zCommentAction>;

/**
 * Optional "follow to unlock" gate. When enabled, the automation first sends `promptMessage` with an
 * "I followed" quick-reply button instead of the reward. On the button tap we re-check the follow
 * relationship (User Profile API `is_user_follow_business`) and deliver the reward flow only if the
 * user follows; otherwise we resend `notFollowingMessage` with the button.
 *
 * This respects Meta's limits: quick replies require an active conversation, and the button tap opens
 * that conversation (and the 24h window), so the reward is a normal message — and for comment
 * triggers the single prompt is the one allowed private reply.
 */
export const zFollowGate = z.object({
  enabled: z.boolean().default(false),
  promptMessage: z.string(),
  /** ≤ 20 chars (Meta quick-reply title limit). */
  buttonLabel: z.string().max(20).default("فالو کردم ✅"),
  notFollowingMessage: z.string(),
});
export type FollowGate = z.infer<typeof zFollowGate>;

/**
 * An ice breaker: an FAQ starter shown when a user opens the DM. Meta allows up to 4 per account.
 * The tap arrives as a messaging_postback; we deliver `response` as a DM.
 */
export const zIceBreaker = z.object({
  id: z.string(),
  question: z.string().min(1).max(80),
  response: z.string().min(1),
});
export type IceBreaker = z.infer<typeof zIceBreaker>;

/** An automation ties a trigger to a flow (and optional comment-specific action + follow gate). */
export const zAutomation = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
  trigger: zTrigger,
  flowId: z.string(),
  commentAction: zCommentAction.optional(),
  followGate: zFollowGate.optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Automation = z.infer<typeof zAutomation>;
