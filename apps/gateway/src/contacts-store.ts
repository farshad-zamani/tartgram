import type { ContactRepository } from "@app/core";
import type { Contact } from "@app/shared";
import { JsonFile } from "./storage.js";
export class JsonContactStore implements ContactRepository {
  private db: JsonFile<Contact[]>;
  constructor(file?: string) {
    this.db = new JsonFile(file, () => []);
  }
  async getByIgsid(accountId: string, igsid: string): Promise<Contact | null> {
    return (
      (await this.db.read()).find(
        (c) => c.accountId === accountId && c.igsid === igsid,
      ) ?? null
    );
  }
  async upsert(contact: Contact): Promise<void> {
    await this.db.update((rows) => {
      const i = rows.findIndex((c) => c.id === contact.id);
      if (i < 0) rows.push(contact);
      else rows[i] = contact;
    });
  }
  async addTags(id: string, tags: string[]): Promise<void> {
    await this.db.update((rows) => {
      const c = rows.find((c) => c.id === id);
      if (c) c.tags = [...new Set([...c.tags, ...tags])];
    });
  }
  async removeTags(id: string, tags: string[]): Promise<void> {
    await this.db.update((rows) => {
      const c = rows.find((c) => c.id === id);
      if (c) c.tags = c.tags.filter((t) => !tags.includes(t));
    });
  }
  async setAttribute(id: string, key: string, value: string): Promise<void> {
    await this.db.update((rows) => {
      const c = rows.find((c) => c.id === id);
      if (c) c.attributes = { ...c.attributes, [key]: value };
    });
  }
  async list(accountId: string): Promise<Contact[]> {
    return (await this.db.read())
      .filter((c) => c.accountId === accountId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  async removeAccount(accountId: string): Promise<void> {
    await this.db.update((rows) => {
      for (let i = rows.length - 1; i >= 0; i--)
        if (rows[i]!.accountId === accountId) rows.splice(i, 1);
    });
  }
}
