import type { MerchProduct } from "../catalog/types";
import { STATE_NAMES } from "../geo/regions";

/** Clean state lines approved for the home. "Made in" (flag colours) is deliberately not one of them. */
const LINE_PREFERENCE = ["Clean", "Minimal", "Escritas", "Atlas do Sul"] as const;

/** Demonym used by each state's own "<Demonym> | Essência" product. */
const DEMONYM: Readonly<Record<string, string>> = { PR: "Paranaense", SC: "Catarinense", RS: "Gaúcho" };

export type TerraProduct = { product: MerchProduct; uf: string; label: string };

/**
 * "Da Nossa Terra": real regional-identity products (never the language expressions of Fala daqui, never a
 * recreation), balanced across the three states — up to two per state, in this order: the state's own clean
 * line, then its demonym "Essência" product, only when each really exists. Deliberately skips "Made in" (flag
 * colours), any map/flag product and anything that isn't the plain state-name/demonym line, so the section
 * never leans on flags or clichés.
 */
export function terraProducts(merch: readonly MerchProduct[], ufs: readonly string[]): TerraProduct[] {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const out: TerraProduct[] = [];
  for (const uf of ufs) {
    const stateName = STATE_NAMES[uf];
    if (!stateName) continue;
    for (const line of LINE_PREFERENCE) {
      const hit = merch.find((m) => norm(m.name) === norm(`${stateName} | ${line}`));
      if (hit) {
        out.push({ product: hit, uf, label: `${stateName} · ${line}` });
        break;
      }
    }
    const demonym = DEMONYM[uf];
    if (demonym) {
      const hit = merch.find((m) => norm(m.name) === norm(`${demonym} | Essência`));
      if (hit) out.push({ product: hit, uf, label: `${demonym} · Essência` });
    }
  }
  return out;
}
