import "server-only";
import { readSnapshotSync, snapshotPath } from "../catalog/snapshot-file";
import { collectionsPath, readCollectionsFile } from "../catalog/collections-file";
import { garmentIndexPath, readGarmentIndexSync } from "../catalog/garment-index-file";
import { SINGLE_STORE_KEY, singleStoreDataDir } from "../catalog/commerce-mode";
import { readPublished } from "../site-config/published";
import type { CommerceStoreKey } from "../geo/regions";
import type { CatalogSource } from "../catalog/types";
import { buildRecommendationsIndex, serializeIndex, type BuildResult, type StoreBuildInput } from "./build";
import { featuredCollectionIds } from "./cms";
import { recommendationsIndexPath, writeAndPromote } from "./index-file";

/**
 * The build inputs from the LOCAL files only (catalog snapshot, collections, garment-piece index, published CMS): never calls INK.
 * Shared by `npm run recommendations:build` and the single store's syncs, so both build exactly the same index.
 * `dataDir` = the single store's folder; without it, the regional files.
 */
export function readRecommendationInputs(stores: readonly CommerceStoreKey[], dataDir?: string): { inputs: StoreBuildInput[]; skipped: CommerceStoreKey[]; singleStore: CatalogSource | undefined; cms: string } {
  const { snapshot } = readSnapshotSync(dataDir ? snapshotPath(dataDir) : undefined);
  const { snapshot: collections } = readCollectionsFile(dataDir ? collectionsPath(dataDir) : undefined);
  const { index: garments } = readGarmentIndexSync(dataDir ? garmentIndexPath(dataDir) : undefined);
  const published = readPublished();
  const bundle = published.source === "published" ? published.bundle : null;
  const inputs: StoreBuildInput[] = [];
  const skipped: CommerceStoreKey[] = [];
  for (const store of stores) {
    const index = snapshot.stores[store];
    if (!index) {
      skipped.push(store);
      continue;
    }
    const storeCollections = collections.stores[store];
    const garmentClusters: Record<string, string[]> = {};
    for (const [cluster, tuples] of Object.entries(garments.stores[store]?.clusters ?? {})) garmentClusters[cluster] = tuples.map((t) => t[1]);
    inputs.push({
      store,
      syncedAt: [index.syncedAt, storeCollections?.syncedAt ?? ""].sort().at(-1)!,
      bindings: index.bindings,
      merch: index.merch,
      collections: storeCollections?.collections ?? [],
      featuredCollectionIds: featuredCollectionIds(bundle, store),
      garmentClusters,
    });
  }
  return { inputs, skipped, singleStore: snapshot.source, cms: published.source };
}

export type RecommendationsRebuild =
  | { ok: true; generatedAt: string; productsWithList: number; bytes: number; durationMs: number }
  | { ok: false; error: string };

export type RebuildDeps = { read?: typeof readRecommendationInputs; promote?: typeof writeAndPromote; build?: (inputs: StoreBuildInput[]) => BuildResult };

/**
 * Rebuilds the single store's "Você também pode gostar" index right after its catalog was synced. Until 10/11/2026 this was manual and never
 * scheduled: the lists kept the prices, names and products of the day they were last built (109,90 after the store went to 119,90; new
 * products without a list). Never throws: a refused build keeps the live index (and its `.prev`), and the sync it follows stays as it was.
 */
export async function rebuildLojaUnicaRecommendations(deps: RebuildDeps = {}): Promise<RecommendationsRebuild> {
  const began = Date.now();
  try {
    const dataDir = singleStoreDataDir();
    const { inputs, singleStore } = (deps.read ?? readRecommendationInputs)([SINGLE_STORE_KEY], dataDir);
    // Same guard as the CLI: a simulation snapshot would recommend products hidden in the store.
    if (singleStore?.mode !== "single-store" || singleStore.simulation) return { ok: false, error: "o catálogo da loja única não é o de produção (simulação)" };
    if (!inputs.length) return { ok: false, error: "sem catálogo da loja única" };
    const result = (deps.build ?? ((i) => buildRecommendationsIndex(i)))(inputs);
    const text = serializeIndex(result.index);
    const promoted = await (deps.promote ?? writeAndPromote)(text, { expectStores: [SINGLE_STORE_KEY], minListsPerStore: 10, target: recommendationsIndexPath(dataDir) });
    return { ok: true, generatedAt: result.index.generatedAt, productsWithList: result.stats[SINGLE_STORE_KEY]?.productsWithList ?? 0, bytes: promoted.validation.bytes, durationMs: Date.now() - began };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
