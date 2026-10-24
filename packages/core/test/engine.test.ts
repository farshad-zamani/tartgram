import type {
  Account,
  Automation,
  CommentEvent,
  Flow,
  MessageContent,
  MessageEvent,
} from "@app/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { AutomationEngine } from "../src/automation/engine.js";
import {
  createInMemoryRepositories,
  silentLogger,
  uuidIdGenerator,
} from "../src/adapters/memory.js";
import type { InstagramApi, Repositories, UserProfile } from "../src/ports.js";

class FakeApi implements InstagramApi {
  messages: { igsid: string; content: MessageContent }[] = [];
  privateReplies: { commentId: string; content: MessageContent }[] = [];
  publicReplies: { commentId: string; text: string }[] = [];
  hidden: { commentId: string; hide: boolean }[] = [];
  profile: UserProfile = { is_user_follow_business: false };

  async sendMessage(igsid: string, content: MessageContent) {
    this.messages.push({ igsid, content });
    return { message_id: "m" };
  }
  async sendPrivateReply(commentId: string, content: MessageContent) {
    this.privateReplies.push({ commentId, content });
    return { message_id: "pr" };
  }
  async replyToComment(commentId: string, text: string) {
    this.publicReplies.push({ commentId, text });
    return { id: "r" };
  }
  async setCommentHidden(commentId: string, hide: boolean) {
    this.hidden.push({ commentId, hide });
    return {};
  }
  async getUserProfile(): Promise<UserProfile> {
    return this.profile;
  }
}

const account: Account = {
  id: "acc1",
  igId: "IG100",
  username: "shop",
  loginMethod: "instagram_login",
  accessTokenRef: "ref1",
  scopes: [],
  connectedAt: 0,
  active: true,
};

function textFlow(id: string, text: string): Flow {
  return {
    id,
    name: id,
    startNodeId: "n1",
    nodes: [
      {
        kind: "send",
        id: "n1",
        message: { type: "text", text, quickReplies: [] },
      },
    ],
  };
}

function commentAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "a1",
    accountId: "acc1",
    name: "price",
    enabled: true,
    trigger: {
      kind: "comment",
      keyword: {
        mode: "any",
        matchAll: false,
        caseSensitive: false,
        include: ["قیمت"],
        exclude: [],
      },
      mediaIds: [],
      includeLive: false,
    },
    flowId: "f1",
    commentAction: { privateReply: true, hideComment: false },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function commentEvent(over: Partial<CommentEvent> = {}): CommentEvent {
  return {
    type: "comment",
    accountId: "IG100",
    timestamp: 1000,
    dedupeKey: "comment:c1",
    isLive: false,
    commentId: "c1",
    mediaId: "m1",
    text: "قیمت این چنده؟",
    from: { id: "u1", username: "buyer" },
    ...over,
  };
}

function dmEvent(text: string, over: Partial<MessageEvent> = {}): MessageEvent {
  return {
    type: "message",
    accountId: "IG100",
    timestamp: 2000,
    dedupeKey: "message:mid1",
    senderId: "igsid1",
    mid: "mid1",
    text,
    isEcho: false,
    attachments: [],
    ...over,
  };
}

function textOf(content: MessageContent): string {
  return content.type === "text" ? content.text : `[${content.type}]`;
}

