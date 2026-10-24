import {
  DEFAULT_GRAPH_VERSION,
  GRAPH_BASE_URL,
  type MessageContent,
} from "@app/shared";
import type { InstagramApi, Logger, UserProfile } from "../ports.js";
import { GraphApiError } from "./errors.js";
import { buildMessagePayload } from "./message.js";

export interface GraphClientOptions {
  /** IG professional account id that owns the calls. */
  igUserId: string;
  /** Resolves the current (valid) access token. Called per request so refreshes are picked up. */
  getToken: () => Promise<string>;
  version?: string;
  /** Defaults to the Instagram-Login base URL. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  onInvalidToken?: (token: string) => Promise<void>;
}

/** Optional tags for sending outside the standard 24h window (e.g. HUMAN_AGENT). */
export type MessagingTag = "HUMAN_AGENT";

export interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
}

export interface ConversationMessage {
  id: string;
  created_time?: string;
  from?: { id: string; username?: string };
  message?: string;
}

export interface ConversationSummary {
  id: string;
  updated_time?: string;
  participants?: { data?: { id: string; username?: string }[] };
  messages?: { data?: ConversationMessage[] };
}

const DEFAULT_PROFILE_FIELDS = [
  "name",
  "username",
  "profile_pic",
  "follower_count",
  "is_user_follow_business",
  "is_business_follow_user",
  "is_verified_user",
] as const;

/**
 * Thin, typed wrapper over the Instagram Graph API. Stateless apart from config; the token is
 * fetched fresh per call via `getToken`, so token refreshes are transparent to callers.
 */
export class GraphClient implements InstagramApi {
  private readonly igUserId: string;
  private readonly getToken: () => Promise<string>;
  private readonly version: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  readonly publishWarnings: string[] = [];
  private readonly onInvalidToken?: (token: string) => Promise<void>;

  constructor(opts: GraphClientOptions) {
    this.igUserId = opts.igUserId;
    this.getToken = opts.getToken;
    this.version = opts.version ?? DEFAULT_GRAPH_VERSION;
    this.baseUrl = opts.baseUrl ?? GRAPH_BASE_URL.instagramLogin;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.onInvalidToken = opts.onInvalidToken;
  }

  /** Send a message to a user (IGSID) within an open messaging window. */
  async sendMessage(
    recipientIgsid: string,
    content: MessageContent,
    opts?: { tag?: MessagingTag },
  ): Promise<{ recipient_id?: string; message_id?: string }> {
    const body: Record<string, unknown> = {
      recipient: { id: recipientIgsid },
      message: buildMessagePayload(content),
    };
    if (opts?.tag) {
      body["messaging_type"] = "MESSAGE_TAG";
      body["tag"] = opts.tag;
    }
    return this.request("POST", `${this.igUserId}/messages`, { body });
  }

  /**
   * Send a private reply (DM) to a commenter, keyed by the comment id.
   * Allowed within 7 days of the comment; one private reply per comment.
   */
  async sendPrivateReply(
    commentId: string,
    content: MessageContent,
  ): Promise<{ recipient_id?: string; message_id?: string }> {
    const body = {
      recipient: { comment_id: commentId },
      message: buildMessagePayload(content),
    };
    return this.request("POST", `${this.igUserId}/messages`, { body });
  }

  /** Post a public reply under a comment. */
  async replyToComment(
    commentId: string,
    text: string,
  ): Promise<{ id?: string }> {
    return this.request("POST", `${encodeURIComponent(commentId)}/replies`, {
      body: { message: text },
    });
  }

  /** Hide or unhide a comment. */
  async setCommentHidden(
    commentId: string,
    hide: boolean,
  ): Promise<{ success?: boolean }> {
    return this.request("POST", encodeURIComponent(commentId), {
      query: { hide: String(hide) },
    });
  }

  /** Delete a comment. */
  async deleteComment(commentId: string): Promise<{ success?: boolean }> {
    return this.request("DELETE", encodeURIComponent(commentId));
  }

