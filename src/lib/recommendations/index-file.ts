import "server-only";
import { copyFile, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import type { CommerceStoreKey } from "../geo/regions";
import { RECOMMENDATIONS_VERSION, validateRecommendationsText, type IndexValidation, type RecommendationsIndex } from "./build";

/**
 * `recommendations-index.json` lives next to the catalog snapshot (the Railway Volume). It is OPTIONAL: missing, corrupt or of another
 * version means "no recommendations" (every product page stays exactly as INK draws it), never an error.
 */
export const recommendationsIndexPath = (): string => path.join(catalogSnapshotDir(), "recommendations-index.json");

let cache: { file: string; mtimeMs: number; index: RecommendationsIndex | null } | null = null;

/** Cached by mtime: an unchanged file costs one `stat` per request; a rebuilt one is picked up on the next request. */
export function readRecommendationsIndex(file: string = recommendationsIndexPath()): RecommendationsIndex | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    cache = null;
    return null;
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.index;
  let index: RecommendationsIndex | null = null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as RecommendationsIndex;
    index = parsed && parsed.version === RECOMMENDATIONS_VERSION && parsed.stores && Array.isArray(parsed.reasons) ? parsed : null;
  } catch {
    index = null;
  }
  if (!index) console.warn(JSON.stringify({ event: "recommendations.index-unusable", file: path.basename(file) }));
  cache = { file, mtimeMs, index };
  return index;
}

export class RecommendationsPromotionError extends Error {
  constructor(
    message: string,
    readonly errors: string[] = [],
  ) {
    super(message);
    this.name = "RecommendationsPromotionError";
  }
}

export type PromoteResult = { validation: Extract<IndexValidation, { ok: true }>; target: string; previous: string | null };

/**
 * MD §14: atomic write with validation BEFORE promotion and the previous index kept as fallback. The candidate is written to a temp
 * file in the SAME directory (so the rename is atomic), validated from disk, then the live file is copied to `<target>.prev` and the
 * candidate renamed over it. Any failure leaves the live file byte-for-byte as it was (and removes the temp file).
 */
export async function writeAndPromote(text: string, options: { expectStores: readonly CommerceStoreKey[]; minListsPerStore?: number; target?: string }): Promise<PromoteResult> {
  const target = options.target ?? recommendationsIndexPath();
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  try {
    const validation = validateRecommendationsText(text, options);
    if (!validation.ok) throw new RecommendationsPromotionError("the candidate index failed validation; the live index was not touched", validation.errors);
    let previous: string | null = null;
    if (await stat(target).then(() => true, () => false)) {
      previous = `${target}.prev`;
      await copyFile(target, previous);
    }
    await rename(tmp, target);
    return { validation, target, previous };
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