describe("AutomationEngine", () => {
  let repos: Repositories;
  let api: FakeApi;
  let engine: AutomationEngine;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    api = new FakeApi();
    await repos.accounts.upsert(account);
    await repos.flows.upsert(
      "acc1",
      textFlow("f1", "لینک محصول: https://shop.example"),
    );
    engine = new AutomationEngine({
      repos,
      getApi: () => api,
      logger: silentLogger,
      idGen: uuidIdGenerator,
      clock: { now: () => 1000 },
    });
  });

  it("sends a private reply when a comment matches the keyword, and records the contact", async () => {
    await repos.automations.upsert(commentAutomation());
    await engine.handleEvent(commentEvent());

    expect(api.privateReplies).toHaveLength(1);
    expect(api.privateReplies[0]!.commentId).toBe("c1");
    expect(textOf(api.privateReplies[0]!.content)).toContain(
      "https://shop.example",
    );

    const contact = await repos.contacts.getByIgsid("acc1", "u1");
    expect(contact?.username).toBe("buyer");
  });

  it("does nothing when the comment does not match the keyword", async () => {
    await repos.automations.upsert(commentAutomation());
    await engine.handleEvent(commentEvent({ text: "چه رنگی داره؟" }));
    expect(api.privateReplies).toHaveLength(0);
  });

  it("respects a mediaIds filter", async () => {
    await repos.automations.upsert(
      commentAutomation({
        trigger: {
          kind: "comment",
          keyword: {
            mode: "any",
            matchAll: false,
            caseSensitive: false,
            include: ["قیمت"],
            exclude: [],
          },
          mediaIds: ["ONLY_THIS_MEDIA"],
          includeLive: false,
        },
      }),
    );
    await engine.handleEvent(commentEvent({ mediaId: "m1" }));
    expect(api.privateReplies).toHaveLength(0);
  });

  it("posts a public reply and hides the comment when configured", async () => {
    await repos.automations.upsert(
      commentAutomation({
        commentAction: {
          privateReply: true,
          publicReply: "پیام دادیم 📩",
          hideComment: true,
        },
      }),
    );
    await engine.handleEvent(commentEvent());
    expect(api.publicReplies[0]?.text).toBe("پیام دادیم 📩");
    expect(api.hidden[0]).toEqual({ commentId: "c1", hide: true });
    expect(api.privateReplies).toHaveLength(1);
  });

  it("only sends the first message of a multi-step flow as a private reply", async () => {
    await repos.flows.upsert("acc1", {
      id: "f1",
      name: "two",
      startNodeId: "n1",
      nodes: [
        {
          kind: "send",
          id: "n1",
          message: { type: "text", text: "اول", quickReplies: [] },
          next: "n2",
        },
        {
          kind: "send",
          id: "n2",
          message: { type: "text", text: "دوم", quickReplies: [] },
        },
      ],
    });
    await repos.automations.upsert(commentAutomation());
    await engine.handleEvent(commentEvent());
    expect(api.privateReplies).toHaveLength(1);
    expect(textOf(api.privateReplies[0]!.content)).toBe("اول");
  });

  it("runs a keyword DM automation as a direct message", async () => {
    await repos.automations.upsert(
      commentAutomation({
        id: "a2",
        trigger: {
          kind: "dm_keyword",
          keyword: {
            mode: "any",
            matchAll: false,
            caseSensitive: false,
            include: ["ثبت‌نام"],
            exclude: [],
          },
        },
        commentAction: undefined,
      }),
    );
    await engine.handleEvent(dmEvent("سلام میخوام ثبت‌نام کنم"));
    expect(api.messages).toHaveLength(1);
    expect(api.messages[0]!.igsid).toBe("igsid1");

    const contact = await repos.contacts.getByIgsid("acc1", "igsid1");
    expect(contact?.lastInboundAt).toBe(2000);
  });

  it("ignores echo messages", async () => {
    await repos.automations.upsert(
      commentAutomation({
        id: "a2",
        trigger: { kind: "default_reply" },
        commentAction: undefined,
      }),
    );
    await engine.handleEvent(dmEvent("anything", { isEcho: true }));
    expect(api.messages).toHaveLength(0);
  });

  it("matches a quick-reply payload to a postback automation", async () => {
    await repos.automations.upsert(
      commentAutomation({
        id: "a3",
        trigger: { kind: "postback", payload: "BUY_NOW" },
        commentAction: undefined,
      }),
    );
    await engine.handleEvent(dmEvent("", { quickReplyPayload: "BUY_NOW" }));
    expect(api.messages).toHaveLength(1);
  });

  it("follow-gate: non-follower gets the prompt and the not-follower branch", async () => {
    api.profile = { is_user_follow_business: false };
    await repos.flows.upsert("acc1", {
      id: "fg",
      name: "gate",
      startNodeId: "g",
      nodes: [
        {
          kind: "follow_gate",
          id: "g",
          ifFollower: "yes",
          ifNotFollower: "no",
          promptMessage: {
            type: "text",
            text: "اول فالو کن",
            quickReplies: [],
          },
        },
        {
          kind: "send",
          id: "yes",
          message: { type: "text", text: "ممنون که فالوئی", quickReplies: [] },
        },
        {
          kind: "send",
          id: "no",
          message: { type: "text", text: "لینک بعد از فالو", quickReplies: [] },
        },
      ],
    });
    await repos.automations.upsert(
      commentAutomation({
        id: "a4",
        trigger: { kind: "default_reply" },
        flowId: "fg",
        commentAction: undefined,
      }),
    );
    await engine.handleEvent(dmEvent("سلام"));
    expect(api.messages.map((m) => textOf(m.content))).toEqual([
      "اول فالو کن",
      "لینک بعد از فالو",
    ]);
  });

  it("follow-gate: follower skips the prompt and takes the follower branch", async () => {
    api.profile = { is_user_follow_business: true };
    await repos.flows.upsert("acc1", {
      id: "fg",
      name: "gate",
      startNodeId: "g",
      nodes: [
        {
          kind: "follow_gate",
          id: "g",
          ifFollower: "yes",
          ifNotFollower: "no",
          promptMessage: {
            type: "text",
            text: "اول فالو کن",
            quickReplies: [],
          },
        },
        {
          kind: "send",
          id: "yes",
          message: { type: "text", text: "ممنون که فالوئی", quickReplies: [] },
        },
        {
          kind: "send",
          id: "no",
          message: { type: "text", text: "لینک بعد از فالو", quickReplies: [] },
        },
      ],
    });
    await repos.automations.upsert(
      commentAutomation({
        id: "a5",
        trigger: { kind: "default_reply" },
        flowId: "fg",
        commentAction: undefined,
      }),
    );
    await engine.handleEvent(dmEvent("سلام"));
    expect(api.messages.map((m) => textOf(m.content))).toEqual([
      "ممنون که فالوئی",
    ]);
  });

  it("follow-gate: a comment sends the prompt with an 'I followed' button, not the reward", async () => {
    await repos.automations.upsert(
      commentAutomation({
        followGate: {
          enabled: true,
          promptMessage: "اول فالو کن",
          buttonLabel: "فالو کردم ✅",
          notFollowingMessage: "هنوز فالو نکردی",
        },
      }),
    );
    await engine.handleEvent(commentEvent());

    expect(api.privateReplies).toHaveLength(1);
    const c = api.privateReplies[0]!.content;
    expect(c.type).toBe("text");
    if (c.type === "text") {
      expect(c.text).toBe("اول فالو کن");
      expect(c.quickReplies[0]).toEqual({
        title: "فالو کردم ✅",
        payload: "fg:a1",
      });
    }
    expect(api.messages).toHaveLength(0); // reward withheld
  });

  it("follow-gate: clicking 'I followed' as a follower delivers the reward DM", async () => {
    await repos.automations.upsert(
      commentAutomation({
        followGate: {
          enabled: true,
          promptMessage: "x",
          buttonLabel: "فالو کردم",
          notFollowingMessage: "y",
        },
      }),
    );
    api.profile = { is_user_follow_business: true };
    await engine.handleEvent(dmEvent("", { quickReplyPayload: "fg:a1" }));
    expect(api.messages).toHaveLength(1);
    expect(textOf(api.messages[0]!.content)).toContain("لینک محصول");
  });

  it("follow-gate: clicking 'I followed' when NOT following resends the prompt, not the reward", async () => {
    await repos.automations.upsert(
      commentAutomation({
        followGate: {
          enabled: true,
          promptMessage: "x",
          buttonLabel: "فالو کردم",
          notFollowingMessage: "هنوز فالو نکردی",
        },
      }),
    );
    api.profile = { is_user_follow_business: false };
    await engine.handleEvent(dmEvent("", { quickReplyPayload: "fg:a1" }));
    expect(api.messages).toHaveLength(1);
    const c = api.messages[0]!.content;
    if (c.type === "text") {
      expect(c.text).toBe("هنوز فالو نکردی");
      expect(c.quickReplies[0]?.payload).toBe("fg:a1");
    }
  });

  it("records analytics (triggered + sent) when an automation fires", async () => {
    const events: { kind: string; automationId?: string; count?: number }[] =
      [];
    const statEngine = new AutomationEngine({
      repos,
      getApi: () => api,
      logger: silentLogger,
      idGen: uuidIdGenerator,
      clock: { now: () => 1000 },
      stats: { record: (kind, meta) => void events.push({ kind, ...meta }) },
    });
    await repos.automations.upsert(commentAutomation());
    await statEngine.handleEvent(commentEvent());
    expect(events.some((e) => e.kind === "triggered")).toBe(true);
    expect(events.some((e) => e.kind === "sent")).toBe(true);
  });

  it("story mention triggers a story_mention automation", async () => {
    await repos.automations.upsert(
      commentAutomation({
        id: "sm",
        trigger: { kind: "story_mention" },
        commentAction: undefined,
      }),
    );
    await engine.handleEvent(
      dmEvent("", { storyMention: { url: "https://cdn/story.jpg" } }),
    );
    expect(api.messages).toHaveLength(1);
  });

  it("story reply matching a keyword triggers a story_reply automation", async () => {
    await repos.automations.upsert(
      commentAutomation({
        id: "sr",
        trigger: {
          kind: "story_reply",
          keyword: {
            mode: "any",
            matchAll: false,
            caseSensitive: false,
            include: ["قیمت"],
            exclude: [],
          },
        },
        commentAction: undefined,
      }),
    );
    await engine.handleEvent(
      dmEvent("قیمت چنده؟", { storyReply: { id: "s1", url: "u" } }),
    );
    expect(api.messages).toHaveLength(1);
  });

  it("skips events for unknown or inactive accounts", async () => {
    await repos.automations.upsert(commentAutomation());
    await engine.handleEvent(commentEvent({ accountId: "UNKNOWN_IG" }));
    expect(api.privateReplies).toHaveLength(0);
  });
});
