import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import type { CommerceStoreKey } from "../geo/regions";
import type { GarmentLinkStats } from "./garments-link";

export type GarmentSyncStoreCheckpoint = {
  storeKey: CommerceStoreKey;
  /** "complete" only once a crawl reached its own last page without being cut short — never set on a
   * truncated or failed run. Drives the "never claim full coverage that isn't proven" rule (MD §6/§8). */
  status: "in_progress" | "complete";
  mode: "full" | "incremental";
  /** 1-based; the next run resumes at `lastPageCompleted + 1` for the SAME `sinceCreatedAt`. */
  lastPageCompleted: number;
  /** INK's own `total_pages` as of the most recent page fetched — expected to grow slightly over time as
   * the store's catalog grows; a resumed run re-reads it from INK rather than trusting a stale value. */
  totalPages: number | null;
  /** `begin_date` used for this run, if any — null means this was (or is) a full unfiltered crawl. */
  sinceCreatedAt: string | null;
  /** Newest `created_at` observed so far — becomes the next run's `sinceCreatedAt` once `status` is "complete". */
  maxCreatedAtSeen: string | null;
  requestsUsedAllTime: number;
  /** Cumulative over the current pass (reset by a fresh full pass): why crawled products were not linked.
   * Absent on checkpoints written before this was tracked — never assume zero for those. */
  exclusions?: GarmentExclusionTotals;
  updatedAt: string;
};

export type GarmentExclusionTotals = GarmentLinkStats & {
  /** Dropped by field validation before linking (no https image/URL, missing id/name/slug). */
  rejectedByValidation: number;
};

export type GarmentSyncCheckpoint = {
  version: 1;
  stores: Partial<Record<CommerceStoreKey, GarmentSyncStoreCheckpoint>>;
};

export const EMPTY_GARMENT_CHECKPOINT: GarmentSyncCheckpoint = { version: 1, stores: {} };

function isCheckpoint(value: unknown): value is GarmentSyncCheckpoint {
  return typeof value === "object" && value !== null && (value as GarmentSyncCheckpoint).version === 1 && typeof (value as GarmentSyncCheckpoint).stores === "object";
}

export function garmentCheckpointPath(): string {
  return path.join(catalogSnapshotDir(), "garment-sync-checkpoint.json");
}

/** Always a fresh object on the "no file yet" path — never the shared `EMPTY_GARMENT_CHECKPOINT` singleton
 * reference, which a caller (`garment-sync-service.ts`) mutates in place (`checkpointDoc.stores[key] = ...`)
 * before writing it back out. Returning the singleton directly would let one caller's mutation leak into
 * every other caller in the same process that also hits this fallback (caught live by this round's own test
 * suite: a failed sync's checkpoint write was picking up an earlier successful run's leftover data). */
export async function readGarmentCheckpoint(filePath: string = garmentCheckpointPath()): Promise<GarmentSyncCheckpoint> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return isCheckpoint(parsed) ? parsed : { version: 1, stores: {} };
  } catch {
    return { version: 1, stores: {} };
  }
}

export class GarmentCheckpointWriteError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "GarmentCheckpointWriteError";
  }
}

/** Atomic write (temp file + rename), same pattern as `snapshot-file.ts#writeSnapshot` — a reader never sees
 * a half-written checkpoint, and an interrupted process leaves the previous good checkpoint intact. */
export async function writeGarmentCheckpoint(checkpoint: GarmentSyncCheckpoint, filePath: string = garmentCheckpointPath()): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(checkpoint, null, 2));
    await rename(tmp, filePath);
  } catch (err) {
    throw new GarmentCheckpointWriteError(`could not write garment sync checkpoint to ${filePath}`, err);
  }
}
