import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { commerceModeSetting } from "@/lib/config/env";
import { cartRegionIn, commercePlan, regionsOfStoreIn, SINGLE_STORE_DEPENDENCIES, SINGLE_STORE_DIR, storeForRegionIn } from "@/lib/catalog/commerce-mode";
import { purchaseUrl } from "@/lib/catalog/commerce";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import { resolveProductDisplay } from "@/lib/catalog/lookup";
import { REFERENCES_FILE, translateRef } from "@/lib/catalog/references";
import { getCatalog } from "@/lib/catalog/repository";
import { REGIONS, REGION_SLUGS, type RegionSlug } from "@/lib/geo/regions";
import type { CatalogSnapshot, StoreIndex } from "@/lib/catalog/types";
import { product } from "./fixtures";

const NOW = "2026-10-05T00:00:00.000Z";
const ENV_KEYS = ["CATALOG_SNAPSHOT_DIR", "COMMERCE_MODE", "COMMERCE_SIMULATION", "COMMERCE_STORE_PRIORITY"] as const;
let saved: Record<string, string | undefined> = {};
let dir = "";

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  dir = mkdtempSync(path.join(tmpdir(), "commerce-mode-"));
  process.env.CATALOG_SNAPSHOT_DIR = dir;
});
afterEach(() => {
  for (const k of ENV_KEYS) if (saved[k] === undefined) delete process.env[k];
  else process.env[k] = saved[k];
});

// ─── Data: the regional stores of today and the single store, as the storefront reads them ───────────────────────────────────────────
const sulUrl = (id: string) => `https://www.usesul.com.br/usesul/product/p-${id}`;
const regional: CatalogSnapshot = {
  version: 1,
  stores: {
    "use-sul": buildStoreIndex("use-sul", [product("Curitiba | Origem PR", { id: "10" })], NOW),
    "use-norte": buildStoreIndex("use-norte", [product("Belém | Origem PA", { id: "20", storeKey: "use-norte", storeProductUrl: "https://www.usenorte.com.br/usenorte/product/belem" })], NOW),
    "use-centro": buildStoreIndex("use-centro", [product("Cuiabá | Origem MT", { id: "30", storeKey: "use-centro", storeProductUrl: "https://www.usecentro.com.br/usecentro/product/cuiaba" })], NOW),
  },
};
function unificado(simulation: boolean): CatalogSnapshot {
  const daRegiao = (r: RegionSlug, name: string, id: string): StoreIndex =>
    buildStoreIndex("use-sul", [product(name, { id, storeProductUrl: sulUrl(id) })], NOW, { ufs: REGIONS[r].ufs, region: r });
  const sul = daRegiao("sul", "Curitiba | Origem PR", "10");
  const norte = daRegiao("norte", "Belém | Origem PA", "200");
  const centro = daRegiao("centro-oeste", "Cuiabá | Origem MT", "300");
  const bindings = [...sul.bindings, ...norte.bindings.map((b) => ({ ...b, ...(simulation ? { simulated: true as const } : {}) })), ...centro.bindings];
  return {
    version: 1,
    source: { mode: "single-store", storeKey: "use-sul", simulation, runId: "teste", generatedAt: NOW, mapVersion: 1, identitySha256: "x" },
    stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: NOW, productCount: bindings.length, bindings, merch: [], excluded: [] } },
  };
}
function gravar(snapshot: CatalogSnapshot, sub = ""): string {
  const d = path.join(dir, sub);
  mkdirSync(d, { recursive: true });
  const f = path.join(d, "catalog-snapshot.json");
  writeFileSync(f, JSON.stringify(snapshot));
  return f;
}
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

describe("COMMERCE_MODE", () => {
  test("given no configuration, then the mode is multi-store", () => {
    expect(commerceModeSetting()).toEqual({ mode: "multi-store", raw: null, invalid: false });
  });
  test("given an invalid value, then it is diagnosed and NEVER becomes single-store", () => {
    for (const raw of ["single", "SINGLE-STORE", "true", "on", "loja-unica"]) {
      process.env.COMMERCE_MODE = raw;
      expect(commerceModeSetting()).toMatchObject({ mode: "multi-store", invalid: true });
      expect(commercePlan()).toMatchObject({ requested: "multi-store", effective: "multi-store" });
      expect(commercePlan().diagnostics[0]).toMatch(/inválido/);
    }
  });
});

