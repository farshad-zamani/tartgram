import {
  FOLLOW_GATE_PAYLOAD_PREFIX,
  TIMING,
  type Account,
  type Automation,
  type CommentEvent,
  type Contact,
  type MessageContent,
  type MessageEvent,
  type NormalizedEvent,
  type PostbackEvent,
} from "@app/shared";
import {
  systemClock,
  type Clock,
  type IdGenerator,
  type InstagramApi,
  type Logger,
  type Repositories,
  type StatsRecorder,
} from "../ports.js";
import { matchKeyword } from "./keyword.js";
import {
  DirectDelivery,
  PrivateReplyDelivery,
  runFlow,
  type Delivery,
  type FlowRunContext,
} from "./flow-runner.js";

export interface AutomationEngineOptions {
  repos: Repositories;
  /** Builds an API client bound to the given account (real GraphClient in prod, fake in tests). */
  getApi: (account: Account) => InstagramApi;
  logger: Logger;
  idGen: IdGenerator;
  clock?: Clock;
  /** Optional analytics sink. */
  stats?: StatsRecorder;
}

/**
 * The heart of the product: turns a normalized Instagram event into the right automated action.
 * Pure orchestration over the ports — no network or storage specifics — so it runs identically in
 * the desktop app, the self-hosted server, or the cloud gateway.
 */
export class AutomationEngine {
  private readonly repos: Repositories;
  private readonly getApi: (account: Account) => InstagramApi;
  private readonly logger: Logger;
  private readonly idGen: IdGenerator;
  private readonly clock: Clock;
  private readonly stats?: StatsRecorder;

  constructor(opts: AutomationEngineOptions) {
    this.repos = opts.repos;
    this.getApi = opts.getApi;
    this.logger = opts.logger;
    this.idGen = opts.idGen;
    this.clock = opts.clock ?? systemClock;
    this.stats = opts.stats;
  }

  private stat(
    kind: Parameters<StatsRecorder["record"]>[0],
    accountId: string,
    automationId?: string,
    count = 1,
  ): void {
    void Promise.resolve(
      this.stats?.record(kind, { accountId, automationId, count }),
    ).catch(() => this.logger.error("Statistics could not be persisted."));
  }

