import { describe, expect, it, vi } from "vitest";
import {
  DirectDelivery,
  PrivateReplyDelivery,
} from "../src/automation/flow-runner.js";
import type { InstagramApi } from "../src/ports.js";
const message = { type: "text" as const, text: "Example", quickReplies: [] };
describe("delivery window checks", () => {
  it("rechecks the window before every direct send", async () => {
    let allowed = true;
    const api = { sendMessage: vi.fn() };
    const delivery = new DirectDelivery(
      api as unknown as InstagramApi,
      "person",
      () => allowed,
    );
    await delivery.send(message);
    allowed = false;
    expect(delivery.canSend()).toBe(false);
    await expect(delivery.send(message)).rejects.toThrow("window has closed");
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });
  it("does not send a private reply after its deadline", async () => {
    const api = { sendPrivateReply: vi.fn() };
    const delivery = new PrivateReplyDelivery(
      api as unknown as InstagramApi,
      "comment",
      () => false,
    );
    expect(delivery.canSend()).toBe(false);
    await expect(delivery.send(message)).rejects.toThrow("window has closed");
    expect(api.sendPrivateReply).not.toHaveBeenCalled();
  });
});
