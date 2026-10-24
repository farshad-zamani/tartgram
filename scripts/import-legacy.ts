// Run only while the gateway is stopped. Inputs must remain outside the public tree.
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { JsonAccountStore } from "../apps/gateway/src/account-store.js";
const flag = (name: string) => process.argv[process.argv.indexOf(name) + 1];
async function main() {
  const input = flag("--input"),
    output = flag("--output"),
    mapping = flag("--subject-map"),
    key = process.env.TOKEN_ENCRYPTION_KEY;
  if (
    !process.argv.includes("--input") ||
    !process.argv.includes("--output") ||
    !process.argv.includes("--subject-map") ||
    !input ||
    !output ||
    !mapping ||
    !key
  )
    throw new Error(
      "Usage: node --env-file=.env --import tsx scripts/import-legacy.ts --input PRIVATE_FILE --output NEW_FILE --subject-map PRIVATE_JSON_MAP",
    );
  if (resolve(input) === resolve(output))
    throw new Error("The output must be a new file.");
  let exists = true;
  try {
    await access(output);
  } catch {
    exists = false;
  }
  if (exists) throw new Error("Output already exists; no data was changed.");
  const rows: unknown = JSON.parse(await readFile(input, "utf8")),
    subjects: Record<string, string> = JSON.parse(
      await readFile(mapping, "utf8"),
    );
  if (!Array.isArray(rows)) throw new Error("Expected a legacy account array.");
  const valid = rows.map((row) => {
    if (
      !row ||
      typeof row.igId !== "string" ||
      typeof row.username !== "string" ||
      typeof row.accessToken !== "string" ||
      !Array.isArray(row.scopes) ||
      !row.scopes.every((s: unknown) => typeof s === "string") ||
      typeof subjects[row.igId] !== "string" ||
      !subjects[row.igId]
    )
      throw new Error(
        "Invalid account or missing verified authorization-subject mapping. Reconnect instead of guessing an identifier.",
      );
    return {
      ...row,
      loginMethod: "instagram_login" as const,
      tokenType: "instagram_user" as const,
      connectionId: randomUUID(),
      authorizationSubjectId: subjects[row.igId]!,
      subscriptionStatus: "failed" as const,
      connectedAt:
        typeof row.connectedAt === "number" ? row.connectedAt : Date.now(),
    };
  });
  const store = new JsonAccountStore(output, key);
  for (const row of valid) await store.upsert(row);
  process.stdout.write(
    `Imported ${valid.length} account(s) into a new encrypted store. Reconnect each account to verify its webhook subscription.\n`,
  );
}
void main().catch((error) => {
  process.stderr.write(
    `${error instanceof SyntaxError ? "Invalid private JSON input; values are not printed." : error instanceof Error ? error.message : "Import failed"}\n`,
  );
  process.exitCode = 1;
});