describe("região → loja de catálogo e de compra", () => {
  test("given multi-store, then /sul → Sul, /norte → Norte, /centro-oeste → Centro, catalog and cart", () => {
    expect(REGION_SLUGS.map((r) => storeForRegionIn("multi-store", r))).toEqual(["use-sul", "use-norte", "use-centro"]);
    expect(REGION_SLUGS.map((r) => cartRegionIn("multi-store", r))).toEqual(["sul", "norte", "centro-oeste"]);
    expect(regionsOfStoreIn("multi-store", "use-norte")).toEqual(["norte"]);
  });
  test("given single-store, then the three regions buy in the single store and use its cart; navigation regions are kept", () => {
    expect(REGION_SLUGS.map((r) => storeForRegionIn("single-store", r))).toEqual(["use-sul", "use-sul", "use-sul"]);
    expect(REGION_SLUGS.map((r) => cartRegionIn("single-store", r))).toEqual(["sul", "sul", "sul"]);
    expect(regionsOfStoreIn("single-store", "use-sul")).toEqual(["sul", "norte", "centro-oeste"]);
    expect(regionsOfStoreIn("single-store", "use-norte")).toEqual([]);
  });
});

describe("commercePlan: o modo só é efetivo com dados e dependências prontos", () => {
  test("given no COMMERCE_MODE, then the regional data set at the snapshot root is served", () => {
    gravar(regional);
    gravar(unificado(false), SINGLE_STORE_DIR);
    expect(commercePlan()).toMatchObject({ requested: "multi-store", effective: "multi-store", dataDir: dir, simulation: false });
  });
  test("given single-store without the single-store data set, then multi-store keeps being served", () => {
    process.env.COMMERCE_MODE = "single-store";
    gravar(regional);
    const plan = commercePlan();
    expect(plan).toMatchObject({ requested: "single-store", effective: "multi-store", dataDir: dir });
    expect(plan.diagnostics.join()).toMatch(/recusada/);
  });
  test("given a real single-store snapshot, then the switch is BLOCKED while an external dependency is pending", () => {
    expect(SINGLE_STORE_DEPENDENCIES.some((d) => !d.ready)).toBe(true);
    process.env.COMMERCE_MODE = "single-store";
    gravar(unificado(false), SINGLE_STORE_DIR);
    const plan = commercePlan();
    expect(plan.effective).toBe("multi-store");
    expect(plan.diagnostics.join()).toMatch(/cart-mirror-worker/);
  });
  test("given a simulation snapshot, then it is served only with COMMERCE_SIMULATION=on", () => {
    process.env.COMMERCE_MODE = "single-store";
    gravar(unificado(true), SINGLE_STORE_DIR);
    expect(commercePlan().effective).toBe("multi-store");
    process.env.COMMERCE_SIMULATION = "on";
    expect(commercePlan()).toMatchObject({ effective: "single-store", simulation: true, dataDir: path.join(dir, SINGLE_STORE_DIR) });
  });
  test("given COMMERCE_STORE_PRIORITY next to single-store, then the contradictory flags are refused", () => {
    process.env.COMMERCE_MODE = "single-store";
    process.env.COMMERCE_SIMULATION = "on";
    process.env.COMMERCE_STORE_PRIORITY = "use-sul";
    gravar(unificado(true), SINGLE_STORE_DIR);
    expect(commercePlan().effective).toBe("multi-store");
  });
  test("given a single-store directory holding a regional snapshot, then it is refused (catalog and mode must match)", () => {
    process.env.COMMERCE_MODE = "single-store";
    process.env.COMMERCE_SIMULATION = "on";
    gravar(regional, SINGLE_STORE_DIR);
    expect(commercePlan().effective).toBe("multi-store");
  });
});

