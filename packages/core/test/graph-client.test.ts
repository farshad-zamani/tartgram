import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphClient } from "../src/graph/client.js";
import {
  GraphApiError,
  PublicationUncertainError,
} from "../src/graph/errors.js";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(() => vi.useRealTimers());
function client(fetcher: ReturnType<typeof vi.fn>) {
  return new GraphClient({
    igUserId: "123",
    baseUrl: "https://graph.facebook.com",
    getToken: async () => "synthetic-token",
    fetchImpl: fetcher as typeof fetch,
  });
}

describe("Graph API response contracts", () => {
  it("does not mistake a permission OAuthException for an expired token", () => {
    expect(
      new GraphApiError({
        message: "permission",
        httpStatus: 403,
        code: 10,
        type: "OAuthException",
      }).isTokenExpired,
    ).toBe(false);
  });
  it.each(["<html>unavailable</html>", "", "null", "[]", '"ok"'])(
    "rejects invalid success bodies: %s",
    async (body) => {
      await expect(
        client(vi.fn().mockResolvedValue(new Response(body))).getRecentMedia(),
      ).rejects.toThrow(GraphApiError);
    },
  );
  it.each([
    "getRecentMedia",
    "getConversations",
    "getContentPublishingLimit",
    "getIceBreakers",
  ] as const)(
    "does not turn missing data into an empty %s list",
    async (method) => {
      await expect(
        client(vi.fn().mockResolvedValue(response({})))[method](),
      ).rejects.toThrow("incomplete");
    },
  );
  it("requires the message receipt before reporting a send as successful", async () => {
    await expect(
      client(vi.fn().mockResolvedValue(response({}))).sendMessage("person", {
        type: "text",
        text: "hello",
        quickReplies: [],
      }),
    ).rejects.toThrow("incomplete");
  });
  it("redacts transport exception details", async () => {
    const c = client(
      vi.fn().mockRejectedValue(new Error("synthetic-token in URL")),
    );
    await expect(c.getRecentMedia()).rejects.toThrow("connection failed");
    await expect(c.getRecentMedia()).rejects.not.toThrow("synthetic-token");
  });
  it("handles structured errors even when Meta returns HTTP 200", async () => {
    const invalidate = vi.fn(),
      c = new GraphClient({
        igUserId: "123",
        getToken: async () => "synthetic-token",
        onInvalidToken: invalidate,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(
            response({ error: { code: 190, message: "secret detail" } }),
          ),
      });
    await expect(c.getRecentMedia()).rejects.toMatchObject({ code: 190 });
    expect(invalidate).toHaveBeenCalledWith("synthetic-token");
  });
  it.each([502, 503, 504])(
    "treats HTTP %s at final publication as uncertain",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(response({ error: { code: 2 } }, status));
      await expect(
        client(fetcher).publishMedia("container"),
      ).rejects.toMatchObject({
        name: "PublicationUncertainError",
        containerId: "container",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([{}, { success: true }])(
    "treats missing publication IDs as uncertain",
    async (body) => {
      await expect(
        client(vi.fn().mockResolvedValue(response(body))).publishMedia(
          "container",
        ),
      ).rejects.toThrow(PublicationUncertainError);
    },
  );
  it("treats a dropped final response as uncertain without automatically retrying", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("network"));
    await expect(client(fetcher).publishMedia("container")).rejects.toThrow(
      PublicationUncertainError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves an explicit permission rejection as a definite failure", async () => {
    await expect(
      client(
        vi.fn().mockResolvedValue(response({ error: { code: 10 } }, 403)),
      ).publishMedia("container"),
    ).rejects.toMatchObject({ name: "GraphApiError", httpStatus: 403 });
  });
  it("sends story captions through the official container endpoint", async () => {
    const fetcher = vi.fn(async (input: URL) => {
      if (input.pathname.endsWith("/media")) {
        expect(input.searchParams.get("caption")).toBe("Example caption");
        expect(input.searchParams.get("media_type")).toBe("STORIES");
        return response({ id: "container" });
      }
      return input.pathname.endsWith("/media_publish")
        ? response({ id: "post" })
        : response({ status_code: "FINISHED" });
    });
    expect(
      await client(fetcher).publishStory(
        "https://example.com/photo.jpg",
        false,
        "Example caption",
      ),
    ).toBe("post");
  });
  it("does not publish an error container", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ id: "container" }))
      .mockResolvedValueOnce(response({ status_code: "ERROR" }));
    await expect(
      client(fetcher).publishImage("https://example.com/a.jpg"),
    ).rejects.toThrow("Container ERROR");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("polls processing containers once per minute before publishing", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ id: "container" }))
      .mockResolvedValueOnce(response({ status_code: "IN_PROGRESS" }))
      .mockResolvedValueOnce(response({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(response({ id: "published" }));
    const pending = client(fetcher).publishReel("https://example.com/a.mp4");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("published");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
