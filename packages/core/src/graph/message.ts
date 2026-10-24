import { MESSAGE_LIMITS, type MessageContent } from "@app/shared";

/** The Graph API `message` object shape (Messenger-style, used by IG messaging). */
export interface GraphMessagePayload {
  text?: string;
  quick_replies?: { content_type: "text"; title: string; payload: string }[];
  attachment?: {
    type: "image" | "template";
    payload: Record<string, unknown>;
  };
}

/** Map our domain `MessageContent` into the Graph API `message` payload. */
export function buildMessagePayload(
  content: MessageContent,
): GraphMessagePayload {
  switch (content.type) {
    case "text": {
      if (!isWithinTextLimit(content.text))
        throw new Error("Message exceeds 1000 UTF-8 bytes.");
      const payload: GraphMessagePayload = { text: content.text };
      if (content.quickReplies.length > 0) {
        payload.quick_replies = content.quickReplies
          .slice(0, MESSAGE_LIMITS.maxQuickReplies)
          .map((qr) => ({
            content_type: "text",
            title: qr.title,
            payload: qr.payload,
          }));
      }
      return payload;
    }
    case "image":
      return {
        attachment: {
          type: "image",
          payload: { url: content.url, is_reusable: false },
        },
      };
    case "cards":
      return {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: content.cards
              .slice(0, MESSAGE_LIMITS.maxTemplateElements)
              .map((card) => ({
                title: card.title,
                ...(card.subtitle ? { subtitle: card.subtitle } : {}),
                ...(card.imageUrl ? { image_url: card.imageUrl } : {}),
                buttons: card.buttons
                  .slice(0, MESSAGE_LIMITS.maxTemplateButtons)
                  .map((b) =>
                    b.type === "url"
                      ? { type: "web_url", url: b.url, title: b.title }
                      : {
                          type: "postback",
                          payload: b.payload,
                          title: b.title,
                        },
                  ),
              })),
          },
        },
      };
  }
}

/** UTF-8 byte length of a string (messaging text is limited by bytes, not characters). */
export function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** True if a text message is within Meta's 1000-byte limit. */
export function isWithinTextLimit(text: string): boolean {
  return utf8ByteLength(text) <= MESSAGE_LIMITS.textMaxBytes;
}
