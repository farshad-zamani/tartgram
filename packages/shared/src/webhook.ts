import { z } from "zod";

/**
 * Raw Meta Instagram webhook payloads and the normalized internal event model.
 *
 * Meta delivers two shapes inside each `entry`:
 *  - `changes[]`  — field-based events (comments, live_comments, mentions, story_insights, ...)
 *  - `messaging[]` — Messenger-style events (messages, postbacks, reactions, seen, referrals, ...)
 *
 * Raw schemas are intentionally permissive (`.passthrough()`) so new/unknown fields never cause a
 * webhook to be rejected. The normalizer (in @app/core) maps these into `NormalizedEvent`.
 */

// ---------------------------------------------------------------------------
// Raw Meta payload schemas
// ---------------------------------------------------------------------------

export const zMetaChange = z
  .object({
    field: z.string(),
    value: z.unknown(),
  })
  .passthrough();

export const zMetaParticipant = z.object({ id: z.string() }).passthrough();

export const zMetaMessaging = z
  .object({
    sender: zMetaParticipant.optional(),
    recipient: zMetaParticipant.optional(),
    timestamp: z.number().optional(),
    message: z
      .object({
        mid: z.string().optional(),
        text: z.string().optional(),
        is_echo: z.boolean().optional(),
        quick_reply: z.object({ payload: z.string() }).passthrough().optional(),
        attachments: z
          .array(
            z
              .object({
                type: z.string().optional(),
                payload: z.record(z.string(), z.unknown()).optional(),
              })
              .passthrough(),
          )
          .optional(),
        reply_to: z
          .object({
            story: z
              .object({ id: z.string().optional(), url: z.string().optional() })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    postback: z
      .object({
        mid: z.string().optional(),
        title: z.string().optional(),
        payload: z.string().optional(),
      })
      .passthrough()
      .optional(),
    reaction: z
      .object({
        mid: z.string().optional(),
        action: z.string().optional(),
        reaction: z.string().optional(),
        emoji: z.string().optional(),
      })
      .passthrough()
      .optional(),
    read: z.object({ mid: z.string().optional() }).passthrough().optional(),
    referral: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const zMetaEntry = z
  .object({
    id: z.string(),
    time: z.number().optional(),
    changes: z.array(zMetaChange).optional(),
    messaging: z.array(zMetaMessaging).optional(),
  })
  .passthrough();

export const zMetaWebhookBody = z
  .object({
    object: z.string(),
    entry: z.array(zMetaEntry),
  })
  .passthrough();

export type MetaWebhookBody = z.infer<typeof zMetaWebhookBody>;
export type MetaEntry = z.infer<typeof zMetaEntry>;
export type MetaMessaging = z.infer<typeof zMetaMessaging>;

/** Value shape of a `comments` change (validated by the normalizer, not the outer body). */
export const zCommentChangeValue = z
  .object({
    id: z.string(),
    text: z.string().optional(),
    parent_id: z.string().optional(),
    from: z
      .object({ id: z.string(), username: z.string().optional() })
      .passthrough()
      .optional(),
    media: z
      .object({ id: z.string(), media_product_type: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type CommentChangeValue = z.infer<typeof zCommentChangeValue>;

// ---------------------------------------------------------------------------
// Normalized internal event model
// ---------------------------------------------------------------------------

export type NormalizedEventType =
  | "comment"
  | "message"
  | "postback"
  | "reaction"
  | "seen"
  | "referral"
  | "story_insight"
  | "unknown";

interface BaseEvent {
  /** IG professional account id that owns this event (the entry id / recipient). */
  accountId: string;
  /** Epoch milliseconds. */
  timestamp: number;
  /** Stable id used for idempotency/dedup. */
  dedupeKey: string;
}

export interface CommentEvent extends BaseEvent {
  type: "comment";
  isLive: boolean;
  commentId: string;
  mediaId?: string;
  parentId?: string;
  text: string;
  from?: { id: string; username?: string };
}

export interface MessageEvent extends BaseEvent {
  type: "message";
  /** IGSID of the sender. */
  senderId: string;
  mid?: string;
  text?: string;
  isEcho: boolean;
  quickReplyPayload?: string;
  attachments: { type?: string; url?: string }[];
  /** Present when the user replied to one of the business's stories. */
  storyReply?: { id?: string; url?: string };
  /** Present when the user mentioned the business in their story. */
  storyMention?: { url?: string };
}

export interface PostbackEvent extends BaseEvent {
  type: "postback";
  senderId: string;
  mid?: string;
  payload: string;
  title?: string;
}

export interface ReactionEvent extends BaseEvent {
  type: "reaction";
  senderId: string;
  mid?: string;
  action: string;
  reaction?: string;
  emoji?: string;
}

export interface SeenEvent extends BaseEvent {
  type: "seen";
  senderId: string;
  mid?: string;
}

export interface ReferralEvent extends BaseEvent {
  type: "referral";
  senderId: string;
  raw: unknown;
}

export interface StoryInsightEvent extends BaseEvent {
  type: "story_insight";
  mediaId?: string;
  raw: unknown;
}

export interface UnknownEvent extends BaseEvent {
  type: "unknown";
  field?: string;
  raw: unknown;
}

export type NormalizedEvent =
  | CommentEvent
  | MessageEvent
  | PostbackEvent
  | ReactionEvent
  | SeenEvent
  | ReferralEvent
  | StoryInsightEvent
  | UnknownEvent;
