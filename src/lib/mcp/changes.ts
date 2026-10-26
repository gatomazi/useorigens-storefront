import { createHash, randomBytes } from "node:crypto";
import type { CommerceStoreKey } from "../geo/regions";
import { McpToolError } from "./errors";
import { EXCHANGE_REASONS, SUPPORT_REVIEW_REASONS, type ExchangeReason } from "./exchanges-model";
import type { InkLiveProduct } from "./ink-live";
import type { ExchangeBody, LiveCategory, OrderItemSwap, ProductPatchBody } from "./ink-write";
import { money, toCents, type Money } from "./money";
import type { McpOrder, McpOrderItem } from "./orders-model";
import { fold } from "./sales";

/**
 * Confirmed changes (docs/mcp/README.md §9), pure: input checks, variant choice and the plan a preview shows. Nothing here talks to INK;
 * `write-tools.ts` reads INK's state of now, builds a plan with these functions, stores it under a single-use confirmation code and, on
 * confirmation, sends exactly what the plan says. A plan never carries buyer data: an order appears by id, items by id, product and variant.
 */
export const MAX_PRODUCTS_PER_CHANGE = 25;
export const MAX_CATEGORY_REFS = 5;
export const MAX_TAGS_PER_LIST = 20;
export const MAX_PHOTOS = 5;
export const CHANGE_TTL_MS = 10 * 60_000;
export const PRICE = /^\d{1,5}\.\d{2}$/;
/** A price moving more than this (either way) is flagged in the preview. */
export const LARGE_PRICE_CHANGE = 0.3;

export const CHANGE_CODE = /^chg_[A-Za-z0-9_-]{16}$/;
export const newChangeCode = (): string => `chg_${randomBytes(12).toString("base64url")}`;
export const changeHash = (code: string): string => createHash("sha256").update(code).digest("hex");

const invalid = (message: string) => new McpToolError("INVALID_INPUT", message);
const short = (s: string | null, max = 160) => (s === null ? null : s.length > max ? `${s.slice(0, max)}…` : s);

// ── Products ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type ProductChangeInput = {
  product_ids: string[];
  price?: string;
  /** Sale price INK charges (normal price shown struck through); null ends the sale. */
  promotional_price?: string | null;
  visible_in_store?: boolean;
  name?: string;
  description?: string;
  tags_add?: string[];
  tags_remove?: string[];
  categories_add?: string[];
  categories_remove?: string[];
};

const cleanTags = (tags: readonly string[] | undefined, field: string): string[] => {
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || t.length > 60) throw invalid(`${field}: cada tag tem de 1 a 60 caracteres.`);
    if (!out.some((x) => fold(x) === fold(t))) out.push(t);
  }
  if (out.length > MAX_TAGS_PER_LIST) throw invalid(`${field}: no máximo ${MAX_TAGS_PER_LIST} tags por vez.`);
  return out;
};