describe("catálogo servido por modo", () => {
  test("given multi-store, then each region shows its own store's products and links", () => {
    gravar(regional);
    const c = getCatalog();
    const belem = c.cityFamilies("1501402")[0].primary;
    expect(belem.commerceStoreKey).toBe("use-norte");
    expect(purchaseUrl(belem)).toBe("https://www.usenorte.com.br/usenorte/product/belem");
    expect(c.coveredCityIds("sul").has("4106902")).toBe(true);
  });
  test("given single-store (simulation), then each region reads ONLY its own cities from the single store, and simulated items are never sellable", () => {
    process.env.COMMERCE_MODE = "single-store";
    process.env.COMMERCE_SIMULATION = "on";
    gravar(regional);
    gravar(unificado(true), SINGLE_STORE_DIR);
    const c = getCatalog();
    expect([...c.coveredCityIds("sul")]).toEqual(["4106902"]);
    expect([...c.coveredCityIds("norte")]).toEqual(["1501402"]);
    expect([...c.coveredCityIds("centro-oeste")]).toEqual(["5103403"]);
    const belem = c.cityFamilies("1501402")[0].primary;
    expect(belem).toMatchObject({ commerceStoreKey: "use-sul", inkProductId: "200", simulated: true });
    expect(purchaseUrl(belem)).toBeNull();
    expect(purchaseUrl(c.cityFamilies("4106902")[0].primary)).toBe(sulUrl("10"));
  });
  test("given multi-store and a root snapshot that declares single-store, then it is refused instead of selling Norte through the Sul store", () => {
    gravar(unificado(false));
    expect(getCatalog().coveredCityIds("norte").size).toBe(0);
  });
  test("given single-store, then the regional files are read but never rewritten", () => {
    process.env.COMMERCE_MODE = "single-store";
    process.env.COMMERCE_SIMULATION = "on";
    const root = gravar(regional);
    gravar(unificado(true), SINGLE_STORE_DIR);
    const before = sha(root);
    getCatalog();
    expect(sha(root)).toBe(before);
  });
});

describe("referências antigas → loja única (mapa antigo → novo)", () => {
  test("given multi-store, then a reference is itself", () => {
    expect(translateRef({ store: "use-norte", id: "20" }, "multi-store", null)).toEqual({ store: "use-norte", id: "20" });
  });
  test("given single-store, then a confirmed row translates and a missing one is unavailable (never by title)", () => {
    const refs = { version: 1 as const, mapVersion: 1, runId: "r", stores: { "use-norte": { "20": "200" } } };
    expect(translateRef({ store: "use-norte", id: "20" }, "single-store", refs)).toEqual({ store: "use-sul", id: "200" });
    expect(translateRef({ store: "use-norte", id: "21" }, "single-store", refs)).toBeNull();
    expect(translateRef({ store: "use-sul", id: "10" }, "single-store", refs)).toEqual({ store: "use-sul", id: "10" });
  });
  test("given a favorite saved in /norte under use-norte, then single-store resolves it to the single store's product (and its sale store)", () => {
    process.env.COMMERCE_MODE = "single-store";
    process.env.COMMERCE_SIMULATION = "on";
    gravar(regional);
    gravar(unificado(false), SINGLE_STORE_DIR);
    // A non-simulated item of the simulation file: the preview marks only what INK still hides.
    const snap = unificado(true);
    for (const b of snap.stores["use-sul"]!.bindings) delete b.simulated;
    gravar(snap, SINGLE_STORE_DIR);
    writeFileSync(path.join(dir, SINGLE_STORE_DIR, REFERENCES_FILE), JSON.stringify({ version: 1, mapVersion: 1, runId: "r", stores: { "use-norte": { "20": "200" } } }));
    expect(resolveProductDisplay("use-norte", "20")).toMatchObject({ inkProductId: "200", commerceStoreKey: "use-sul", url: sulUrl("200") });
    expect(resolveProductDisplay("use-norte", "99")).toBeNull();
    // Multi-store again: the same favorite is the Norte store's product, untouched.
    delete process.env.COMMERCE_MODE;
    expect(resolveProductDisplay("use-norte", "20")).toMatchObject({ inkProductId: "20", commerceStoreKey: "use-norte" });
  });
});