  /** Look up a conversation participant's profile (enables follow-gating). */
  async getUserProfile(
    igsid: string,
    fields: readonly string[] = DEFAULT_PROFILE_FIELDS,
  ): Promise<UserProfile> {
    return this.request("GET", encodeURIComponent(igsid), {
      query: { fields: fields.join(",") },
    });
  }

  /** Remaining content-publishing quota in the rolling 24h window. */
  async getContentPublishingLimit(): Promise<{
    data?: { quota_usage?: number; config?: { quota_total?: number } }[];
  }> {
    return this.request("GET", `${this.igUserId}/content_publishing_limit`, {
      query: { fields: "quota_usage,config" },
    });
  }

  // ---- Content publishing ----

  /** Create a media container (step 1 of publishing). */
  async createMediaContainer(
    params: Record<string, string>,
  ): Promise<{ id?: string }> {
    return this.request("POST", `${this.igUserId}/media`, { query: params });
  }

  /** Publish a previously created container (step 2). */
  async publishMedia(creationId: string): Promise<{ id?: string }> {
    return this.request("POST", `${this.igUserId}/media_publish`, {
      query: { creation_id: creationId },
    });
  }

  /** Container processing status (for video/reel which process asynchronously). */
  async getContainerStatus(
    containerId: string,
  ): Promise<{ status_code?: string; status?: string }> {
    return this.request("GET", encodeURIComponent(containerId), {
      query: { fields: "status_code,status" },
    });
  }

  /** Poll a container until it is FINISHED (throws on ERROR/EXPIRED or timeout). */
  private async waitForContainer(
    containerId: string,
    maxMs = 150_000,
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const s = await this.getContainerStatus(containerId);
      if (s.status_code === "FINISHED") return;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
        throw new GraphApiError({
          message: `Container ${s.status_code}`,
          httpStatus: 400,
        });
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new GraphApiError({
      message: "Container processing timed out",
      httpStatus: 504,
    });
  }

  /** Publish a single image (image_url must be a public URL). Returns the new media id. */
  async publishImage(imageUrl: string, caption?: string): Promise<string> {
    const c = await this.createMediaContainer({
      image_url: imageUrl,
      ...(caption ? { caption } : {}),
    });
    if (!c.id)
      throw new GraphApiError({ message: "No container id", httpStatus: 502 });
    await this.waitForContainer(c.id);
    const p = await this.publishMedia(c.id);
    if (!p.id)
      throw new GraphApiError({ message: "Publish failed", httpStatus: 502 });
    return p.id;
  }

  /** Publish a Reel (video processed asynchronously). */
  async publishReel(videoUrl: string, caption?: string): Promise<string> {
    const c = await this.createMediaContainer({
      media_type: "REELS",
      video_url: videoUrl,
      ...(caption ? { caption } : {}),
    });
    if (!c.id)
      throw new GraphApiError({ message: "No container id", httpStatus: 502 });
    await this.waitForContainer(c.id);
    const p = await this.publishMedia(c.id);
    if (!p.id)
      throw new GraphApiError({ message: "Publish failed", httpStatus: 502 });
    return p.id;
  }

  /** Publish a Story (image or video). */
  async publishStory(
    mediaUrl: string,
    isVideo: boolean,
    caption?: string,
  ): Promise<string> {
    const params: Record<string, string> = {
      media_type: "STORIES",
      [isVideo ? "video_url" : "image_url"]: mediaUrl,
      ...(caption ? { caption } : {}),
    };
    const c = await this.createMediaContainer(params);
    if (!c.id)
      throw new GraphApiError({ message: "No container id", httpStatus: 502 });
    await this.waitForContainer(c.id);
    const p = await this.publishMedia(c.id);
    if (!p.id)
      throw new GraphApiError({ message: "Publish failed", httpStatus: 502 });
    return p.id;
  }

  /** List recent DM conversations (with the latest message snippet) for the unified inbox. */
  async getConversations(
    limit = 20,
  ): Promise<{ data?: ConversationSummary[] }> {
    return this.request("GET", `${this.igUserId}/conversations`, {
      query: {
        fields:
          "id,updated_time,participants,messages.limit(1){message,from,created_time}",
        limit: String(limit),
      },
    });
  }