/** What a product change asks, checked before any INK read. Returns the normalized ids and tag/category lists. */
export function checkProductChangeInput(input: ProductChangeInput) {
  const ids = [...new Set(input.product_ids)];
  if (ids.length === 0 || ids.length > MAX_PRODUCTS_PER_CHANGE) throw invalid(`Informe de 1 a ${MAX_PRODUCTS_PER_CHANGE} produtos por alteração.`);
  const tagsAdd = cleanTags(input.tags_add, "tags_add");
  const tagsRemove = cleanTags(input.tags_remove, "tags_remove");
  if (tagsAdd.some((t) => tagsRemove.some((r) => fold(r) === fold(t)))) throw invalid("A mesma tag não pode ser incluída e removida ao mesmo tempo.");
  const catsAdd = [...new Set((input.categories_add ?? []).map((c) => c.trim()).filter(Boolean))];
  const catsRemove = [...new Set((input.categories_remove ?? []).map((c) => c.trim()).filter(Boolean))];
  if (catsAdd.length > MAX_CATEGORY_REFS || catsRemove.length > MAX_CATEGORY_REFS) throw invalid(`No máximo ${MAX_CATEGORY_REFS} categorias para incluir e ${MAX_CATEGORY_REFS} para remover por alteração.`);
  if (input.price !== undefined && (!PRICE.test(input.price) || toCents(input.price)! <= 0)) throw invalid('price: valor em reais com ponto e duas casas, maior que zero (ex.: "109.90").');
  if (input.promotional_price !== undefined && input.promotional_price !== null && (!PRICE.test(input.promotional_price) || toCents(input.promotional_price)! <= 0)) throw invalid('promotional_price: valor em reais com ponto e duas casas, maior que zero (ex.: "89.90"), ou null para encerrar a promoção.');
  if (input.price !== undefined && input.promotional_price) {
    if (toCents(input.promotional_price)! >= toCents(input.price)!) throw invalid("promotional_price precisa ser menor que price.");
  }
  if (input.name !== undefined) {
    if (ids.length !== 1) throw invalid("name: renomeie um produto por vez.");
    if (!input.name.trim() || input.name.length > 200) throw invalid("name: de 1 a 200 caracteres.");
  }
  if (input.description !== undefined && input.description.length > 5000) throw invalid("description: no máximo 5000 caracteres.");
  const asks = input.price !== undefined || input.promotional_price !== undefined || input.visible_in_store !== undefined || input.name !== undefined || input.description !== undefined || tagsAdd.length + tagsRemove.length + catsAdd.length + catsRemove.length > 0;
  if (!asks) throw invalid("Nada a alterar: informe price, promotional_price, visible_in_store, name, description, tags_add/tags_remove ou categories_add/categories_remove.");
  return { ids, tagsAdd, tagsRemove, catsAdd, catsRemove, touchesCategories: catsAdd.length + catsRemove.length > 0 };
}

/** A category named by the owner, among the store's categories read live: id, slug or name; ambiguous or unknown is an error, never a guess. */
export function resolveLiveCategory(categories: readonly LiveCategory[], ref: string): LiveCategory {
  const found = /^\d{1,12}$/.test(ref) ? categories.filter((c) => String(c.id) === ref) : categories.filter((c) => c.slug === fold(ref) || fold(c.name) === fold(ref));
  if (found.length === 0) throw invalid(`Categoria "${ref}" não existe nesta loja. Veja origens_list_categories.`);
  if (found.length > 1) throw invalid(`Há ${found.length} categorias chamadas "${ref}" nesta loja: use o id (${found.map((c) => c.id).join(", ")}).`);
  return found[0];
}

/** Tags after the change: the current list (INK's order and spelling), minus the removed ones, plus the new ones at the end. */
export function nextTags(current: readonly string[], add: readonly string[], remove: readonly string[]): string[] {
  const kept = current.filter((t) => !remove.some((r) => fold(r) === fold(t)));
  return [...kept, ...add.filter((a) => !kept.some((t) => fold(t) === fold(a)))];
}

/** The product's categories after the change: exactly current ∪ add − remove, so a category nobody named is never touched. */
export function nextCategories(current: readonly number[], add: readonly number[], remove: readonly number[]): number[] {
  return [...new Set([...current.filter((id) => !remove.includes(id)), ...add])];
}

const sameSet = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x) => b.includes(x));
export const categoriesOf = (categories: readonly LiveCategory[], productId: string): number[] => categories.filter((c) => c.members.has(productId)).map((c) => c.id);

