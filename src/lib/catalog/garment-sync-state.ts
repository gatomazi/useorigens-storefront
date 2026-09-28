import "server-only";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import type { CommerceStoreKey } from "../geo/regions";
import type { GarmentTuple } from "./garment-index-file";

/**
 * The only durable state of the daily garment sync, both overwritten in place (never one file per run):
 *
 * - `garment-sync-state.json`: per store, the `begin_date` cursor of the last COMPLETED pass plus the summary of
 *   that pass. The cursor only moves after the index was promoted, so a failed run re-reads the same window.
 * - `garment-sync-checkpoint.json` (version 2): exists ONLY while a run was cut short, and holds what that run
 *   already fetched so the next one resumes instead of starting over. Deleted by the next successful pass.
 * - `garment-sync.lock`: exists ONLY while a run is active.
 */
export type GarmentRunMetrics = {
  /** INK GETs spent on the garment pass (retries included). */
  requests: number;
  retries: number;
  throttled: number;
  productsSeen: number;
  /** Pieces (non-classic siblings) that linked to a canonical cluster in this window, changed or not. */
  piecesLinked: number;
  productsChanged: number;
  clustersChanged: number;
  durationMs: number;
};

export type GarmentStoreState = {
  /** `begin_date` (YYYY-MM-DD) of the next pass, already including the safety overlap. */
  cursor: string;
  lastSuccessAt: string;
  lastRun: GarmentRunMetrics;
};

export type GarmentSyncState = {
  version: 1;
  stores: Partial<Record<CommerceStoreKey, GarmentStoreState>>;
};

export type PendingPiece = { cluster: string; tuple: GarmentTuple };

export type IncrementalStoreCheckpoint = {
  /** The window this partial pass was reading; a resume is only valid for the same window. */
  sinceCreatedAt: string;
  lastPageCompleted: number;
  maxCreatedAtSeen: string | null;
  /** Pieces already linked from the pages read so far. */
  pending: PendingPiece[];
  productsSeen: number;
  requests: number;
  retries: number;
  throttled: number;
  updatedAt: string;
};

export type IncrementalCheckpoint = {
  version: 2;
  stores: Partial<Record<CommerceStoreKey, IncrementalStoreCheckpoint>>;
};

const dir = () => catalogSnapshotDir();
export const garmentSyncStatePath = () => path.join(dir(), "garment-sync-state.json");
export const incrementalCheckpointPath = () => path.join(dir(), "garment-sync-checkpoint.json");
export const garmentSyncLockPath = () => path.join(dir(), "garment-sync.lock");

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2));
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

export async function readGarmentSyncState(): Promise<GarmentSyncState> {
  const parsed = (await readJson(garmentSyncStatePath())) as GarmentSyncState | null;
  return parsed && parsed.version === 1 && typeof parsed.stores === "object" && parsed.stores !== null ? parsed : { version: 1, stores: {} };
}

export async function writeGarmentSyncState(state: GarmentSyncState): Promise<void> {
  await writeJsonAtomic(garmentSyncStatePath(), state);
}

export async function readIncrementalCheckpoint(): Promise<IncrementalCheckpoint> {
  const parsed = (await readJson(incrementalCheckpointPath())) as IncrementalCheckpoint | null;
  // A version-1 file is the full-crawl checkpoint of `garments:sync`: not ours, never interpreted as a resume point.
  return parsed && parsed.version === 2 && typeof parsed.stores === "object" && parsed.stores !== null ? parsed : { version: 2, stores: {} };
}

/** Writes the checkpoint, or removes the file when no store has anything pending — a finished run leaves nothing behind. */
export async function writeIncrementalCheckpoint(checkpoint: IncrementalCheckpoint): Promise<void> {
  if (Object.keys(checkpoint.stores).length === 0) {
    await rm(incrementalCheckpointPath(), { force: true });
    return;
  }
  await writeJsonAtomic(incrementalCheckpointPath(), checkpoint);
}

/** A crashed process cannot release its lock; after this long the lock is considered dead and may be taken over. */
export const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

export type GarmentSyncLock = { release: () => Promise<void> };

/** Exclusive-create lock file on the Volume: null when another run holds it. */
export async function acquireGarmentSyncLock(now: () => number = Date.now): Promise<GarmentSyncLock | null> {
  const file = garmentSyncLockPath();
  await mkdir(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(file, JSON.stringify({ pid: process.pid, startedAt: new Date(now()).toISOString() }), { flag: "wx" });
      return { release: () => unlink(file).catch(() => undefined) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const held = (await readJson(file)) as { startedAt?: string } | null;
      const startedMs = held?.startedAt ? Date.parse(held.startedAt) : NaN;
      if (Number.isFinite(startedMs) && now() - startedMs < LOCK_STALE_MS) return null;
      await rm(file, { force: true }); // dead or unreadable lock
    }
  }
  return null;
}
