import "server-only";
import { garmentIndexMtimeMs, readGarmentIndexSync } from "../catalog/garment-index-file";
import { readSnapshotSync, snapshotMtimeMs } from "../catalog/snapshot-file";
import { buildProductIndex, type ProductIndex } from "./catalog-index";
import { buildCatalogContext, type CatalogContext } from "./classify";
import { McpToolError } from "./errors";

/**
 * The catalog the MCP reads: the same files the storefront serves from (catalog snapshot + garment index on the Volume), rebuilt only when
 * one of them changes (mtime), so a question never re-reads the disk for nothing and a fresh sync is picked up on the next question.
 */
type Loaded = { key: string; index: ProductIndex; ctx: CatalogContext; snapshotMtimeMs: number };
let memo: Loaded | null = null;

export function loadCatalog(): Loaded {
  const sMtime = snapshotMtimeMs();
  const gMtime = garmentIndexMtimeMs();
  const key = `${sMtime}|${gMtime}`;
  if (memo && memo.key === key) return memo;
  if (!sMtime) throw new McpToolError("CATALOG_UNAVAILABLE", "O snapshot do catálogo não existe neste servidor (nunca sincronizado ou Volume ausente).");
  const { snapshot } = readSnapshotSync();
  const garments = gMtime ? readGarmentIndexSync().index : null;
  memo = { key, index: buildProductIndex(snapshot, garments), ctx: buildCatalogContext(snapshot, garments), snapshotMtimeMs: sMtime };
  return memo;
}