export type ProductPlanItem = {
  product_id: string;
  name: string;
  /** Sent as is on confirmation. `tags` and `collections` are NOT here: they are recomputed from INK's state at that moment. */
  patch: ProductPatchBody;
  changes_tags: boolean;
  changes_categories: boolean;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type ProductPlan = {
  kind: "product";
  store: CommerceStoreKey;
  items: ProductPlanItem[];
  unchanged: { product_id: string; name: string }[];
  tag_delta: { add: string[]; remove: string[] } | null;
  category_delta: { add: { id: number; name: string }[]; remove: { id: number; name: string }[] } | null;
  warnings: string[];
};

export function buildProductPlan(store: CommerceStoreKey, input: ProductChangeInput, products: readonly InkLiveProduct[], categories: readonly LiveCategory[] | null): ProductPlan {
  const checked = checkProductChangeInput(input);
  const catAdd = checked.catsAdd.map((r) => resolveLiveCategory(categories ?? [], r));
  const catRemove = checked.catsRemove.map((r) => resolveLiveCategory(categories ?? [], r));
  if (catAdd.some((a) => catRemove.some((r) => r.id === a.id))) throw invalid("A mesma categoria não pode ser incluída e removida ao mesmo tempo.");
  const nameOf = (id: number) => categories?.find((c) => c.id === id)?.name ?? String(id);
  const warnings: string[] = [];
  const items: ProductPlanItem[] = [];
  const unchanged: ProductPlan["unchanged"] = [];
  const newPrice = input.price !== undefined ? toCents(input.price) : null;
  const newPromo = input.promotional_price === undefined ? undefined : input.promotional_price === null ? null : toCents(input.promotional_price);

  for (const p of products) {
    const patch: ProductPatchBody = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (newPrice !== null && newPrice !== p.priceCents) {
      patch.price = input.price;
      before.price = p.priceCents === null ? null : money(p.priceCents);
      after.price = money(newPrice);
      if (p.priceCents && Math.abs(newPrice - p.priceCents) / p.priceCents > LARGE_PRICE_CHANGE) warnings.push(`${p.id}: o preço muda mais de ${LARGE_PRICE_CHANGE * 100}% (${money(p.priceCents).brl} → ${money(newPrice).brl}).`);
      if (newPromo === undefined && p.promotionalPriceCents !== null) warnings.push(`${p.id}: tem preço promocional ativo (${money(p.promotionalPriceCents).brl}), que continua valendo; para mudar ou encerrar, use promotional_price.`);
    }
    if (newPromo !== undefined && newPromo !== p.promotionalPriceCents) {
      const normal = newPrice ?? p.priceCents;
      if (newPromo !== null && normal !== null && newPromo >= normal) throw invalid(`${p.id}: promotional_price (${money(newPromo).brl}) precisa ser menor que o preço normal (${money(normal).brl}).`);
      patch.promotional_price = newPromo === null ? null : input.promotional_price;
      before.promotional_price = p.promotionalPriceCents === null ? null : money(p.promotionalPriceCents);
      after.promotional_price = newPromo === null ? null : money(newPromo);
    }
    if (input.visible_in_store !== undefined && input.visible_in_store !== p.visibleInStore) {
      patch.visible_in_store = input.visible_in_store;
      before.visible_in_store = p.visibleInStore;
      after.visible_in_store = input.visible_in_store;
      if (input.visible_in_store && p.approvalStatus && p.approvalStatus !== "approved") warnings.push(`${p.id}: a curadoria da INK está "${p.approvalStatus}"; publicado, pode não aparecer até ser aprovado.`);
    }
    if (input.name !== undefined && input.name.trim() !== p.name) {
      patch.name = input.name.trim();
      before.name = p.name;
      after.name = patch.name;
    }
    if (input.description !== undefined && input.description !== (p.description ?? "")) {
      patch.description = input.description;
      before.description = short(p.description);
      after.description = short(input.description);
    }
    const tagsAfter = nextTags(p.tags, checked.tagsAdd, checked.tagsRemove);
    const changesTags = (checked.tagsAdd.length > 0 || checked.tagsRemove.length > 0) && !sameSet(tagsAfter, p.tags);
    if (changesTags) {
      before.tags = p.tags;
      after.tags = tagsAfter;
    }
    let changesCategories = false;
    if (checked.touchesCategories && categories) {
      const current = categoriesOf(categories, p.id);
      const next = nextCategories(current, catAdd.map((c) => c.id), catRemove.map((c) => c.id));
      changesCategories = !sameSet(current, next);
      if (changesCategories) {
        before.categories = current.map(nameOf);
        after.categories = next.map(nameOf);
      }
    }
    if (Object.keys(patch).length === 0 && !changesTags && !changesCategories) unchanged.push({ product_id: p.id, name: p.name });
    else items.push({ product_id: p.id, name: p.name, patch, changes_tags: changesTags, changes_categories: changesCategories, before, after });
  }
  return {
    kind: "product",
    store,
    items,
    unchanged,
    tag_delta: checked.tagsAdd.length + checked.tagsRemove.length ? { add: checked.tagsAdd, remove: checked.tagsRemove } : null,
    category_delta: checked.touchesCategories ? { add: catAdd.map((c) => ({ id: c.id, name: c.name })), remove: catRemove.map((c) => ({ id: c.id, name: c.name })) } : null,
    warnings: [...new Set(warnings)],
  };
}

// ── Order items: variant choice ──────────────────────────────────────────────────────────────────────────────────

export type VariantWish = { variant_id?: string; size?: string; color?: string; model?: string };
export type ItemWish = VariantWish & { item_id: string; product_id?: string; quantity?: number };
type Variant = InkLiveProduct["variants"][number];

const variantText = (v: Pick<Variant, "model" | "color" | "size">) => [v.model, v.color, v.size].filter(Boolean).join(" / ") || "variante sem descrição";

/**
 * The variant asked for: by id, or by model/color/size where an attribute not given keeps the current item's (only `size: "G"` = same model
 * and color, size G). Exactly one available variant must match; otherwise the error lists what the product has.
 */
export function pickVariant(product: InkLiveProduct, current: Pick<McpOrderItem["variant"], "model" | "color" | "size"> | null, wish: VariantWish): Variant {
  const options = () => product.variants.filter((v) => v.isAvailable !== false).slice(0, 30).map(variantText).join("; ");
  if (wish.variant_id) {
    const v = product.variants.find((x) => x.id === wish.variant_id);
    if (!v) throw invalid(`A variante ${wish.variant_id} não é do produto ${product.id}. Disponíveis: ${options()}.`);
    if (v.isAvailable === false) throw invalid(`A variante ${variantText(v)} do produto ${product.id} está indisponível.`);
    return v;
  }
  const target = { model: wish.model ?? current?.model ?? null, color: wish.color ?? current?.color ?? null, size: wish.size ?? current?.size ?? null };
  const matches = product.variants.filter((v) => (["model", "color", "size"] as const).every((k) => target[k] === null || fold(v[k] ?? "") === fold(target[k]!)));
  if (matches.length === 0) throw invalid(`O produto ${product.id} não tem ${variantText(target)}. Disponíveis: ${options()}.`);
  const available = matches.filter((v) => v.isAvailable !== false);
  if (available.length === 0) throw invalid(`${variantText(target)} do produto ${product.id} está indisponível.`);
  if (available.length > 1) throw invalid(`Mais de uma variante combina com ${variantText(target)} no produto ${product.id}: informe model, color e size, ou variant_id. Opções: ${available.map((v) => `${v.id} (${variantText(v)})`).join("; ")}.`);
  return available[0];
}

export type SwapLine = {
  item_id: string;
  quantity: number;
  from: { product_id: string; product_name: string; model: string | null; color: string | null; size: string | null; unit_value: Money | null };
  to: { product_id: string; product_name: string; variant_id: string; model: string | null; color: string | null; size: string | null; price: Money | null };
};

/** Units of a line that are still the buyer's (refunded ones are not). */
const exchangeableUnits = (i: McpOrderItem) => Math.max(0, i.quantity - i.refundedQuantity);

function swapLines(order: McpOrder, products: ReadonlyMap<string, InkLiveProduct>, wishes: readonly ItemWish[], mustDiffer: boolean, withQuantity: boolean): { lines: SwapLine[]; warnings: string[] } {
  if (wishes.length === 0) throw invalid("Informe ao menos um item do pedido.");
  if (new Set(wishes.map((w) => w.item_id)).size !== wishes.length) throw invalid("Cada item do pedido aparece uma vez só.");
  const warnings: string[] = [];
  const lines = wishes.map((w) => {
    const item = order.items.find((i) => i.itemId === w.item_id);
    if (!item) throw invalid(`O item ${w.item_id} não é deste pedido. Itens: ${order.items.map((i) => `${i.itemId} (${i.productName}, ${variantText(i.variant)})`).join("; ")}.`);
    const productId = w.product_id ?? item.productId;
    const product = products.get(productId);
    if (!product) throw new McpToolError("NOT_FOUND", `Produto ${productId} não encontrado nesta loja.`);
    const sameProduct = productId === item.productId;
    const variant = pickVariant(product, item.variant, w);
    const sameVariant = sameProduct && (item.variant.id ? item.variant.id === variant.id : variantText(item.variant) === variantText(variant));
    if (mustDiffer && sameVariant) throw invalid(`O item ${w.item_id} já é ${product.name} ${variantText(variant)}: nada muda.`);
    const units = exchangeableUnits(item);
    const quantity = withQuantity ? (w.quantity ?? units) : item.quantity;
    if (withQuantity && (quantity < 1 || quantity > units)) throw invalid(`O item ${w.item_id} tem ${units} unidade(s) que podem ser trocadas; quantity vai de 1 a ${units}.`);
    const price = product.promotionalPriceCents !== null && product.priceCents !== null && product.promotionalPriceCents < product.priceCents ? product.promotionalPriceCents : product.priceCents;
    if (!withQuantity && item.unitValueCents !== null && price !== null && price !== item.unitValueCents && product.priceCents !== item.unitValueCents) {
      warnings.push(`Item ${w.item_id}: o novo produto custa ${money(price).brl} e o item foi vendido por ${money(item.unitValueCents).brl}; a INK só aceita troca por item de mesmo preço e pode recusar.`);
    }
    return {
      item_id: w.item_id,
      quantity,
      from: { product_id: item.productId, product_name: item.productName, model: item.variant.model, color: item.variant.color, size: item.variant.size, unit_value: item.unitValueCents === null ? null : money(item.unitValueCents) },
      to: { product_id: productId, product_name: product.name, variant_id: variant.id, model: variant.model, color: variant.color, size: variant.size, price: price === null ? null : money(price) },
    };
  });
  return { lines, warnings };
}

// ── Order item edit (before the factory) ────────────────────────────────────────────────────────────────────────

export type OrderItemEditPlan = { kind: "order_items"; store: CommerceStoreKey; order_id: string; lines: SwapLine[]; body: { items: OrderItemSwap[] }; warnings: string[] };

export function buildOrderItemEditPlan(order: McpOrder, products: ReadonlyMap<string, InkLiveProduct>, wishes: readonly ItemWish[]): OrderItemEditPlan {
  if (order.itemsEditable !== true) {
    throw new McpToolError(
      "CONFLICT",
      order.exchangeable === true
        ? `O pedido ${order.orderId} já saiu da janela de edição de itens, mas aceita troca: use origens_preview_exchange.`
        : `O pedido ${order.orderId} não aceita edição de itens agora (a INK informa items_editable=${String(order.itemsEditable)}).`,
    );
  }
  const { lines, warnings } = swapLines(order, products, wishes, true, false);
  return {
    kind: "order_items",
    store: order.store,
    order_id: order.orderId,
    lines,
    body: { items: lines.map((l) => ({ id: Number(l.item_id), product_v2_id: Number(l.to.product_id), product_variant_id: Number(l.to.variant_id) })) },
    warnings: [...warnings, "A edição troca a linha inteira do pedido (todas as unidades do item), sem abrir troca e sem custo de frete."],
  };
}

// ── Exchange ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type ExchangeInput = { reason: ExchangeReason; items: ItemWish[]; problem_description?: string; photo_urls?: string[] };
export type ExchangePlan = {
  kind: "exchange";
  store: CommerceStoreKey;
  order_id: string;
  reason: ExchangeReason;
  needs_support_review: boolean;
  expected_effect: string;
  lines: SwapLine[];
  body: ExchangeBody;
  warnings: string[];
};

/** Reasons that only make sense with a different variant or product; a defect may be replaced by the very same item. */
const MUST_DIFFER: ReadonlySet<ExchangeReason> = new Set(["larger_size", "smaller_size", "change_color", "change_print"]);

function checkPhotoUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw invalid(`photo_urls: "${raw.slice(0, 80)}" não é um endereço válido.`);
  }
  if (u.protocol !== "https:" || u.username || u.password || u.href.length > 500) throw invalid("photo_urls: só endereços https públicos (a INK baixa a foto), sem usuário/senha, até 500 caracteres.");
  return u.href;
}

