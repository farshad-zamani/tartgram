import type { Flow } from "@app/shared";

/** Reject graphs that would repeat sends, stop silently, or exceed the runtime step limit. */
export function validFlow(flow: Flow): boolean {
  if (!flow.id || flow.nodes.length === 0 || flow.nodes.length > 100)
    return false;
  const nodes = new Map(flow.nodes.map((n) => [n.id, n]));
  if (nodes.size !== flow.nodes.length || !nodes.has(flow.startNodeId))
    return false;
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return false;
    if (done.has(id)) return true;
    const node = nodes.get(id);
    if (!node || !id || node.kind === "delay") return false;
    visiting.add(id);
    const targets =
      node.kind === "follow_gate"
        ? [node.ifFollower, node.ifNotFollower]
        : [node.next];
    for (const target of targets)
      if (target !== undefined && !visit(target)) return false;
    visiting.delete(id);
    done.add(id);
    return true;
  }
  return flow.nodes.every((node) => visit(node.id));
}
