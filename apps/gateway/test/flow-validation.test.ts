import { describe, expect, it } from "vitest";
import type { Flow, FlowNode } from "@app/shared";
import { validFlow } from "../src/flow-validation.js";
const node = (id: string, next?: string): FlowNode => ({
  kind: "send",
  id,
  next,
  message: { type: "text", text: "Example", quickReplies: [] },
});
const flow = (nodes: FlowNode[], startNodeId = "first"): Flow => ({
  id: "flow",
  name: "Example",
  nodes,
  startNodeId,
});
describe("flow validation", () => {
  it("accepts a finite graph with converging branches", () =>
    expect(
      validFlow(
        flow([
          {
            kind: "follow_gate",
            id: "first",
            ifFollower: "last",
            ifNotFollower: "last",
          },
          node("last"),
        ]),
      ),
    ).toBe(true));
  it.each([
    flow([]),
    flow([node("first", "missing")]),
    flow([node("first", "first")]),
    flow([node("first", "second"), node("second", "first")]),
    flow([node("first"), node("first")]),
    flow([node("first")], "missing"),
    flow([{ kind: "follow_gate", id: "first", ifFollower: "missing" }]),
    flow([{ kind: "delay", id: "first", seconds: 1 }]),
    flow(
      Array.from({ length: 101 }, (_, i) =>
        node(i === 0 ? "first" : String(i)),
      ),
    ),
  ])("rejects invalid or unsupported flow graphs: %j", (value) =>
    expect(validFlow(value)).toBe(false),
  );
});
