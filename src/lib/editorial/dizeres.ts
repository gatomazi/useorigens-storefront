import { normalizeText } from "../geo/text";
import { STATE_NAMES } from "../geo/regions";
import type { MerchProduct } from "../catalog/types";
import { DIZERES_CONTEXT } from "./sul";

export type Dizer = { product: MerchProduct; text: string; uf: string; context: string };

/** Real "<expression> | Dizeres" products that have an editorial context attached. Others are not shown. */
export function dizeresWithContext(merch: readonly MerchProduct[]): Dizer[] {
  const out: Dizer[] = [];
  for (const product of merch) {
    const m = /^(?<text>.+?)\s*\|\s*Dizeres$/i.exec(product.name.replace(/\s+/g, " ").trim());
    if (!m?.groups) continue;
    const ctx = DIZERES_CONTEXT[normalizeText(m.groups.text)];
    if (!ctx) continue;
    const state = STATE_NAMES[ctx.uf];
    out.push({ product, text: m.groups.text.trim(), uf: ctx.uf, context: ctx.place ? `${ctx.place} · ${ctx.uf}` : state });
  }
  return out;
}
