import "server-only";
import { statSync } from "node:fs";
import { collectionsPath, readCollectionsFile } from "../catalog/collections-file";
import { commercePlan } from "../catalog/commerce-mode";
import { buildCategoryIndex, type CategoryIndex } from "./categories";
import { McpToolError } from "./errors";

/**
 * The categories the MCP reads: the collections snapshot written next to the catalog snapshot the MCP already reads (catalog-source.ts),
 * so the members were matched against that same catalog (same served directory, commerce-mode.ts). Rebuilt only when the file changes.
 */
let memo: { file: string; mtimeMs: number; index: CategoryIndex } | null = null;

export function loadCategories(): CategoryIndex {
  const file = collectionsPath(commercePlan().dataDir);
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    throw new McpToolError("CATALOG_UNAVAILABLE", "As categorias da INK ainda não foram sincronizadas neste servidor (sem snapshot de coleções).");
  }
  if (memo && memo.file === file && memo.mtimeMs === mtimeMs) return memo.index;
  const { snapshot } = readCollectionsFile(file);
  if (Object.keys(snapshot.stores).length === 0) throw new McpToolError("CATALOG_UNAVAILABLE", "O snapshot de categorias deste servidor está vazio ou ilegível.");
  memo = { file, mtimeMs, index: buildCategoryIndex(snapshot) };
  return memo.index;
}
