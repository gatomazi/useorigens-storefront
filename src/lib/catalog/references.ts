import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { CommerceStoreKey } from "../geo/regions";
import { commercePlan, SINGLE_STORE_KEY } from "./commerce-mode";

/**
 * Old product references (favorites saved in a browser, CMS featured products, list sessions) carry `(store, inkProductId)` of the REGIONAL
 * store they were made in. In single-store mode those ids do not exist in the single store, so they are translated through the versioned
 * old → new map (docs/migracao-ink/mapa-antigo-novo-v1-*.csv.gz): only rows with status `confirmado` are in the file the generator writes
 * next to the single-store catalog (`referencias-antigas.json`). Absent, ambiguous or unkeyed rows are simply not there: such a reference
 * resolves to nothing ("indisponível"), never to a product found by title. Nothing is rewritten: the browser and the CMS keep their refs.
 */
export const REFERENCES_FILE = "referencias-antigas.json";

export type OldReferencesFile = {
  version: 1;
  /** Version and run of the old → new map these rows come from. */
  mapVersion: number;
  runId: string;
  /** old store → old id → new id in the single store. */
  stores: Partial<Record<CommerceStoreKey, Record<string, string>>>;
};

export type ProductRef = { store: CommerceStoreKey; id: string };

let cache: { file: string; mtimeMs: number; refs: OldReferencesFile | null } | null = null;

function readReferences(file: string): OldReferencesFile | null {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return null;
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.refs;
  let refs: OldReferencesFile | null = null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as OldReferencesFile;
    refs = parsed?.version === 1 && typeof parsed.stores === "object" && parsed.stores !== null ? parsed : null;
  } catch {
    refs = null;
  }
  cache = { file, mtimeMs, refs };
  return refs;
}

/** Pure translation, for tests and for callers that already hold the file. */
export function translateRef(ref: ProductRef, mode: "multi-store" | "single-store", refs: OldReferencesFile | null): ProductRef | null {
  if (mode !== "single-store" || ref.store === SINGLE_STORE_KEY) return ref;
  const id = refs?.stores[ref.store]?.[ref.id];
  return id ? { store: SINGLE_STORE_KEY, id } : null;
}

/**
 * The reference to look up in the SERVED catalog: itself in the regional mode (or when it already points at the single store); in
 * single-store mode, an old regional ref becomes its confirmed new id, or null when the map has no confirmed row for it.
 */
export function canonicalRef(ref: ProductRef): ProductRef | null {
  const plan = commercePlan();
  if (plan.effective !== "single-store" || ref.store === SINGLE_STORE_KEY) return ref;
  return translateRef(ref, plan.effective, readReferences(path.join(plan.dataDir, REFERENCES_FILE)));
}
