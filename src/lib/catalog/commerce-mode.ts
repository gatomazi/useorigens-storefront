import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSnapshotDir, commerceModeSetting, commerceSimulationAllowed, commerceStorePriorityOverride } from "../config/env";
import { REGIONS, REGION_SLUGS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import type { CatalogSource } from "./types";

/**
 * THE single place that decides how commerce is organized for a request: which store's catalog a region shows, where it buys, which cart
 * mirror it uses, and which data directory every catalog reader serves from. Nothing else should read `REGIONS[r].storeKey` to decide a
 * purchase or catalog source (docs/migracao-ink/origens-storefront-unificado-preparacao.md, "pontos comerciais").
 *
 *   multi-store (today):  /sul → use-sul, /norte → use-norte, /centro-oeste → use-centro — catalog AND purchase; data in <snapshot dir>/
 *   single-store (future): every region → use-sul — catalog filtered per region, purchase in use-sul; data in <snapshot dir>/loja-unica/
 *
 * The mode is ONE switch (`COMMERCE_MODE`) bound to its data: catalog, garment pieces, collections and recommendations of a mode live in
 * that mode's directory, so a catalog can never be paired with the other mode's purchase ids. `single-store` is only EFFECTIVE when
 * everything below holds; otherwise the whole storefront keeps serving `multi-store` (the legacy files, always kept current by the regular
 * syncs) and the reason is reported in /api/ready and the boot log. Rolling back = unsetting `COMMERCE_MODE`; nothing is rewritten.
 *
 *   1. COMMERCE_MODE=single-store, spelled exactly (anything else is diagnosed and ignored);
 *   2. <snapshot dir>/loja-unica/catalog-snapshot.json exists and declares `source.mode = "single-store"` for SINGLE_STORE_KEY;
 *   3. no COMMERCE_STORE_PRIORITY override (an independent ranking flag would contradict the mode);
 *   4. a SIMULATION snapshot only with COMMERCE_SIMULATION=on (local preview), and its items are never sellable (commerce.ts);
 *   5. a REAL (non-simulation) snapshot only when every external dependency in SINGLE_STORE_DEPENDENCIES is marked ready — today none is,
 *      so the commercial switch is blocked by construction until those are delivered and confirmed in code.
 */

export type CommerceMode = "multi-store" | "single-store";

/** The INK store that becomes the single store (docs/migracao-ink/origens-ink-reconciliacao.md). */
export const SINGLE_STORE_KEY: CommerceStoreKey = "use-sul";

/** Sub-directory of the snapshot directory (the Volume) that holds the single-store data set. */
export const SINGLE_STORE_DIR = "loja-unica";

/**
 * What the single store needs OUTSIDE this storefront before it may sell. Flipping one to `ready: true` is a reviewed code change, made
 * only after the dependency is delivered and verified — never an env var. Until all are ready, a real single-store snapshot is refused.
 */
export const SINGLE_STORE_DEPENDENCIES: ReadonlyArray<{ id: string; ready: boolean; detail: string }> = [
  {
    id: "cart-mirror-worker",
    ready: false,
    detail:
      "use-origens-workers: o Worker/KV do espelho de carrinho da usesul.com.br precisa aceitar a volta para /norte e /centro-oeste (hoje cada região tem Worker, KV e origem próprios)",
  },
  {
    id: "buy-session-worker",
    ready: false,
    detail: "use-origens-workers: list-watch.js na usesul.com.br precisa atender ?ls= de listas montadas em /norte e /centro-oeste",
  },
  {
    id: "checkout-theme",
    ready: false,
    detail: "tema/identidade regional no checkout da loja única (nome, logo e links de volta para a região de navegação)",
  },
  {
    id: "cms-references",
    ready: false,
    detail: "publicação do CMS de Norte/Centro-Oeste ainda aponta coleções/produtos de use-norte/use-centro: re-apontar para use-sul antes da virada",
  },
];

export type CommercePlan = {
  /** What COMMERCE_MODE asked for (invalid values already folded into multi-store). */
  requested: CommerceMode;
  /** What is actually served. */
  effective: CommerceMode;
  /** The served single-store data is a simulation (local preview only). Always false in multi-store. */
  simulation: boolean;
  /** Directory every catalog-family reader (catalog, garment pieces, collections, recommendations) serves from. */
  dataDir: string;
  /** Source declared by the served single-store snapshot (null in multi-store). */
  source: Extract<CatalogSource, { mode: "single-store" }> | null;
  /** Why the effective mode differs from the requested one, or what is pending. Empty when nothing to report. */
  diagnostics: string[];
};

/** Catalog AND purchase store of a region under a given mode. The only mapping the rest of the code should use. */
export function storeForRegionIn(mode: CommerceMode, region: RegionSlug): CommerceStoreKey {
  return mode === "single-store" ? SINGLE_STORE_KEY : REGIONS[region].storeKey;
}

/** Regions whose purchases happen in a store under a given mode (the inverse; never `find()` on REGIONS). */
export function regionsOfStoreIn(mode: CommerceMode, store: CommerceStoreKey): RegionSlug[] {
  return REGION_SLUGS.filter((r) => storeForRegionIn(mode, r) === store);
}

/**
 * Which region's cart-mirror entry (origin, cart page, Worker KV — src/lib/cart-mirror/constants.ts) a region uses. Multi-store: its own.
 * Single-store: the single store's (use-sul ⇒ "sul"). Navigation region and supplying store are different things: /norte stays /norte,
 * only the cart lives at the single store.
 */
export function cartRegionIn(mode: CommerceMode, region: RegionSlug): RegionSlug {
  return mode === "single-store" ? "sul" : region;
}

export function singleStoreDataDir(base: string = catalogSnapshotDir()): string {
  return path.join(base, SINGLE_STORE_DIR);
}

type SourceRead = { ok: true; source: Extract<CatalogSource, { mode: "single-store" }> } | { ok: false; reason: string };

let sourceCache: { file: string; mtimeMs: number; read: SourceRead } | null = null;

/** Reads only what the plan needs from the single-store snapshot (cached by mtime: a stat per call). */
function readSingleStoreSource(file: string): SourceRead {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return { ok: false, reason: `sem ${file}` };
  }
  if (sourceCache && sourceCache.file === file && sourceCache.mtimeMs === mtimeMs) return sourceCache.read;
  let read: SourceRead;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { version?: unknown; source?: CatalogSource; stores?: Record<string, unknown> };
    const s = parsed.source;
    if (parsed.version !== 1 || typeof parsed.stores !== "object" || parsed.stores === null) read = { ok: false, reason: "snapshot da loja única fora do formato" };
    else if (!s || s.mode !== "single-store") read = { ok: false, reason: "snapshot da loja única não declara source.mode=single-store" };
    else if (s.storeKey !== SINGLE_STORE_KEY) read = { ok: false, reason: `snapshot da loja única é de ${s.storeKey}, esperado ${SINGLE_STORE_KEY}` };
    else if (Object.keys(parsed.stores).some((k) => k !== SINGLE_STORE_KEY)) read = { ok: false, reason: "snapshot da loja única contém outras lojas" };
    else read = { ok: true, source: s };
  } catch (err) {
    read = { ok: false, reason: `snapshot da loja única ilegível (${err instanceof Error ? err.message : "erro"})` };
  }
  sourceCache = { file, mtimeMs, read };
  return read;
}