  /** Fetch the messages of a conversation (newest first, as Meta returns them). */
  async getConversationMessages(
    conversationId: string,
    limit = 40,
  ): Promise<{ messages?: { data?: ConversationMessage[] } }> {
    return this.request("GET", encodeURIComponent(conversationId), {
      query: {
        fields: `messages.limit(${limit}){id,created_time,from,message}`,
      },
    });
  }

  /** Set up to 4 ice breakers (FAQ starters). Taps arrive as messaging_postback with the payload. */
  async setIceBreakers(
    items: { question: string; payload: string }[],
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `${this.igUserId}/messenger_profile`, {
      body: {
        platform: "instagram",
        ice_breakers: [
          { locale: "default", call_to_actions: items.slice(0, 4) },
        ],
      },
    });
  }

  /** Read the account's currently configured ice breakers. */
  async getIceBreakers(): Promise<{ data?: { ice_breakers?: unknown }[] }> {
    return this.request("GET", `${this.igUserId}/messenger_profile`, {
      query: { fields: "ice_breakers" },
    });
  }

  /** Remove all ice breakers. */
  async deleteIceBreakers(): Promise<Record<string, unknown>> {
    return this.request("DELETE", `${this.igUserId}/messenger_profile`, {
      body: { fields: ["ice_breakers"] },
    });
  }

  /** Recent media for the account (used to let users target automations to specific posts). */
  async getRecentMedia(limit = 24): Promise<{ data?: MediaItem[] }> {
    return this.request("GET", `${this.igUserId}/media`, {
      query: {
        fields:
          "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count",
        limit: String(limit),
      },
    });
  }

  /** Top-level comments on a specific media (for the comment inbox to show existing comments). */
  async getMediaComments(
    mediaId: string,
    limit = 50,
  ): Promise<{
    data?: {
      id: string;
      text?: string;
      username?: string;
      timestamp?: string;
      hidden?: boolean;
    }[];
  }> {
    return this.request("GET", `${encodeURIComponent(mediaId)}/comments`, {
      query: {
        fields: "id,text,username,timestamp,hidden",
        limit: String(limit),
      },
    });
  }

  private async request<T = Record<string, unknown>>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    opts?: { query?: Record<string, string>; body?: unknown },
  ): Promise<T> {
    const token = await this.getToken();
    const url = new URL(`${this.baseUrl}/${this.version}/${path}`);
    for (const [k, v] of Object.entries(opts?.query ?? {}))
      url.searchParams.set(k, v);

    const init: RequestInit = {
      method,
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    };
    if (opts?.body !== undefined) {
      init.headers = { ...init.headers, "content-type": "application/json" };
      init.body = JSON.stringify(opts.body);
    }

    const res = await this.fetchImpl(url, init);
    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    if (!res.ok || (json && typeof json === "object" && "error" in json)) {
      const err =
        (json as { error?: Record<string, unknown> } | undefined)?.error ?? {};
      if (err["code"] === 190 || res.status === 401)
        await this.onInvalidToken?.(token);
      throw new GraphApiError({
        message: `Meta API request failed (HTTP ${res.status}, code ${typeof err["code"] === "number" ? err["code"] : "unknown"}). Check permissions, account authorization and API limits.`,
        httpStatus: res.status,
        code:
          typeof err["code"] === "number" ? (err["code"] as number) : undefined,
        subcode:
          typeof err["error_subcode"] === "number"
            ? (err["error_subcode"] as number)
            : undefined,
        fbtraceId:
          typeof err["fbtrace_id"] === "string"
            ? (err["fbtrace_id"] as string)
            : undefined,
        type:
          typeof err["type"] === "string" ? (err["type"] as string) : undefined,
      });
    }

    if (path.endsWith("/media_publish")) {
      this.publishWarnings.length = 0;
      const warning = (json as { config_issue?: unknown } | undefined)
        ?.config_issue;
      if (typeof warning === "string") this.publishWarnings.push(warning);
    }
    return (json ?? {}) as T;
  }
}
