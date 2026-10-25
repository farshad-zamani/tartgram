import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
const locks = new Map<string, Promise<unknown>>();
export async function serialized<T>(
  path: string,
  action: () => Promise<T>,
): Promise<T> {
  const key = resolve(path),
    previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}
export async function readJson<T>(path: string, initial: () => T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return initial();
    throw new Error(
      "Stored data could not be read; restore a verified backup before retrying.",
    );
  }
}
export async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export class JsonFile<T> {
  private memory: T;
  private readonly memoryKey = `memory-store:${randomUUID()}`;
  constructor(
    readonly path: string | undefined,
    private readonly initial: () => T,
  ) {
    this.memory = initial();
  }
  async read(): Promise<T> {
    return this.path
      ? readJson(this.path, this.initial)
      : structuredClone(this.memory);
  }
  async update<R>(change: (value: T) => R | Promise<R>): Promise<R> {
    const operation = async () => {
      const value = await this.read();
      const result = await change(value);
      if (this.path) await atomicJson(this.path, value);
      else this.memory = value;
      return result;
    };
    return serialized(this.path ?? this.memoryKey, operation);
  }
  async replace(value: T): Promise<void> {
    const copy = structuredClone(value);
    await serialized(this.path ?? this.memoryKey, async () => {
      if (this.path) await atomicJson(this.path, copy);
      else this.memory = copy;
    });
  }
}
