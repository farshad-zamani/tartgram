import type { NormalizedEvent } from "@app/shared";
import { describe, expect, it } from "vitest";
import { FanoutHub, type HubClient } from "../src/hub.js";

function fakeClient(accounts: string[]): HubClient & { sent: string[] } {
  const sent: string[] = [];
  return {
    id: Math.random().toString(36).slice(2),
    accounts: new Set(accounts),
    send: (data) => sent.push(data),
    isOpen: () => true,
    sent,
  };
}

function commentEvent(accountId: string, id: string): NormalizedEvent {
  return {
    type: "comment",
    accountId,
    timestamp: Date.now(),
    dedupeKey: `comment:${id}`,
    isLive: false,
    commentId: id,
    text: "hi",
  };
}

describe("FanoutHub", () => {
  it("delivers an event only to clients subscribed to its account", () => {
    const hub = new FanoutHub();
    const a = fakeClient(["acc_A"]);
    const b = fakeClient(["acc_B"]);
    hub.add(a);
    hub.add(b);

    const delivered = hub.broadcast(commentEvent("acc_A", "c1"));

    expect(delivered).toBe(1);
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(0);
    expect(JSON.parse(a.sent[0]!).event.commentId).toBe("c1");
  });

  it("delivers to multiple clients on the same account", () => {
    const hub = new FanoutHub();
    const a1 = fakeClient(["acc"]);
    const a2 = fakeClient(["acc"]);
    hub.add(a1);
    hub.add(a2);
    expect(hub.broadcast(commentEvent("acc", "c1"))).toBe(2);
  });

  it("supports dynamic subscription", () => {
    const hub = new FanoutHub();
    const c = fakeClient([]);
    hub.add(c);
    expect(hub.broadcast(commentEvent("acc", "c1"))).toBe(0);
    hub.subscribe(c, "acc");
    expect(hub.broadcast(commentEvent("acc", "c2"))).toBe(1);
  });

  it("stops delivering after a client is removed", () => {
    const hub = new FanoutHub();
    const c = fakeClient(["acc"]);
    hub.add(c);
    hub.remove(c);
    expect(hub.broadcast(commentEvent("acc", "c1"))).toBe(0);
    expect(hub.stats()).toEqual({ clients: 0, accounts: 0 });
  });
});