let lastLogged = "";

export function commercePlan(): CommercePlan {
  const base = catalogSnapshotDir();
  const setting = commerceModeSetting();
  const diagnostics: string[] = [];
  if (setting.invalid) diagnostics.push(`COMMERCE_MODE="${setting.raw}" inválido (use multi-store ou single-store): mantido multi-store`);
  const legacy: CommercePlan = { requested: setting.mode, effective: "multi-store", simulation: false, dataDir: base, source: null, diagnostics };
  if (setting.mode !== "single-store") return report(legacy);

  const refuse = (reason: string) => {
    diagnostics.push(`loja única recusada: ${reason} — servindo multi-store`);
    return report(legacy);
  };
  let priority: CommerceStoreKey[] | null;
  try {
    priority = commerceStorePriorityOverride();
  } catch (err) {
    return refuse(err instanceof Error ? err.message : "COMMERCE_STORE_PRIORITY inválido");
  }
  if (priority) return refuse("COMMERCE_STORE_PRIORITY definido junto com COMMERCE_MODE=single-store (flags independentes contraditórias)");

  const dir = singleStoreDataDir(base);
  const read = readSingleStoreSource(path.join(dir, "catalog-snapshot.json"));
  if (!read.ok) return refuse(read.reason);
  if (read.source.simulation) {
    if (!commerceSimulationAllowed()) return refuse("o snapshot é uma SIMULAÇÃO e COMMERCE_SIMULATION não está ligado");
    diagnostics.push("SIMULAÇÃO: itens ocultos na INK aparecem como ativados e sem link de compra; não usar em produção");
  } else {
    const pending = SINGLE_STORE_DEPENDENCIES.filter((d) => !d.ready);
    if (pending.length > 0) return refuse(`dependências externas pendentes: ${pending.map((d) => d.id).join(", ")}`);
  }
  return report({ requested: "single-store", effective: "single-store", simulation: read.source.simulation, dataDir: dir, source: read.source, diagnostics });
}

/** Logs the decision once per change (the plan is evaluated on every request; the log is not). */
function report(plan: CommercePlan): CommercePlan {
  const line = `${plan.requested}→${plan.effective}${plan.simulation ? " (simulação)" : ""}${plan.diagnostics.length ? `: ${plan.diagnostics.join("; ")}` : ""}`;
  if (line !== lastLogged && (plan.requested !== "multi-store" || plan.diagnostics.length > 0)) {
    lastLogged = line;
    console.warn(`[commerce] ${line}`);
  }
  return plan;
}

/** Shorthands for the effective plan. */
export const storeForRegion = (region: RegionSlug): CommerceStoreKey => storeForRegionIn(commercePlan().effective, region);
export const regionsOfStore = (store: CommerceStoreKey): RegionSlug[] => regionsOfStoreIn(commercePlan().effective, store);
export const cartRegionFor = (region: RegionSlug): RegionSlug => cartRegionIn(commercePlan().effective, region);
export const servedDataDir = (): string => commercePlan().dataDir;
