import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import type { CatalogSnapshot } from "./types";

/**
 * Resolved fresh on every call (not a module-level constant): `catalogSnapshotDir()` reads
 * `CATALOG_SNAPSHOT_DIR` at call time, so this always reflects the current environment rather than whatever
 * was set the first time this module happened to load.
 */
export function snapshotPath(): string {
  return path.join(catalogSnapshotDir(), "catalog-snapshot.json");
}

export const EMPTY_SNAPSHOT: CatalogSnapshot = { version: 1, stores: {} };

function isSnapshot(value: unknown): value is CatalogSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as CatalogSnapshot).version === 1 &&
    typeof (value as CatalogSnapshot).stores === "object"
  );
}

export async function readSnapshot(): Promise<CatalogSnapshot> {
  try {
    const parsed: unknown = JSON.parse(await readFile(snapshotPath(), "utf8"));
    return isSnapshot(parsed) ? parsed : EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export function snapshotMtimeMs(): number {
  try {
    return statSync(snapshotPath()).mtimeMs;
  } catch {
    return 0;
  }
}

/** Synchronous variant + mtime, used by the repository cache. `filePath` is only ever overridden by tests. */
export function readSnapshotSync(filePath: string = snapshotPath()): { snapshot: CatalogSnapshot; mtimeMs: number } {
  try {
    const mtimeMs = statSync(filePath).mtimeMs;
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return { snapshot: isSnapshot(parsed) ? parsed : EMPTY_SNAPSHOT, mtimeMs };
  } catch {
    return { snapshot: EMPTY_SNAPSHOT, mtimeMs: 0 };
  }
}

export class SnapshotWriteError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "SnapshotWriteError";
  }
}

/**
 * Atomic write: a reader never sees a half-written snapshot (write to a temp file, then rename). Errors are
 * rewrapped with the resolved path and a plain-language hint, since the raw Node error (e.g. `EACCES`,
 * `EROFS`, `ENOSPC`) is easy to miss in a deploy log otherwise — this is exactly the "Volume not mounted or
 * not writable" failure mode the bootstrap review asked to surface clearly.
 */
export async function writeSnapshot(snapshot: CatalogSnapshot, filePath: string = snapshotPath()): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(snapshot));
    await rename(tmp, filePath);
  } catch (err) {
    throw new SnapshotWriteError(`could not write snapshot to ${filePath} (directory ${dir}) — is the volume mounted and writable?`, err);
  }
}

export type SnapshotStatus = {
  /** File exists and parses as a snapshot (even if it holds zero stores). */
  present: boolean;
  /** Milliseconds since the file was last written, or null when `present` is false. */
  ageMs: number | null;
  /** Per-store product count and its own sync timestamp, straight from the file — nothing recomputed. */
  stores: { storeKey: string; productCount: number; syncedAt: string }[];
  /** Sum of every store's productCount. Zero when `present` is false or every store is empty. */
  totalProducts: number;
  /** The resolved absolute path checked — logged/returned so the real mount path is observable, never assumed. */
  path: string;
};

/**
 * Cheap, local-only status for health checks and startup logging (§5/§8 of the infra command): never touches
 * INK or IBGE, just the already-read snapshot file. `present: false` is the exact "never synced yet" case
 * that used to disappear silently into `EMPTY_SNAPSHOT` — now it is something a caller can act on.
 * `filePath` is only ever overridden by tests.
 */
export function snapshotStatus(filePath: string = snapshotPath()): SnapshotStatus {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch {
    return { present: false, ageMs: null, stores: [], totalProducts: 0, path: filePath };
  }
  const { snapshot } = readSnapshotSync(filePath);
  const stores = Object.entries(snapshot.stores).map(([storeKey, index]) => ({
    storeKey,
    productCount: index?.productCount ?? 0,
    syncedAt: index?.syncedAt ?? "",
  }));
  return {
    present: true,
    // Clamp to 0: filesystem mtime rounding can put it a fraction of a ms ahead of Date.now() right after a write.
    ageMs: Math.max(0, Date.now() - mtimeMs),
    stores,
    totalProducts: stores.reduce((sum, s) => sum + s.productCount, 0),
    path: filePath,
  };
}
