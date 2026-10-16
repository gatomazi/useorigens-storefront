import "server-only";
import { getCollections } from "../catalog/collections-file";
import { snapshotStatus } from "../catalog/snapshot-file";
import type { CommerceStoreKey } from "../geo/regions";

export const daysSince = (iso: string): number => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** Why a store's synced collections may be out of date (7+ days old, or the catalog was synced after them); null when they are fine or were never synced. */
export function collectionsStaleReason(store: CommerceStoreKey): string | null {
  const synced = getCollections().stores[store];
  if (!synced) return null;
  if (daysSince(synced.syncedAt) >= 7) return "Desatualizada (7+ dias)";
  const catalogAt = snapshotStatus().stores.find((c) => c.storeKey === store)?.syncedAt;
  return catalogAt && new Date(catalogAt) > new Date(synced.catalogSyncedAt) ? "O catálogo é mais novo que as coleções" : null;
}
