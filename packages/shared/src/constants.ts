/**
 * Constants grounded in Meta's official Instagram Platform API (2025–2026).
 *
 * Values that Meta versions or tunes over time (Graph API version, publish limit) are exposed here
 * as defaults and are overridable via runtime config — never hardcode them at call sites.
 *
 * Sources:
 *  - https://developers.facebook.com/docs/instagram-platform/overview/
 *  - https://developers.facebook.com/docs/instagram-platform/private-replies/
 *  - https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/
 *  - https://developers.facebook.com/docs/instagram-platform/webhooks
 */

/** Default Graph API version. Overridable via config; bump as Meta releases new versions. */
export const DEFAULT_GRAPH_VERSION = "v26.0";

/** Base URLs for the two login methods Meta supports. */
export const GRAPH_BASE_URL = {
  /** Instagram API with Instagram Login (no Facebook Page required). */
  instagramLogin: "https://graph.instagram.com",
  /** Instagram API with Facebook Login (requires a linked Facebook Page). */
  facebookLogin: "https://graph.facebook.com",
} as const;

// Instagram API with Instagram Login OAuth endpoints.
export const OAUTH_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const OAUTH_ACCESS_TOKEN_URL =
  "https://api.instagram.com/oauth/access_token";
export const OAUTH_LONG_LIVED_TOKEN_URL =
  "https://graph.instagram.com/access_token";
export const OAUTH_REFRESH_TOKEN_URL =
  "https://graph.instagram.com/refresh_access_token";

/**
 * Scopes for the Instagram API with Instagram Login.
 * The pre-2025 `business_*` scope aliases were deprecated on 2025-01-27.
 */
export const IG_SCOPES = {
  basic: "instagram_business_basic",
  contentPublish: "instagram_business_content_publish",
  manageComments: "instagram_business_manage_comments",
  manageMessages: "instagram_business_manage_messages",
} as const;

export type IgScope = (typeof IG_SCOPES)[keyof typeof IG_SCOPES];

/** Messaging & private-reply timing rules (see private-replies + messaging docs). */
export const TIMING = {
  /** Free-form DMs are only allowed within 24h of the user's last message. */
  messagingWindowHours: 24,
  /** A private reply to a comment may be sent within 7 days of the comment. */
  privateReplyWindowDays: 7,
  /** Human Agent tag extends response time to 7 days for support. */
  humanAgentWindowDays: 7,
  /** Long-lived tokens last ~60 days and must be refreshed before expiry. */
  longLivedTokenDays: 60,
  /** Refresh a long-lived token when it has this many days or fewer remaining. */
  tokenRefreshThresholdDays: 10,
} as const;

/** Interactive messaging limits. */
export const MESSAGE_LIMITS = {
  /** Message text must be UTF-8 and 1000 bytes or fewer. */
  textMaxBytes: 1000,
  /** Up to 13 quick-reply buttons per message. */
  maxQuickReplies: 13,
  /** Up to 4 ice breakers (FAQ starters). */
  maxIceBreakers: 4,
  /** Generic template: up to 10 elements (cards). */
  maxTemplateElements: 10,
  /** Generic template: up to 3 buttons per element. */
  maxTemplateButtons: 3,
  /** Element title / subtitle character limit. */
  templateTitleMaxChars: 80,
  /** Up to 10 images per message. */
  maxImagesPerMessage: 10,
  imageMaxBytes: 8 * 1024 * 1024,
  mediaMaxBytes: 25 * 1024 * 1024,
} as const;

/**
 * Content publishing limit per IG professional account per rolling 24h.
 * Meta documents 100 per rolling window; query each account quota. The default (carousels count as 1); confirm live via the
 * content_publishing_limit endpoint. Overridable via config.
 */
export const DEFAULT_CONTENT_PUBLISH_LIMIT_24H = 100;

/** Graph API rate limits relevant to messaging (calls per second, per account). */
export const RATE_LIMITS = {
  conversationsPerSecond: 2,
  textMessagesPerSecond: 100,
  mediaMessagesPerSecond: 10,
  /** Private replies to Instagram Live comments. */
  liveCommentPrivateRepliesPerSecond: 100,
} as const;

/** Webhook field (topic) names an Instagram app can subscribe to. */
export const WEBHOOK_FIELDS = {
  comments: "comments",
  liveComments: "live_comments",
  mentions: "mentions",
  messages: "messages",
  messageEchoes: "message_echoes",
  messageReactions: "message_reactions",
  messagingPostbacks: "messaging_postbacks",
  messagingSeen: "messaging_seen",
  messagingReferral: "messaging_referral",
  messagingOptins: "messaging_optins",
  messagingHandover: "messaging_handover",
  messagingPolicyEnforcement: "messaging_policy_enforcement",
  responseFeedback: "response_feedback",
  standby: "standby",
  storyInsights: "story_insights",
} as const;

export type WebhookField = (typeof WEBHOOK_FIELDS)[keyof typeof WEBHOOK_FIELDS];

/** Header carrying the SHA-256 HMAC of the raw webhook body. */
export const SIGNATURE_HEADER = "x-hub-signature-256";

/** Quick-reply payload prefix used by the follow-gate "I followed" button. */
export const FOLLOW_GATE_PAYLOAD_PREFIX = "fg:";
