import type { Flow, MessageContent } from "@app/shared";
import type {
  Clock,
  ContactRepository,
  InstagramApi,
  Logger,
} from "../ports.js";

/**
 * Abstracts *how* a flow's messages reach the user, so one flow definition works in two contexts:
 *  - `DirectDelivery`: an open DM conversation — every message is a normal send.
 *  - `PrivateReplyDelivery`: a reply to a comment — only the FIRST message may be sent (Meta allows
 *    a single private reply per comment); further sends are refused until the user replies.
 */
export interface Delivery {
  send(content: MessageContent): Promise<void>;
  /** True if another message can still be sent in this context. */
  canSend(): boolean;
}

export class DirectDelivery implements Delivery {
  constructor(
    private readonly api: InstagramApi,
    private readonly igsid: string,
    private readonly allowed: () => boolean = () => true,
  ) {}
  canSend(): boolean {
    return this.allowed();
  }
  async send(content: MessageContent): Promise<void> {
    if (!this.canSend()) throw new Error("The messaging window has closed.");
    await this.api.sendMessage(this.igsid, content);
  }
}

export class PrivateReplyDelivery implements Delivery {
  private used = false;
  constructor(
    private readonly api: InstagramApi,
    private readonly commentId: string,
    private readonly allowed: () => boolean = () => true,
  ) {}
  canSend(): boolean {
    return !this.used && this.allowed();
  }
  async send(content: MessageContent): Promise<void> {
    if (this.used) {
      throw new PrivateReplyExhaustedError();
    }
    if (!this.allowed())
      throw new Error("The private reply window has closed.");
    this.used = true;
    await this.api.sendPrivateReply(this.commentId, content);
  }
}

export class PrivateReplyExhaustedError extends Error {
  constructor() {
    super(
      "Only one private reply per comment is allowed; the user must reply before more messages.",
    );
    this.name = "PrivateReplyExhaustedError";
  }
}

export interface FlowRunContext {
  accountId: string;
  contactId: string;
  contactIgsid: string;
  delivery: Delivery;
  api: InstagramApi;
  contacts: ContactRepository;
  logger: Logger;
  clock: Clock;
}

/** Guard against a malformed (cyclic) flow definition. */
const MAX_STEPS = 100;

/**
 * Walk a flow from its start node, performing each node's effect. Returns the number of messages
 * actually sent. Stops cleanly when it runs out of nodes or the delivery can no longer send.
 */
export async function runFlow(
  flow: Flow,
  ctx: FlowRunContext,
): Promise<{ sent: number }> {
  const byId = new Map(flow.nodes.map((n) => [n.id, n] as const));
  let sent = 0;
  let currentId: string | undefined = flow.startNodeId;

  for (let steps = 0; currentId && steps < MAX_STEPS; steps++) {
    const node = byId.get(currentId);
    if (!node) {
      ctx.logger.warn("Flow node not found; stopping", {
        flowId: flow.id,
        nodeId: currentId,
      });
      break;
    }

    switch (node.kind) {
      case "send": {
        if (!ctx.delivery.canSend()) {
          ctx.logger.info("Delivery cannot send more messages; stopping flow", {
            flowId: flow.id,
          });
          return { sent };
        }
        await ctx.delivery.send(node.message);
        sent++;
        currentId = node.next;
        break;
      }
      case "delay": {
        // M1: delays are not persisted; a later milestone schedules continuation via a job queue.
        ctx.logger.debug("Skipping delay node (not scheduled in M1)", {
          seconds: node.seconds,
        });
        throw new Error(
          "Delay nodes require a durable scheduler and are not supported in this release.",
        );
      }
      case "tag": {
        if (node.add.length)
          await ctx.contacts.addTags(ctx.contactId, node.add);
        if (node.remove.length)
          await ctx.contacts.removeTags(ctx.contactId, node.remove);
        currentId = node.next;
        break;
      }
      case "follow_gate": {
        let isFollower = false;
        try {
          const profile = await ctx.api.getUserProfile(ctx.contactIgsid);
          isFollower = profile.is_user_follow_business === true;
        } catch (err) {
          ctx.logger.warn(
            "follow_gate profile lookup failed; treating as non-follower",
            {
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
        if (!isFollower && node.promptMessage && ctx.delivery.canSend()) {
          await ctx.delivery.send(node.promptMessage);
          sent++;
        }
        currentId = isFollower ? node.ifFollower : node.ifNotFollower;
        break;
      }
    }
  }

  return { sent };
}
