import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import type { Scope, ScopeDoc } from "../site-config/schema";

/**
 * Local (development) persistence for the CMS: plain JSON files under `data/admin-dev/` (gitignored), written atomically. It stands in
 * for the future Postgres repository behind narrow interfaces (`DraftRepository` here, the publish ports in sandbox-publish.ts), so the
 * screens never know where the data lives. NOTHING here can touch a production Volume: the directory is refused if it is, or is inside,
 * the catalog snapshot directory.
 */
export function adminDevDir(): string {
  const dir = process.env.ADMIN_DEV_DATA_DIR ?? path.join(process.cwd(), "data", "admin-dev");
  if (!path.isAbsolute(dir)) throw new Error("ADMIN_DEV_DATA_DIR must be an absolute path");
  // `normalize`, not `resolve`: both paths are already absolute, and `resolve` would make the bundler's file tracing pull in the whole project.
  const volume = path.normalize(catalogSnapshotDir());
  const resolved = path.normalize(dir);
  if (resolved === volume || resolved.startsWith(volume + path.sep)) throw new Error("the local CMS sandbox must not live inside the catalog snapshot directory (the production Volume location)");
  return resolved;
}

/** The directory the sandbox publishes into, and the storefront reads via SITE_CONFIG_DIR (see cms-local-usage.md). */
export const sandboxPublishedDir = (): string => path.join(adminDevDir(), "published");

/** Serialises read-modify-write cycles inside this (single) dev process. */
let chain: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** temp file + rename in the same directory: a reader never sees a half-written file. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

// ── Drafts ────────────────────────────────────────────────────────────────────────────────────────────────────

export type DraftRecord = { scope: Scope; rev: number; updatedAt: string; baseReleaseId: string | null; doc: ScopeDoc };

export type SaveResult = { ok: true; record: DraftRecord } | { ok: false; conflict: DraftRecord | null };

/** What the future Postgres repository implements (config_draft). `expectedRev: null` = "there must be no draft yet". */
export interface DraftRepository {
  load(scope: Scope): Promise<DraftRecord | null>;
  save(scope: Scope, doc: ScopeDoc, expectedRev: number | null, baseReleaseId: string | null): Promise<SaveResult>;
  discard(scope: Scope): Promise<void>;
}

export function fileDraftRepository(dir: string = adminDevDir()): DraftRepository {
  const file = (scope: Scope) => path.join(dir, "drafts", `${scope}.json`);
  return {
    load: (scope) => readJson<DraftRecord>(file(scope)),
    save: (scope, doc, expectedRev, baseReleaseId) =>
      withLock(async () => {
        const current = await readJson<DraftRecord>(file(scope));
        // Optimistic lock, same contract as `update … where scope = $1 and rev = $2`.
        if ((current?.rev ?? null) !== expectedRev) return { ok: false as const, conflict: current };
        const record: DraftRecord = { scope, rev: (current?.rev ?? 0) + 1, updatedAt: new Date().toISOString(), baseReleaseId, doc };
        await writeJsonAtomic(file(scope), record);
        return { ok: true as const, record };
      }),
    discard: (scope) =>
      withLock(async () => {
        const { rm } = await import("node:fs/promises");
        await rm(file(scope), { force: true });
      }),
  };
}
