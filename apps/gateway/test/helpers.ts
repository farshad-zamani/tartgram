import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, type GatewayConfig } from "../src/config.js";
import {
  JsonAccountStore,
  type ConnectedAccount,
} from "../src/account-store.js";
export function testConfig(
  overrides: Partial<GatewayConfig> = {},
): GatewayConfig {
  const data = mkdtempSync(join(tmpdir(), "tartgram-test-"));
  const base = loadConfig({
    DATA_DIR: data,
    PUBLIC_URL: "https://tartgram.example.com",
    GATEWAY_CLIENT_TOKEN: "test-admin-token-".repeat(3),
    META_VERIFY_TOKEN: "test-verify-token-".repeat(3),
    TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
    OPERATOR_NAME: "Example Studio",
    OPERATOR_CONTACT_URL: "https://example.com/contact",
    LOG_LEVEL: "silent",
  });
  const { accountsFile, automationsFile, spaDir, ...rest } = overrides;
  return {
    ...base,
    ...rest,
    accountsFile: base.accountsFile,
    automationsFile: base.automationsFile,
    spaDir: join(data, "no-spa"),
  };
}
export function sampleAccount(
  id = "IG1",
  overrides: Partial<ConnectedAccount> = {},
): ConnectedAccount {
  return {
    igId: id,
    username: "shop",
    accessToken: "test-meta-access-token",
    scopes: [
      "instagram_basic",
      "instagram_manage_messages",
      "instagram_manage_comments",
      "instagram_content_publish",
    ],
    connectedAt: Date.now(),
    connectionId: "test-connection",
    authorizationSubjectId: "subject-1",
    clientBusinessId: "business-1",
    loginMethod: "unified_login",
    tokenType: "business_system_user",
    subscriptionStatus: "active",
    ...overrides,
  };
}
export async function seedAccount(
  c: GatewayConfig,
  id = "IG1",
  overrides: Partial<ConnectedAccount> = {},
) {
  await new JsonAccountStore(c.accountsFile, c.tokenEncryptionKey).upsert(
    sampleAccount(id, overrides),
  );
}
