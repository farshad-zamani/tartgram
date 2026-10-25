import { describe, expect, it } from "vitest";
import type { CommentEvent, MessageEvent, PostbackEvent } from "@app/shared";
import { normalizeWebhookBody } from "../src/webhook/normalize.js";
it("normalizes both seconds and millisecond entry timestamps without changing their instant", () => {
  const make = (time: number) => ({
    object: "instagram",
    entry: [
      {
        id: "account",
        time,
        changes: [
          { field: "comments", value: { id: "comment", text: "hello" } },
        ],
      },
    ],
  });
  expect(normalizeWebhookBody(make(1700000000))[0]?.timestamp).toBe(
    1700000000000,
  );
  expect(normalizeWebhookBody(make(1700000000000))[0]?.timestamp).toBe(
    1700000000000,
  );
});

describe("normalizeWebhookBody", () => {
  it("ignores webhook objects for other products", () =>
    expect(
      normalizeWebhookBody({
        object: "page",
        entry: [
          {
            id: "account",
            changes: [{ field: "comments", value: { id: "comment" } }],
          },
        ],
      }),
    ).toEqual([]));
  it("does not create an inbound message without a sender", () =>
    expect(
      normalizeWebhookBody({
        object: "instagram",
        entry: [
          {
            id: "account",
            messaging: [{ message: { mid: "message", text: "hello" } }],
          },
        ],
      }),
    ).toEqual([]));
  it.each(["is_deleted", "is_unsupported", "is_self"])(
    "does not treat %s notifications as a new inbound message",
    (flag) => {
      const events = normalizeWebhookBody({
        object: "instagram",
        entry: [
          {
            id: "account",
            messaging: [
              {
                sender: { id: "person" },
                message: { mid: "message", [flag]: true },
              },
            ],
          },
        ],
      });
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("unknown");
      expect(events[0]?.dedupeKey).not.toBe("message:message");
    },
  );
  it("returns [] for non-webhook input", () => {
    expect(normalizeWebhookBody({ foo: "bar" })).toEqual([]);
    expect(normalizeWebhookBody(null)).toEqual([]);
    expect(normalizeWebhookBody("nope")).toEqual([]);
  });

  it("normalizes a comment change", () => {
    const events = normalizeWebhookBody({
      object: "instagram",
      entry: [
        {
          id: "17841400000000000",
          time: 1_700_000_000,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "قیمت؟",
                media: { id: "media_1", media_product_type: "FEED" },
                from: { id: "user_1", username: "buyer" },
              },
            },
          ],
        },
      ],
    });

    expect(events).toHaveLength(1);
    const ev = events[0] as CommentEvent;
    expect(ev.type).toBe("comment");
    expect(ev.commentId).toBe("comment_1");
    expect(ev.mediaId).toBe("media_1");
    expect(ev.text).toBe("قیمت؟");
    expect(ev.from?.username).toBe("buyer");
    expect(ev.isLive).toBe(false);
    expect(ev.dedupeKey).toBe("comment:comment_1");
    expect(ev.timestamp).toBe(1_700_000_000 * 1000);
  });

  it("flags live comments", () => {
    const events = normalizeWebhookBody({
      object: "instagram",
      entry: [
        {
          id: "acc",
          changes: [
            { field: "live_comments", value: { id: "lc1", text: "hi" } },
          ],
        },
      ],
    });
    expect((events[0] as CommentEvent).isLive).toBe(true);
  });

  it("normalizes a messaging message with a quick reply", () => {
    const events = normalizeWebhookBody({
      object: "instagram",
      entry: [
        {
          id: "acc",
          messaging: [
            {
              sender: { id: "igsid_1" },
              recipient: { id: "acc" },
              timestamp: 1_700_000_500_000,
              message: {
                mid: "mid_1",
                text: "hello",
                quick_reply: { payload: "GET_STARTED" },
              },
            },
          ],
        },
      ],
    });

    const ev = events[0] as MessageEvent;
    expect(ev.type).toBe("message");
    expect(ev.senderId).toBe("igsid_1");
    expect(ev.text).toBe("hello");
    expect(ev.quickReplyPayload).toBe("GET_STARTED");
    expect(ev.isEcho).toBe(false);
    expect(ev.dedupeKey).toBe("message:mid_1");
    expect(ev.timestamp).toBe(1_700_000_500_000);
  });

  it("normalizes a postback", () => {
    const events = normalizeWebhookBody({
      object: "instagram",
      entry: [
        {
          id: "acc",
          messaging: [
            {
              sender: { id: "igsid_1" },
              recipient: { id: "acc" },
              postback: { mid: "mid_2", title: "Buy", payload: "BUY_NOW" },
            },
          ],
        },
      ],
    });
    const ev = events[0] as PostbackEvent;
    expect(ev.type).toBe("postback");
    expect(ev.payload).toBe("BUY_NOW");
  });

  it("captures a story reply (reply_to.story)", () => {
    const events = normalizeWebhookBody({
      object: "instagram",
      entry: [
        {
          id: "acc",
          messaging: [
            {
              sender: { id: "s" },
              recipient: { id: "acc" },
              message: {
                mid: "m",
                text: "nice",
                reply_to: { story: { id: "st1", url: "u" } },
              },
            },
          ],
        },
      ],
    });
    expect((events[0] as MessageEvent).storyReply?.id).toBe("st1");
  });

  it("captures a story mention (story_mention attachment)", () => {
    const events = normalizeWebhookBody({
      object: "instagram",
      entry: [
        {
          id: "acc",
          messaging: [
            {
              sender: { id: "s" },
              recipient: { id: "acc" },
              message: {
                mid: "m",
                attachments: [
                  { type: "story_mention", payload: { url: "cdnurl" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect((events[0] as MessageEvent).storyMention?.url).toBe("cdnurl");
  });

  it("preserves unknown fields as unknown events", () => {
    const events = normalizeWebhookBody({
      object: "instagram",
      entry: [
        { id: "acc", changes: [{ field: "brand_new_field", value: { x: 1 } }] },
      ],
    });
    expect(events[0]?.type).toBe("unknown");
  });

  it("handles multiple entries and events", () => {
    const events = normalizeWebhookBody({
      object: "instagram",
      entry: [
        { id: "a", changes: [{ field: "comments", value: { id: "c1" } }] },
        {
          id: "b",
          messaging: [
            {
              sender: { id: "s" },
              recipient: { id: "b" },
              message: { mid: "m1", text: "hi" },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(2);
  });
});
