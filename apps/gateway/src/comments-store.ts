import { JsonFile } from "./storage.js";
export interface StoredComment {
  id: string;
  accountId: string;
  mediaId?: string;
  parentId?: string;
  text: string;
  fromId?: string;
  fromUsername?: string;
  timestamp: number;
  status: "open" | "hidden" | "deleted" | "replied";
}
export class JsonCommentStore {
  private db: JsonFile<StoredComment[]>;
  constructor(
    file?: string,
    private readonly cap = 500,
  ) {
    this.db = new JsonFile(file, () => []);
  }
  async add(comment: StoredComment): Promise<void> {
    await this.db.update((rows) => {
      if (
        !rows.some(
          (c) => c.id === comment.id && c.accountId === comment.accountId,
        )
      )
        rows.unshift(comment);
      if (rows.length > this.cap) rows.length = this.cap;
    });
  }
  async list(accountId: string, limit = 200): Promise<StoredComment[]> {
    return (await this.db.read())
      .filter((c) => c.accountId === accountId)
      .slice(0, limit);
  }
  async update(id: string, patch: Partial<StoredComment>): Promise<void> {
    await this.db.update((rows) => {
      const c = rows.find((c) => c.id === id);
      if (c) Object.assign(c, patch);
    });
  }
  async removeAccount(accountId: string): Promise<void> {
    await this.db.update((rows) => {
      for (let i = rows.length - 1; i >= 0; i--)
        if (rows[i]!.accountId === accountId) rows.splice(i, 1);
    });
  }
}