export function buildExchangePlan(order: McpOrder, products: ReadonlyMap<string, InkLiveProduct>, input: ExchangeInput): ExchangePlan {
  if (!(EXCHANGE_REASONS as readonly string[]).includes(input.reason)) throw invalid(`reason: ${EXCHANGE_REASONS.join(", ")}.`);
  if (order.exchangeable !== true) {
    throw new McpToolError(
      "CONFLICT",
      order.itemsEditable === true
        ? `O pedido ${order.orderId} ainda está antes da fábrica: troque o item direto no pedido com origens_preview_order_item_edit (sem abrir troca).`
        : `O pedido ${order.orderId} não aceita troca agora (a INK informa exchangeable=${String(order.exchangeable)}: só antes da produção ou até 30 dias após a entrega).`,
    );
  }
  const needsSupport = SUPPORT_REVIEW_REASONS.has(input.reason);
  const description = input.problem_description?.trim() || undefined;
  if (description && description.length > 1000) throw invalid("problem_description: no máximo 1000 caracteres.");
  const photos = (input.photo_urls ?? []).map(checkPhotoUrl);
  if (photos.length > MAX_PHOTOS) throw invalid(`photo_urls: no máximo ${MAX_PHOTOS} fotos.`);
  if (needsSupport && (!description || photos.length === 0)) throw invalid(`O motivo ${input.reason} passa pela análise do suporte da INK: exige problem_description e ao menos uma foto (photo_urls, https).`);
  const { lines, warnings } = swapLines(order, products, input.items, MUST_DIFFER.has(input.reason), true);
  const delivered = Boolean(order.delivery.deliveredAt) || order.orderStatus === "delivered";
  const body: ExchangeBody = {
    original_order_id: Number(order.orderId),
    exchange_reason: input.reason,
    items: lines.map((l) => ({ old_item_id: Number(l.item_id), product_v2_id: Number(l.to.product_id), product_variant_id: Number(l.to.variant_id), quantity: l.quantity })),
    ...(description ? { problem_description: description } : {}),
    ...(photos.length ? { photos: photos.map((photo_url) => ({ photo_url })) } : {}),
  };
  return {
    kind: "exchange",
    store: order.store,
    order_id: order.orderId,
    reason: input.reason,
    needs_support_review: needsSupport,
    expected_effect: delivered
      ? "Pedido já entregue: a troca deve CONSUMIR o direito de troca do cliente (a INK decide e informa em is_courtesy_exchange)."
      : "Pedido antes da produção: a troca deve ser de CORTESIA, sem consumir o direito do cliente (a INK decide e informa em is_courtesy_exchange).",
    lines,
    body,
    warnings: [...warnings, ...(needsSupport ? ["A troca fica aguardando a análise do suporte da INK; aprovar ou recusar não é possível por aqui."] : [])],
  };
}

export type ChangePlan = ProductPlan | OrderItemEditPlan | ExchangePlan;
