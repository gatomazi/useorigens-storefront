/**
 * Form → configuration for the "Cupons e promoções" screen. Pure. The editor posts its rows as one JSON field (a list the owner adds to, removes from and
 * reorders); nothing here trusts it: every row is rebuilt field by field, dates typed in Brasília time become explicit instants, the order is the
 * list's order, and the result goes through the same strict validator the publisher uses (`validatePromotions`).
 */
import { fromBrasiliaInput, MAX_PROMOTIONS, PROMO_ID, validatePromotions, type PromotionItem, type PromotionsConfig, type PromotionType } from "../site-config/promotions";
import type { Scope } from "../site-config/schema";

/** One row as the editor holds it (all strings: half-typed values must survive a re-render). */
export type PromotionRow = {
  id: string;
  type: PromotionType;
  enabled: boolean;
  title: string;
  code: string;
  description: string;
  callout: string;
  badgeLabel: string;
  /** `datetime-local` values, Brasília time; "" = no limit. */
  startsAt: string;
  endsAt: string;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const str = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** A readable, unique id from the title ("Semana do Frete Grátis" → "semana-do-frete-gratis"), kept once given so analytics and diffs stay stable. */
export function promotionId(title: string, taken: ReadonlySet<string>): string {
  const base = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/, "") || "item";
  const start = /^[a-z0-9]/.test(base) ? base : `item-${base}`;
  let id = start;
  for (let n = 2; taken.has(id); n++) id = `${start}-${n}`;
  return id;
}

export function rowsToConfig(rows: unknown, scope: Scope): Parsed<PromotionsConfig> {
  if (!Array.isArray(rows)) return { ok: false, errors: ["Lista de cupons e promoções inválida. Recarregue a página e tente de novo."] };
  if (rows.length > MAX_PROMOTIONS) return { ok: false, errors: [`No máximo ${MAX_PROMOTIONS} itens por região.`] };
  const errors: string[] = [];
  const taken = new Set<string>(rows.map((r) => (r && typeof r === "object" ? str((r as Record<string, unknown>).id) : "")).filter((id) => PROMO_ID.test(id)));
  const seen = new Set<string>();
  const items: PromotionItem[] = rows.map((raw, i) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const type: PromotionType = r.type === "promotion" ? "promotion" : "coupon";
    const title = str(r.title);
    let id = str(r.id);
    if (!PROMO_ID.test(id) || seen.has(id)) id = promotionId(title, new Set([...taken, ...seen]));
    seen.add(id);
    const name = `Item ${i + 1}${title ? ` ("${title}")` : ""}`;
    const startsAt = fromBrasiliaInput(str(r.startsAt).replace(" ", "T"));
    const endsAt = fromBrasiliaInput(str(r.endsAt).replace(" ", "T"));
    if (startsAt === null) errors.push(`${name}: data de início inválida.`);
    if (endsAt === null) errors.push(`${name}: data de fim inválida.`);
    const item: PromotionItem = { id, type, enabled: r.enabled === true, title, description: str(r.description), order: i + 1 };
    const callout = str(r.callout);
    if (callout) item.callout = callout;
    if (type === "coupon") {
      item.code = str(r.code).replace(/\s+/g, "");
      const badge = str(r.badgeLabel);
      if (badge) item.badgeLabel = badge;
    }
    if (startsAt) item.startsAt = startsAt;
    if (endsAt) item.endsAt = endsAt;
    return item;
  });
  if (errors.length > 0) return { ok: false, errors };
  const checked = validatePromotions({ items }, scope);
  return checked.ok ? { ok: true, value: checked.value } : { ok: false, errors: checked.errors.map((e) => readablePromotionError(e, items)) };
}

/** `promotions.items[1].code: …` → `Item 2 ("LEVE MAIS"): o código …`, something the owner can act on. */
export function readablePromotionError(error: string, items: readonly Pick<PromotionItem, "title">[] = []): string {
  const m = /items\[(\d+)\]\.?(\w*)/.exec(error);
  if (!m) return error.includes("at most") ? `No máximo ${MAX_PROMOTIONS} itens por região.` : `Cupons e promoções: ${error.replace(/^[^:]*:\s*/, "")}`;
  const i = Number(m[1]);
  const title = items[i]?.title;
  const who = `Item ${i + 1}${title ? ` ("${title}")` : ""}`;
  const field = m[2];
  const say: Record<string, string> = {
    title: "o título precisa ter de 1 a 60 caracteres, em uma linha.",
    description: "a descrição precisa ter de 1 a 200 caracteres, em uma linha.",
    callout: "a chamada abaixo tem no máximo 160 caracteres, em uma linha (ou fica vazia).",
    badgeLabel: "o selo tem no máximo 24 caracteres (ou fica vazio).",
    code: "o código precisa ter de 2 a 40 letras, números, \"-\" ou \"_\", sem espaços.",
    endsAt: error.includes("after") ? "o fim precisa ser depois do início." : "data de fim inválida.",
    startsAt: "data de início inválida.",
  };
  return `${who}: ${say[field] ?? error.replace(/^[^:]*:\s*/, "")}`;
}
