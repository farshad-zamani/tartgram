import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonFile } from "../src/storage.js";
describe("serialized storage", () => {
  it("keeps all concurrent updates from separate store instances", async () => {
    const file = join(
      await mkdtemp(join(tmpdir(), "tartgram-storage-")),
      "values.json",
    );
    await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        new JsonFile<number[]>(file, () => []).update((rows) => {
          rows.push(i);
        }),
      ),
    );
    expect(
      new Set(JSON.parse(await readFile(file, "utf8")) as number[]).size,
    ).toBe(60);
  });
  it("preserves a corrupt store instead of overwriting it", async () => {
    const file = join(
      await mkdtemp(join(tmpdir(), "tartgram-storage-")),
      "values.json",
    );
    await writeFile(file, "{broken");
    await expect(
      new JsonFile<number[]>(file, () => []).update((rows) => rows.push(1)),
    ).rejects.toThrow("could not be read");
    expect(await readFile(file, "utf8")).toBe("{broken");
  });
  it("orders in-memory replacements after pending updates", async () => {
    const store = new JsonFile<number[]>(undefined, () => []);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const update = store.update(async (rows) => {
      await pending;
      rows.push(1);
    });
    const replacement = store.replace([2]);
    release();
    await Promise.all([update, replacement]);
    expect(await store.read()).toEqual([2]);
  });
  it("recovers its write queue after a failed update without persisting the failed change", async () => {
    const store = new JsonFile<number[]>(undefined, () => []);
    await expect(
      store.update((rows) => {
        rows.push(1);
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    await store.update((rows) => rows.push(2));
    expect(await store.read()).toEqual([2]);
  });
});
