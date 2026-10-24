import type {
  AccountInfo,
  AutomationsFile,
  Caption,
  Contact,
  Conversation,
  IceBreaker,
  InboxMessage,
  MediaItem,
  PostType,
  PublishLimit,
  ScheduledPost,
  Stats,
  Status,
  StoredComment,
} from "./types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401)
      window.dispatchEvent(new Event("tartgram:unauthorized"));
    const fa = document.documentElement.lang === "fa";
    throw new ApiError(
      res.status === 401
        ? fa
          ? "نشست پایان یافته است؛ دوباره وارد شوید."
          : "Your session expired. Sign in again."
        : fa
          ? `درخواست ناموفق بود (${res.status}). تنظیمات و مجوز حساب را بررسی کنید.`
          : `Request failed (${res.status}). Check account setup and permissions.`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export async function uploadMedia(
  igId: string,
  file: File,
): Promise<{ url: string; mime: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/accounts/${encodeURIComponent(igId)}/upload`, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  if (!res.ok)
    throw new ApiError(
      res.status === 413 ? "فایل بیش از حد بزرگ است" : "آپلود ناموفق بود",
      res.status,
    );
  return (await res.json()) as { url: string; mime: string };
}

export const api = {
  login: (token: string) =>
    req<{ ok: boolean }>("/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  session: () => req<{ ok: boolean }>("/api/auth/session"),
  logout: () => req<{ ok: boolean }>("/api/auth/session", { method: "DELETE" }),
  disconnect: (id: string) =>
    req<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  status: () => req<Status>("/api/status"),
  saveDefaultAccount: (defaultAccountId: string) =>
    req<{ ok: boolean }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ defaultAccountId }),
    }),
  stats: () => req<Stats>("/api/stats"),
  contacts: (igId: string) =>
    req<Contact[]>(`/api/accounts/${encodeURIComponent(igId)}/contacts`),
  broadcast: (igId: string, text: string) =>
    req<{ ok: boolean; eligible: number; sent: number }>(
      `/api/accounts/${encodeURIComponent(igId)}/broadcast`,
      {
        method: "POST",
        body: JSON.stringify({ text }),
      },
    ),
  accounts: () => req<AccountInfo[]>("/api/accounts"),
  media: (igId: string) =>
    req<MediaItem[]>(`/api/accounts/${encodeURIComponent(igId)}/media`),
  comments: (igId: string) =>
    req<StoredComment[]>(`/api/accounts/${encodeURIComponent(igId)}/comments`),
  replyComment: (igId: string, commentId: string, text: string) =>
    req<{ ok: boolean }>(
      `/api/accounts/${encodeURIComponent(igId)}/comments/${encodeURIComponent(commentId)}/reply`,
      {
        method: "POST",
        body: JSON.stringify({ text }),
      },
    ),
  hideComment: (igId: string, commentId: string, hide: boolean) =>
    req<{ ok: boolean }>(
      `/api/accounts/${encodeURIComponent(igId)}/comments/${encodeURIComponent(commentId)}/hide`,
      {
        method: "POST",
        body: JSON.stringify({ hide }),
      },
    ),
  deleteComment: (igId: string, commentId: string) =>
    req<{ ok: boolean }>(
      `/api/accounts/${encodeURIComponent(igId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "DELETE",
      },
    ),
  conversations: (igId: string) =>
    req<Conversation[]>(
      `/api/accounts/${encodeURIComponent(igId)}/conversations`,
    ),
  conversationMessages: (igId: string, convId: string) =>
    req<InboxMessage[]>(
      `/api/accounts/${encodeURIComponent(igId)}/conversations/${encodeURIComponent(convId)}/messages`,
    ),
  sendDm: (
    igId: string,
    recipientId: string,
    text: string,
    humanAgent?: boolean,
  ) =>
    req<{ ok: boolean; messageId?: string }>(
      `/api/accounts/${encodeURIComponent(igId)}/send`,
      {
        method: "POST",
        body: JSON.stringify({ recipientId, text, humanAgent }),
      },
    ),
  publishLimit: (igId: string) =>
    req<PublishLimit>(
      `/api/accounts/${encodeURIComponent(igId)}/publish-limit`,
    ),
  scheduled: (igId: string) =>
    req<ScheduledPost[]>(`/api/accounts/${encodeURIComponent(igId)}/scheduled`),
  deleteScheduled: (igId: string, id: string) =>
    req<{ ok: boolean }>(
      `/api/accounts/${encodeURIComponent(igId)}/scheduled/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  publish: (
    igId: string,
    body: {
      type: PostType;
      url: string;
      caption?: string;
      scheduleAt?: number;
    },
  ) =>
    req<{
      published?: boolean;
      warnings?: string[];
      mediaId?: string;
      scheduled?: boolean;
      post?: ScheduledPost;
    }>(`/api/accounts/${encodeURIComponent(igId)}/publish`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  captionsList: () => req<Caption[]>("/api/captions"),
  saveCaptions: (list: Caption[]) =>
    req<{ ok: boolean }>("/api/captions", {
      method: "PUT",
      body: JSON.stringify(list),
    }),
  iceBreakers: (igId: string) =>
    req<IceBreaker[]>(`/api/accounts/${encodeURIComponent(igId)}/ice-breakers`),
  putIceBreakers: (igId: string, items: IceBreaker[]) =>
    req<{ ok: boolean; items: IceBreaker[] }>(
      `/api/accounts/${encodeURIComponent(igId)}/ice-breakers`,
      {
        method: "PUT",
        body: JSON.stringify(items),
      },
    ),
  getAutomations: () => req<AutomationsFile>("/api/automations"),
  putAutomations: (data: AutomationsFile) =>
    req<{ ok: boolean; automationsCount: number }>("/api/automations", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
