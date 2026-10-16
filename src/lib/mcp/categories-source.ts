import "server-only";
import { statSync } from "node:fs";
import { collectionsPath, readCollectionsFile } from "../catalog/collections-file";
import { buildCategoryIndex, type CategoryIndex } from "./categories";
import { McpToolError } from "./errors";

/**
 * The categories the MCP reads: the collections snapshot written next to the catalog snapshot the MCP already reads (catalog-source.ts),
 * so the members were matched against that same catalog. Rebuilt only when the file changes (mtime).
 */
let memo: { mtimeMs: number; index: CategoryIndex } | null = null;

export function loadCategories(): CategoryIndex {
  const file = collectionsPath();
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    throw new McpToolError("CATALOG_UNAVAILABLE", "As categorias da INK ainda não foram sincronizadas neste servidor (sem snapshot de coleções).");
  }
  if (memo && memo.mtimeMs === mtimeMs) return memo.index;
  const { snapshot } = readCollectionsFile(file);
  if (Object.keys(snapshot.stores).length === 0) throw new McpToolError("CATALOG_UNAVAILABLE", "O snapshot de categorias deste servidor está vazio ou ilegível.");
  memo = { mtimeMs, index: buildCategoryIndex(snapshot) };
  return memo.index;
}
