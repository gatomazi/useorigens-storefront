import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { CatalogSnapshot } from "./types";

export const SNAPSHOT_PATH = path.join(process.cwd(), "data", "generated", "catalog-snapshot.json");

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
    const parsed: unknown = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
    return isSnapshot(parsed) ? parsed : EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export function snapshotMtimeMs(): number {
  try {
    return statSync(SNAPSHOT_PATH).mtimeMs;
  } catch {
    return 0;
  }
}

/** Synchronous variant + mtime, used by the repository cache. */
export function readSnapshotSync(): { snapshot: CatalogSnapshot; mtimeMs: number } {
  try {
    const mtimeMs = statSync(SNAPSHOT_PATH).mtimeMs;
    const parsed: unknown = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
    return { snapshot: isSnapshot(parsed) ? parsed : EMPTY_SNAPSHOT, mtimeMs };
  } catch {
    return { snapshot: EMPTY_SNAPSHOT, mtimeMs: 0 };
  }
}

/** Atomic write: a reader never sees a half-written snapshot. */
export async function writeSnapshot(snapshot: CatalogSnapshot): Promise<void> {
  await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  const tmp = `${SNAPSHOT_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot));
  await rename(tmp, SNAPSHOT_PATH);
}
