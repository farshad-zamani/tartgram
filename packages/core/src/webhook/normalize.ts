import {
  WEBHOOK_FIELDS,
  zCommentChangeValue,
  zMetaWebhookBody,
  type MetaEntry,
  type MetaMessaging,
  type NormalizedEvent,
} from "@app/shared";

/**
 * Convert a raw Meta webhook body into a flat list of `NormalizedEvent`s.
 *
 * Unrecognized fields are preserved as `unknown` events rather than dropped, so nothing is silently
 * lost and new Meta features degrade gracefully. Returns `[]` if the body isn't a valid webhook.
 */
export function normalizeWebhookBody(body: unknown): NormalizedEvent[] {
  const parsed = zMetaWebhookBody.safeParse(body);
  if (!parsed.success || parsed.data.object !== "instagram") return [];

  const events: NormalizedEvent[] = [];
  for (const entry of parsed.data.entry) {
    const entryTsMs = entry.time
      ? entry.time < 1_000_000_000_000
        ? entry.time * 1000
        : entry.time
      : Date.now();

    for (const change of entry.changes ?? []) {
      events.push(
        normalizeChange(entry, change.field, change.value, entryTsMs),
      );
    }
    for (const m of entry.messaging ?? []) {
      const ev = normalizeMessaging(entry, m, entryTsMs);
      if (ev) events.push(ev);
    }
  }
  return events;
}

function normalizeChange(
  entry: MetaEntry,
  field: string,
  value: unknown,
  entryTsMs: number,
): NormalizedEvent {
  const accountId = entry.id;

  if (
    field === WEBHOOK_FIELDS.comments ||
    field === WEBHOOK_FIELDS.liveComments
  ) {
    const c = zCommentChangeValue.safeParse(value);
    if (c.success) {
      return {
        type: "comment",
        accountId,
        timestamp: entryTsMs,
        dedupeKey: `comment:${c.data.id}`,
        isLive: field === WEBHOOK_FIELDS.liveComments,
        commentId: c.data.id,
        mediaId: c.data.media?.id,
        parentId: c.data.parent_id,
        text: c.data.text ?? "",
        from: c.data.from
          ? { id: c.data.from.id, username: c.data.from.username }
          : undefined,
      };
    }
  }

  if (field === WEBHOOK_FIELDS.storyInsights) {
    return {
      type: "story_insight",
      accountId,
      timestamp: entryTsMs,
      dedupeKey: `story_insight:${accountId}:${entryTsMs}`,
      raw: value,
    };
  }

  return {
    type: "unknown",
    accountId,
    timestamp: entryTsMs,
    dedupeKey: `unknown:${field}:${accountId}:${entryTsMs}`,
    field,
    raw: value,
  };
}

function normalizeMessaging(
  entry: MetaEntry,
  m: MetaMessaging,
  entryTsMs: number,
): NormalizedEvent | null {
  const accountId = entry.id;
  const senderId = m.sender?.id ?? "";
  // Messenger-style timestamps are already epoch milliseconds.
  const ts = m.timestamp ?? entryTsMs;
  if (!senderId && (m.message || m.postback)) return null;

  if (m.message) {
    const msg = m.message;
    if (
      msg.is_deleted === true ||
      msg.is_unsupported === true ||
      msg.is_self === true
    ) {
      const field =
        msg.is_deleted === true
          ? "message_deleted"
          : msg.is_self === true
            ? "message_self"
            : "message_unsupported";
      return {
        type: "unknown",
        field,
        accountId,
        timestamp: ts,
        dedupeKey: `${field}:${msg.mid ?? `${senderId}:${ts}`}`,
        raw: msg,
      };
    }
    const attachments = (msg.attachments ?? []).map((a) => ({
      type: a.type,
      url:
        typeof a.payload?.["url"] === "string"
          ? (a.payload["url"] as string)
          : undefined,
    }));
    const mention = attachments.find((a) => a.type === "story_mention");
    const storyReply = msg.reply_to?.story;
    return {
      type: "message",
      accountId,
      timestamp: ts,
      dedupeKey: msg.mid ? `message:${msg.mid}` : `message:${senderId}:${ts}`,
      senderId,
      mid: msg.mid,
      text: msg.text,
      isEcho: msg.is_echo === true,
      quickReplyPayload: msg.quick_reply?.payload,
      attachments,
      ...(storyReply
        ? { storyReply: { id: storyReply.id, url: storyReply.url } }
        : {}),
      ...(mention ? { storyMention: { url: mention.url } } : {}),
    };
  }

  if (m.postback) {
    return {
      type: "postback",
      accountId,
      timestamp: ts,
      dedupeKey: m.postback.mid
        ? `postback:${m.postback.mid}`
        : `postback:${senderId}:${m.postback.payload ?? ""}:${ts}`,
      senderId,
      mid: m.postback.mid,
      payload: m.postback.payload ?? "",
      title: m.postback.title,
    };
  }

  if (m.reaction) {
    return {
      type: "reaction",
      accountId,
      timestamp: ts,
      dedupeKey: `reaction:${m.reaction.mid ?? ""}:${m.reaction.action ?? ""}:${ts}`,
      senderId,
      mid: m.reaction.mid,
      action: m.reaction.action ?? "",
      reaction: m.reaction.reaction,
      emoji: m.reaction.emoji,
    };
  }

  if (m.read) {
    return {
      type: "seen",
      accountId,
      timestamp: ts,
      dedupeKey: `seen:${senderId}:${m.read.mid ?? ts}`,
      senderId,
      mid: m.read.mid,
    };
  }

  if (m.referral) {
    return {
      type: "referral",
      accountId,
      timestamp: ts,
      dedupeKey: `referral:${senderId}:${ts}`,
      senderId,
      raw: m.referral,
    };
  }

  return null;
}
