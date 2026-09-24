import "server-only";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import type { CommerceStoreKey } from "../geo/regions";
import { EMPTY_COLLECTIONS, isCollectionsSnapshot, type CollectionRecord, type CollectionsSnapshot, type StoreCollections } from "./collections";

/** Next to the catalog snapshot, in its own file: the catalog format is untouched, and deleting this file restores today's behaviour. */
export function collectionsPath(): string {
  return path.join(catalogSnapshotDir(), "collections-snapshot.json");
}

/** Missing, unreadable or invalid file ⇒ "no collections" (never throws, never breaks a page). */
export function readCollectionsFile(filePath: string = collectionsPath()): { snapshot: CollectionsSnapshot; mtimeMs: number } {
  try {
    const mtimeMs = statSync(filePath).mtimeMs;
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return { snapshot: isCollectionsSnapshot(parsed) ? parsed : EMPTY_COLLECTIONS, mtimeMs };
  } catch {
    return { snapshot: EMPTY_COLLECTIONS, mtimeMs: 0 };
  }
}

/** Atomic (temp + rename) like the catalog snapshot: a reader never sees a half-written file. */
export async function writeCollectionsFile(snapshot: CollectionsSnapshot, filePath: string = collectionsPath()): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot));
  await rename(tmp, filePath);
}

let cache: { mtimeMs: number; filePath: string; snapshot: CollectionsSnapshot } | null = null;

/** Cached by mtime, like `getCatalog()`. */
export function getCollections(filePath: string = collectionsPath()): CollectionsSnapshot {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch {
    /* absent */
  }
  if (cache && cache.filePath === filePath && cache.mtimeMs === mtimeMs) return cache.snapshot;
  const { snapshot } = readCollectionsFile(filePath);
  cache = { mtimeMs, filePath, snapshot };
  return snapshot;
}

export function getStoreCollections(store: CommerceStoreKey, filePath?: string): StoreCollections | null {
  return getCollections(filePath).stores[store] ?? null;
}

export function findCollection(store: CommerceStoreKey, collectionId: number, filePath?: string): CollectionRecord | null {
  return getStoreCollections(store, filePath)?.collections.find((c) => c.id === collectionId) ?? null;
}
