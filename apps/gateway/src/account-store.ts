import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { JsonFile } from "./storage.js";
export interface ConnectedAccount {
  igId: string;
  username: string;
  accessToken: string;
  expiresAt?: number;
  scopes: string[];
  connectedAt: number;
  loginMethod: "unified_login" | "instagram_login";
  tokenType: "business_system_user" | "instagram_user";
  connectionId: string;
  authorizationSubjectId: string;
  clientBusinessId?: string;
  configId?: string;
  subscriptionStatus: "active" | "failed";
  refreshAfter?: number;
  reconnectRequired?: boolean;
}
type StoredAccount = Omit<ConnectedAccount, "accessToken"> & {
  tokenCipher: string;
};
export class JsonAccountStore {
  private file: JsonFile<StoredAccount[]>;
  private key: Buffer;
  constructor(path: string, encryptionKey: string) {
    if (!/^[a-fA-F0-9]{64}$/.test(encryptionKey))
      throw new Error("A 32-byte encryption key is required.");
    this.key = Buffer.from(encryptionKey, "hex");
    this.file = new JsonFile(path, () => []);
  }
  private encrypt(token: string, id: string): string {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(id));
    const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }
  private decrypt(value: string, id: string): string {
    try {
      const data = Buffer.from(value, "base64"),
        cipher = createDecipheriv(
          "aes-256-gcm",
          this.key,
          data.subarray(0, 12),
        );
      cipher.setAAD(Buffer.from(id));
      cipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([
        cipher.update(data.subarray(28)),
        cipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error(
        "Account store authentication failed; verify the encryption key and backup.",
      );
    }
  }
  async load(): Promise<ConnectedAccount[]> {
    const rows = await this.file.read();
    if (!Array.isArray(rows)) throw new Error("Invalid account store.");
    return rows.map((row) => {
      if (!row.tokenCipher || "accessToken" in row)
        throw new Error(
          "Plaintext account store detected. Use the offline import command.",
        );
      const { tokenCipher, ...account } = row;
      return { ...account, accessToken: this.decrypt(tokenCipher, row.igId) };
    });
  }
  async upsert(account: ConnectedAccount): Promise<void> {
    const { accessToken, ...rest } = account;
    await this.file.update((rows) => {
      if (!Array.isArray(rows) || rows.some((r) => !r.tokenCipher))
        throw new Error("Invalid account store; restore or import it first.");
      const stored = {
          ...rest,
          tokenCipher: this.encrypt(accessToken, account.igId),
        },
        i = rows.findIndex((a) => a.igId === account.igId);
      if (i < 0) rows.push(stored);
      else rows[i] = stored;
    });
  }
  async remove(igId: string): Promise<boolean> {
    return this.file.update((rows) => {
      const i = rows.findIndex((a) => a.igId === igId);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    });
  }
  async invalidateToken(token: string): Promise<void> {
    await this.file.update((rows) => {
      for (const row of rows) {
        if (this.decrypt(row.tokenCipher, row.igId) === token)
          row.reconnectRequired = true;
      }
    });
  }
}
