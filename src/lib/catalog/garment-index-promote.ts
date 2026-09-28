import "server-only";
import { createHash } from "node:crypto";
import { copyFile, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import type { CommerceStoreKey } from "../geo/regions";
import { expandTuple, garmentIndexPath } from "./garment-index-file";

const KNOWN_STORES: readonly CommerceStoreKey[] = ["use-sul", "use-norte", "use-centro"];
const MAX_BYTES = 200 * 1024 * 1024;

export type IndexValidation =
  | { ok: true; bytes: number; sha256: string; stores: Partial<Record<CommerceStoreKey, { clusters: number; pieces: number }>> }
  | { ok: false; errors: string[] };

export type ValidateOptions = {
  /** Stores that must be present (with at least one cluster). */
  expectStores: readonly CommerceStoreKey[];
  /** Stores present beyond `expectStores` are an error unless this is set. */
  allowExtraStores?: boolean;
  /** Fewer pieces than this across the file is treated as a broken artifact. */
  minPieces?: number;
};

/**
 * Checks a candidate garment-index.json BEFORE it can become the live one: valid JSON, version 1, only known
 * stores, the expected stores present, every piece a well-formed tuple that rebuilds into a purchase URL, and a
 * plausible size. Pure (text in, verdict out) so the operational script and the tests share one definition.
 */
export function validateGarmentIndexText(text: string, options: ValidateOptions): IndexValidation {
  const errors: string[] = [];
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_BYTES) return { ok: false, errors: [`file is ${bytes} bytes, above the ${MAX_BYTES} byte limit`] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["not valid JSON"] };
  }
  const index = parsed as { version?: unknown; stores?: unknown };
  if (typeof index !== "object" || index === null || index.version !== 1) return { ok: false, errors: ["version must be 1"] };
  if (typeof index.stores !== "object" || index.stores === null || Array.isArray(index.stores)) return { ok: false, errors: ["stores must be an object"] };

  const stores: Partial<Record<CommerceStoreKey, { clusters: number; pieces: number }>> = {};
  let totalPieces = 0;
  for (const [key, value] of Object.entries(index.stores as Record<string, unknown>)) {
    if (!KNOWN_STORES.includes(key as CommerceStoreKey)) {
      errors.push(`unknown store "${key}"`);
      continue;
    }
    if (!options.expectStores.includes(key as CommerceStoreKey) && !options.allowExtraStores) errors.push(`unexpected store "${key}" (expected: ${options.expectStores.join(", ")})`);
    const clusters = (value as { clusters?: unknown } | null)?.clusters;
    if (typeof clusters !== "object" || clusters === null || Array.isArray(clusters)) {
      errors.push(`store "${key}" has no clusters object`);
      continue;
    }
    let pieces = 0;
    let malformed = 0;
    for (const tuples of Object.values(clusters as Record<string, unknown>)) {
      if (!Array.isArray(tuples)) {
        malformed++;
        continue;
      }
      for (const tuple of tuples) {
        if (expandTuple(key as CommerceStoreKey, tuple)) pieces++;
        else malformed++;
      }
    }
    if (malformed > 0) errors.push(`store "${key}" has ${malformed} malformed pieces`);
    stores[key as CommerceStoreKey] = { clusters: Object.keys(clusters).length, pieces };
    totalPieces += pieces;
  }
  for (const expected of options.expectStores) {
    if ((stores[expected]?.clusters ?? 0) === 0) errors.push(`expected store "${expected}" is missing or empty`);
  }
  if (totalPieces < (options.minPieces ?? 1000)) errors.push(`only ${totalPieces} pieces, below the plausibility floor of ${options.minPieces ?? 1000}`);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, bytes, sha256: createHash("sha256").update(text).digest("hex"), stores };
}

export type PromoteResult = { validation: Extract<IndexValidation, { ok: true }>; target: string; previous: string | null };

export class GarmentIndexPromotionError extends Error {
  constructor(
    message: string,
    readonly errors: string[] = [],
  ) {
    super(message);
    this.name = "GarmentIndexPromotionError";
  }
}

/**
 * Validates `source`, keeps the current index as `<target>.prev`, then renames `source` over `target`. The rename is
 * atomic only inside one filesystem, so `source` must sit in the same directory (the Volume) as `target`. Any
 * failure before the rename leaves `target` byte-for-byte as it was.
 */
export async function promoteGarmentIndex(source: string, options: ValidateOptions & { target?: string }): Promise<PromoteResult> {
  const target = options.target ?? garmentIndexPath();
  if (path.dirname(path.resolve(source)) !== path.dirname(path.resolve(target))) {
    throw new GarmentIndexPromotionError(`the candidate must be in the same directory as the live index (${path.dirname(path.resolve(target))}) so the rename is atomic`);
  }
  const text = await readFile(source, "utf8").catch(() => {
    throw new GarmentIndexPromotionError(`cannot read ${source}`);
  });
  const validation = validateGarmentIndexText(text, options);
  if (!validation.ok) throw new GarmentIndexPromotionError("the candidate index failed validation; the live index was not touched", validation.errors);

  let previous: string | null = null;
  if (await stat(target).then(() => true, () => false)) {
    previous = `${target}.prev`;
    await copyFile(target, previous);
  }
  await rename(source, target);
  return { validation, target, previous };
}
