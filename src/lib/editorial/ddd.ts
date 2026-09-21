import type { MerchProduct } from "../catalog/types";
import { STATE_NAMES } from "../geo/regions";

export type DddProduct = {
  /** Area code with its leading zero, as printed on the shirt ("054"). */
  code: string;
  /** Region name as INK names it ("Serra Gaúcha"). */
  regionName: string;
  uf: string;
  product: MerchProduct;
};

/** Brazilian area codes are state-bound: 041–046 Paraná, 047–049 Santa Catarina, 051–055 Rio Grande do Sul. */
export function ufOfAreaCode(code: string): string | null {
  const n = Number(code);
  if (n >= 41 && n <= 46) return "PR";
  if (n >= 47 && n <= 49) return "SC";
  if (n >= 51 && n <= 55) return "RS";
  return null;
}

const DDD_NAME = /^(?<region>.+?)\s*\|\s*(?<code>0\d{2})$/;

/** Products named "<Region> | 0xx". The state comes from the code itself, nothing is inferred. */
export function dddProducts(merch: readonly MerchProduct[]): DddProduct[] {
  const out: DddProduct[] = [];
  for (const product of merch) {
    const m = DDD_NAME.exec(product.name.replace(/\s+/g, " ").trim());
    if (!m?.groups) continue;
    const uf = ufOfAreaCode(m.groups.code);
    if (!uf || !(uf in STATE_NAMES)) continue;
    out.push({ code: m.groups.code, regionName: m.groups.region.trim(), uf, product });
  }
  // Stable, meaningful order: state (RS, SC, PR), then code, then region name.
  const stateOrder = ["RS", "SC", "PR"];
  return out.sort(
    (a, b) =>
      stateOrder.indexOf(a.uf) - stateOrder.indexOf(b.uf) ||
      a.code.localeCompare(b.code) ||
      a.regionName.localeCompare(b.regionName, "pt-BR"),
  );
}

/** Finds specific DDD products by area code and region name (used for the hero trio). Returns only what exists. */
export function pickDdd(all: readonly DddProduct[], wanted: readonly { code: string; regionName: string }[]): DddProduct[] {
  return wanted.flatMap((w) => {
    const hit = all.find((d) => d.code === w.code && d.regionName === w.regionName);
    return hit ? [hit] : [];
  });
}