  async handleEvent(event: NormalizedEvent): Promise<void> {
    try {
      switch (event.type) {
        case "comment":
          await this.handleComment(event);
          break;
        case "message":
          await this.handleMessage(event);
          break;
        case "postback":
          await this.handlePostback(event);
          break;
        default:
          this.logger.debug("No handler for event type", { type: event.type });
      }
    } catch (err) {
      this.logger.error("handleEvent failed", {
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private eventWindowMs(event: NormalizedEvent): number {
    return event.type === "comment"
      ? TIMING.privateReplyWindowDays * 86400_000
      : TIMING.messagingWindowHours * 3600_000;
  }

  private async resolveAccount(igId: string): Promise<Account | null> {
    const account = await this.repos.accounts.getByIgId(igId);
    if (!account || !account.active) return null;
    return account;
  }

  private async handleComment(event: CommentEvent): Promise<void> {
    const account = await this.resolveAccount(event.accountId);
    if (!account) return;
    const age = this.clock.now() - event.timestamp;
    if (age < -300_000 || age > this.eventWindowMs(event)) return;
    const api = this.getApi(account);

    const automations = (
      await this.repos.automations.listEnabledForAccount(account.id)
    ).filter(
      (a): a is Automation & { trigger: { kind: "comment" } } =>
        a.trigger.kind === "comment",
    );

    for (const automation of automations) {
      const t = automation.trigger;
      if (event.isLive && !t.includeLive) continue;
      if (
        t.mediaIds.length > 0 &&
        (!event.mediaId || !t.mediaIds.includes(event.mediaId))
      )
        continue;
      if (!matchKeyword(event.text, t.keyword)) continue;

      this.logger.info("Comment automation matched", {
        automationId: automation.id,
        commentId: event.commentId,
      });
      this.stat("triggered", account.id, automation.id);
      const contact = event.from
        ? await this.ensureContact(account.id, event.from.id, {
            username: event.from.username,
          })
        : null;

      const action = automation.commentAction ?? {
        privateReply: true,
        hideComment: false,
      };

      if (action.publicReply) {
        await api
          .replyToComment(event.commentId, action.publicReply)
          .catch((err) =>
            this.logger.warn("public reply failed", { error: String(err) }),
          );
      }

      if (action.privateReply !== false) {
        const delivery: Delivery = new PrivateReplyDelivery(
          api,
          event.commentId,
        );
        await this.fireAutomation(
          account,
          contact?.id ?? "",
          contact?.igsid ?? "",
          automation,
          delivery,
          api,
        );
      }

      if (action.hideComment) {
        await api
          .setCommentHidden(event.commentId, true)
          .catch((err) =>
            this.logger.warn("hide comment failed", { error: String(err) }),
          );
      }

      return; // first matching automation wins
    }
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    if (event.isEcho) return; // ignore our own outbound messages
    const account = await this.resolveAccount(event.accountId);
    if (!account) return;
    const age = this.clock.now() - event.timestamp;
    if (age < -300_000 || age > this.eventWindowMs(event)) return;
    const api = this.getApi(account);

    const contact = await this.ensureContact(account.id, event.senderId, {
      lastInboundAt: event.timestamp,
    });

    // The follow-gate "I followed" button re-checks the follow relationship and delivers the reward.
    if (event.quickReplyPayload?.startsWith(FOLLOW_GATE_PAYLOAD_PREFIX)) {
      return this.handleFollowGateClick(
        account,
        contact,
        api,
        event.quickReplyPayload.slice(FOLLOW_GATE_PAYLOAD_PREFIX.length),
      );
    }

    const enabled = await this.repos.automations.listEnabledForAccount(
      account.id,
    );

    // A quick-reply payload behaves like a postback.
    if (event.quickReplyPayload) {
      const match = enabled.find(
        (a) =>
          a.trigger.kind === "postback" &&
          a.trigger.payload === event.quickReplyPayload,
      );
      if (match) return this.runDirect(account, contact, match, api);
    }

    // Story mention: the user tagged the business in their story.
    if (event.storyMention) {
      const m = enabled.find((a) => a.trigger.kind === "story_mention");
      if (m) return this.runDirect(account, contact, m, api);
      return;
    }

    // Story reply: the user replied to the business's story (keyword-matched).
    if (event.storyReply) {
      const sr = enabled.find(
        (a) =>
          a.trigger.kind === "story_reply" &&
          matchKeyword(event.text ?? "", a.trigger.keyword),
      );
      if (sr) return this.runDirect(account, contact, sr, api);
      const fb = enabled.find((a) => a.trigger.kind === "default_reply");
      if (fb) return this.runDirect(account, contact, fb, api);
      return;
    }

    const text = event.text ?? "";
    const byKeyword = enabled.find(
      (a) =>
        a.trigger.kind === "dm_keyword" &&
        matchKeyword(text, a.trigger.keyword),
    );
    if (byKeyword) return this.runDirect(account, contact, byKeyword, api);

    const fallback = enabled.find((a) => a.trigger.kind === "default_reply");
    if (fallback) return this.runDirect(account, contact, fallback, api);
  }

  private async handlePostback(event: PostbackEvent): Promise<void> {
    const account = await this.resolveAccount(event.accountId);
    if (!account) return;
    const age = this.clock.now() - event.timestamp;
    if (age < -300_000 || age > this.eventWindowMs(event)) return;
    const api = this.getApi(account);
    const contact = await this.ensureContact(account.id, event.senderId, {
      lastInboundAt: event.timestamp,
    });

    if (event.payload.startsWith(FOLLOW_GATE_PAYLOAD_PREFIX)) {
      return this.handleFollowGateClick(
        account,
        contact,
        api,
        event.payload.slice(FOLLOW_GATE_PAYLOAD_PREFIX.length),
      );
    }

    const enabled = await this.repos.automations.listEnabledForAccount(
      account.id,
    );
    const match = enabled.find(
      (a) =>
        a.trigger.kind === "postback" && a.trigger.payload === event.payload,
    );
    if (match) return this.runDirect(account, contact, match, api);
  }

  private async runDirect(
    account: Account,
    contact: Contact,
    automation: Automation,
    api: InstagramApi,
  ): Promise<void> {
    this.logger.info("DM automation matched", {
      automationId: automation.id,
      contactId: contact.id,
    });
    this.stat("triggered", account.id, automation.id);
    await this.fireAutomation(
      account,
      contact.id,
      contact.igsid,
      automation,
      new DirectDelivery(api, contact.igsid),
      api,
    );
  }

  /** Deliver an automation: send the follow-gate prompt (if enabled) or run the reward flow. */
  private async fireAutomation(
    account: Account,
    contactId: string,
    contactIgsid: string,
    automation: Automation,
    delivery: Delivery,
    api: InstagramApi,
  ): Promise<void> {
    if (automation.followGate?.enabled) {
      if (delivery.canSend()) {
        await delivery.send(
          this.followGatePromptContent(
            automation,
            automation.followGate.promptMessage,
          ),
        );
        this.logger.info("Follow-gate prompt sent", {
          automationId: automation.id,
        });
        this.stat("follow_gate_prompt", account.id, automation.id);
      }
      return;
    }
    const flow = await this.repos.flows.getById(account.id, automation.flowId);
    if (!flow) {
      this.logger.warn("Automation flow missing", {
        flowId: automation.flowId,
      });
      return;
    }
    const result = await runFlow(
      flow,
      this.flowCtx(account, contactId, contactIgsid, delivery, api),
    );
    if (result.sent > 0)
      this.stat("sent", account.id, automation.id, result.sent);
  }

  /**
   * Handle the "I followed" button tap: the tap opened a conversation, so we can now query the
   * follow relationship and (if following) send the reward as a normal DM within the 24h window.
   */
  private async handleFollowGateClick(
    account: Account,
    contact: Contact,
    api: InstagramApi,
    automationId: string,
  ): Promise<void> {
    const automation = await this.repos.automations.getById(automationId);
    if (
      !automation ||
      automation.accountId !== account.id ||
      !automation.enabled ||
      !automation.followGate?.enabled
    )
      return;

    let isFollower = false;
    try {
      const profile = await api.getUserProfile(contact.igsid);
      isFollower = profile.is_user_follow_business === true;
    } catch (err) {
      this.logger.warn("follow-gate profile lookup failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const delivery = new DirectDelivery(api, contact.igsid);
    if (isFollower) {
      this.logger.info("Follow-gate passed; delivering reward", {
        automationId,
      });
      this.stat("follow_gate_pass", account.id, automationId);
      const flow = await this.repos.flows.getById(
        account.id,
        automation.flowId,
      );
      if (flow) {
        const result = await runFlow(
          flow,
          this.flowCtx(account, contact.id, contact.igsid, delivery, api),
        );
        if (result.sent > 0)
          this.stat("sent", account.id, automationId, result.sent);
      }
    } else {
      await delivery.send(
        this.followGatePromptContent(
          automation,
          automation.followGate.notFollowingMessage,
        ),
      );
    }
  }

  /** Build the follow-gate message: prompt text + a single "I followed" quick-reply button. */
  private followGatePromptContent(
    automation: Automation,
    text: string,
  ): MessageContent {
    const label = (automation.followGate?.buttonLabel ?? "فالو کردم ✅").slice(
      0,
      20,
    );
    return {
      type: "text",
      text,
      quickReplies: [
        {
          title: label,
          payload: `${FOLLOW_GATE_PAYLOAD_PREFIX}${automation.id}`,
        },
      ],
    };
  }

  private flowCtx(
    account: Account,
    contactId: string,
    contactIgsid: string,
    delivery: Delivery,
    api: InstagramApi,
  ): FlowRunContext {
    return {
      accountId: account.id,
      contactId,
      contactIgsid,
      delivery,
      api,
      contacts: this.repos.contacts,
      logger: this.logger,
      clock: this.clock,
    };
  }

  private async ensureContact(
    accountId: string,
    igsid: string,
    extras?: Partial<Pick<Contact, "username" | "name" | "lastInboundAt">>,
  ): Promise<Contact> {
    const existing = await this.repos.contacts.getByIgsid(accountId, igsid);
    if (existing) {
      if (extras?.lastInboundAt || extras?.username || extras?.name) {
        const updated: Contact = {
          ...existing,
          username: extras.username ?? existing.username,
          name: extras.name ?? existing.name,
          lastInboundAt: extras.lastInboundAt
            ? Math.max(extras.lastInboundAt, existing.lastInboundAt ?? 0)
            : existing.lastInboundAt,
        };
        await this.repos.contacts.upsert(updated);
        return updated;
      }
      return existing;
    }
    const contact: Contact = {
      id: this.idGen.newId(),
      accountId,
      igsid,
      username: extras?.username,
      name: extras?.name,
      tags: [],
      attributes: {},
      lastInboundAt: extras?.lastInboundAt,
      createdAt: this.clock.now(),
    };
    await this.repos.contacts.upsert(contact);
    return contact;
  }
}
