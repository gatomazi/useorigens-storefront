import "server-only";
import { requireAtLeastOneInkToken } from "../config/env";
import { fetchStoreProducts, type FetchProgress } from "../ink/client";
import { INK_STORES, tokenFor } from "../ink/config";
import type { CommerceStoreKey } from "../geo/regions";
import { buildStoreIndex } from "./indexer";
import { readSnapshot, writeSnapshot } from "./snapshot-file";
import type { CatalogSnapshot, StoreIndex } from "./types";

export type SyncOutcome =
  | { storeKey: CommerceStoreKey; ok: true; productCount: number; bindingCount: number; merchCount: number; excludedCount: number; rejected: number }
  | { storeKey: CommerceStoreKey; ok: false; error: string };

export type SyncResult = { startedAt: string; finishedAt: string; outcomes: SyncOutcome[] };

/** A store's fetch "succeeded" technically but returned suspiciously little — likely a partial/broken INK response, not a real catalog shrink. */
const REGRESSION_THRESHOLD = 0.5; // new count below 50% of the previous one is refused, unless the previous count was trivial
const REGRESSION_FLOOR = 5; // never trip the guard over stores this small — avoids false positives on a legitimately near-empty store

/**
 * Decides whether a store's freshly-fetched index should replace what is already in the snapshot. Pure and
 * synchronous on purpose — no I/O, no INK, fully unit-testable — this is the "quantidade mínima e
 * integridade" gate the bootstrap review asked for: a technically-successful fetch that comes back with far
 * fewer products than before is treated as suspect, not promoted, and reported as a failure for that store
 * (last-known-good is kept). A previous count at or below REGRESSION_FLOOR never triggers this (nothing to
 * regress from, or the store is legitimately tiny).
 */
export function shouldPromoteStore(previous: StoreIndex | undefined, next: StoreIndex): { promote: true } | { promote: false; reason: string } {
  if (next.productCount === 0 && (previous?.productCount ?? 0) > 0) {
    return { promote: false, reason: `fetched 0 products but the previous snapshot had ${previous!.productCount} — refusing to blank the store` };
  }
  const previousCount = previous?.productCount ?? 0;
  if (previousCount > REGRESSION_FLOOR && next.productCount < previousCount * REGRESSION_THRESHOLD) {
    return { promote: false, reason: `fetched only ${next.productCount} products, down from ${previousCount} (>${Math.round((1 - REGRESSION_THRESHOLD) * 100)}% drop) — looks like a partial response, refusing to promote` };
  }
  return { promote: true };
}

/**
 * Validates and writes a full snapshot object — the single place a snapshot is ever promoted (a store's
 * fetch outcome merged onto the existing snapshot, or a whole fixture snapshot used only by tests to prove
 * the ISR-revalidation path without calling INK — see `POST /api/admin/catalog-sync`'s `fixtureSnapshot`,
 * gated behind `ALLOW_FIXTURE_SYNC`). Framework-agnostic: no Next.js APIs, no INK client, just file I/O — so
 * it is fully testable with plain objects (`tests/unit/infra.test.ts`).
 */
export async function promoteSnapshot(snapshot: CatalogSnapshot, filePath?: string): Promise<void> {
  if (snapshot.version !== 1 || typeof snapshot.stores !== "object" || snapshot.stores === null) {
    throw new Error("refusing to promote a snapshot that fails its own schema check");
  }
  await writeSnapshot(snapshot, filePath);
}

/**
 * The one real implementation of "sync the INK catalog into the local snapshot" — used by both the CLI
 * (`npm run catalog:sync`, scripts/sync-catalog.mts) and `POST /api/admin/catalog-sync`, so there is exactly
 * one place that talks to INK for this purpose (never a second, competing implementation).
 *
 * Last-known-good per store: a store whose fetch fails, or whose fetch technically succeeds but comes back
 * suspiciously small (`shouldPromoteStore`), keeps whatever it already had in the snapshot, untouched — a
 * transient INK failure or a partial response never blanks out that store's products, let alone the whole
 * catalog. Read-only against INK; this never writes back to it. Does not call `revalidatePath` — that is a
 * Next.js Route Handler concern, done by the caller (the admin route) right after this resolves, since it
 * can only run inside an actual request (see that route for why).
 */
export async function syncCatalog(requestedStoreKeys: readonly CommerceStoreKey[] = [], onProgress?: FetchProgress): Promise<SyncResult> {
  requireAtLeastOneInkToken();
  const startedAt = new Date().toISOString();

  const keys = (Object.keys(INK_STORES) as CommerceStoreKey[]).filter(
    (key) => (requestedStoreKeys.length === 0 || requestedStoreKeys.includes(key)) && tokenFor(key),
  );

  const snapshot = await readSnapshot();
  const settled = await Promise.allSettled(
    keys.map(async (storeKey) => {
      const { products, rejected } = await fetchStoreProducts(storeKey, onProgress);
      const index = buildStoreIndex(storeKey, products, new Date().toISOString());
      return { storeKey, index, rejected };
    }),
  );

  const outcomes: SyncOutcome[] = settled.map((result, i) => {
    const storeKey = keys[i];
    if (result.status === "rejected") {
      return { storeKey, ok: false, error: String(result.reason) };
    }
    const { index, rejected } = result.value;
    const decision = shouldPromoteStore(snapshot.stores[storeKey], index);
    if (!decision.promote) {
      return { storeKey, ok: false, error: decision.reason };
    }
    snapshot.stores[storeKey] = index;
    return {
      storeKey,
      ok: true,
      productCount: index.productCount,
      bindingCount: index.bindings.length,
      merchCount: index.merch.length,
      excludedCount: index.excluded.length,
      rejected,
    };
  });

  await promoteSnapshot(snapshot);
  return { startedAt, finishedAt: new Date().toISOString(), outcomes };
}
