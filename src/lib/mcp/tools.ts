import { familyById, type DesignFamilyId } from "../catalog/families";
import { discountPercent } from "../format";
import { localitiesOfRegion, localityById } from "../geo/localities";
import { REGIONS, STATE_NAMES, UF_TO_REGION, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { isOnSale, searchProducts, type ProductEntry, type ProductFilters, type ProductIndex } from "./catalog-index";
import { categoryKey, resolveCategories, searchCategories, type CategoryEntry, type CategoryFilters, type CategoryIndex } from "./categories";
import type { CatalogContext } from "./classify";
import { classifyProduct } from "./classify";
import { decodeCursor, page } from "./cursor";
import { McpToolError } from "./errors";
import type { Budget, InkLiveProduct, OrderQuery, StoreOrders } from "./ink-live";
import { money } from "./money";
import { KNOWN_ORDER_STATUSES, netUnits, type McpOrder } from "./orders-model";
import { describePeriod, inPeriod, resolvePeriod, TIME_ZONE, type Period } from "./period";
import { configuredRows, promotionUsage, type ConfiguredPromotions } from "./promotions";
import { fold, salesRanking, salesSummary, type CategoryMatcher, type CategoryTag, type CategoryVisibility, type ItemFilters, type RankDimension, type RankMetric } from "./sales";

/**
 * The ten read-only tools, as plain functions over injected dependencies (the route wires the real INK reader and catalog; tests wire
 * synthetic ones). Each returns `{ meta, data }`: `meta` is the provenance every answer must carry (source, generated_at, data_as_of,
 * period, date_basis, filters_applied, coverage, unclassified_count, next_cursor). "Not available" and "incomplete" are answers; a missing
 * number is never turned into a zero.
 */
export type ToolDeps = {
  now: () => Date;
  stores: readonly CommerceStoreKey[];
  hasCredential: (store: CommerceStoreKey) => boolean;
  catalog: () => { index: ProductIndex; ctx: CatalogContext };
  /** INK categories (collections snapshot); throws CATALOG_UNAVAILABLE when never synced. */
  categories: () => CategoryIndex;
  /** Coupons and promotions as published in the panel, per region. */
  promotions: () => ConfiguredPromotions;
  newBudget: () => Budget;
  storeOrders: (store: CommerceStoreKey, q: OrderQuery, budget: Budget) => Promise<StoreOrders>;
  storeOrder: (store: CommerceStoreKey, orderId: string, budget: Budget) => Promise<{ order: McpOrder; fetchedAt: Date }>;
  storeProduct: (store: CommerceStoreKey, productId: string, budget: Budget) => Promise<{ product: InkLiveProduct; fetchedAt: Date }>;
};

export type Coverage = { status: "complete" | "partial" | "unavailable"; reason: string | null };
export type Meta = {
  source: "ink_api" | "use_origens_index" | "ink_api+use_origens_index" | "use_origens_panel" | "ink_api+use_origens_panel";
  generated_at: string;
  data_as_of: string | null;
  period: ReturnType<typeof describePeriod> | null;
  date_basis: string | null;
  filters_applied: Record<string, unknown>;
  coverage: Coverage;
  unclassified_count: number | null;
  next_cursor: string | null;
};
export type ToolResult = { meta: Meta; data: Record<string, unknown> };

export const SALES_MAX_DAYS = 186;
export const ORDERS_MAX_DAYS = 92;
export const SALES_DATE_BASIS = "order_created_at (dia de São Paulo) com pagamento aprovado no momento da consulta";

export const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)));
export const iso = (d: Date) => d.toISOString();
const oldest = (dates: readonly Date[]) => (dates.length ? iso(new Date(Math.min(...dates.map((d) => d.getTime())))) : null);

// ── Shared input handling ────────────────────────────────────────────────────────────────────────────────────

export type PeriodInput = { start_date?: string; end_date?: string; last_days?: number; include_today?: boolean };
export type DesignFilterInput = { design_region?: RegionSlug; design_uf?: string; design_city?: string; design_locality_id?: string; family?: DesignFamilyId; product_id?: string; delivery_uf?: string; delivery_city?: string; category?: string; promotion_code?: string };

function checkUf(uf: string | undefined, field: string): string | undefined {
  if (uf === undefined) return undefined;
  const up = uf.toUpperCase();
  if (!STATE_NAMES[up]) throw new McpToolError("INVALID_INPUT", `${field}: UF fora das regiões da Use Origens (Sul, Norte, Centro-Oeste).`);
  return up;
}

/** A design city given by name needs its UF; given by id it must be a known locality. Ambiguity is an error, never a guess. */
export function resolveDesignLocality(input: { design_city?: string; design_locality_id?: string; design_uf?: string }): string | undefined {
  if (input.design_locality_id) {
    const l = localityById(input.design_locality_id);
    if (!l) throw new McpToolError("INVALID_INPUT", "design_locality_id desconhecido (use o id IBGE do município ou o id da Região Administrativa).");
    if (input.design_uf && l.uf !== input.design_uf.toUpperCase()) throw new McpToolError("INVALID_INPUT", "design_locality_id não é da design_uf informada.");
    return l.id;
  }
  if (!input.design_city) return undefined;
  const uf = checkUf(input.design_uf, "design_uf");
  if (!uf) throw new McpToolError("INVALID_INPUT", "design_city precisa de design_uf (há cidades com o mesmo nome em estados diferentes).");
  const matches = localitiesOfRegion(UF_TO_REGION[uf]).filter((l) => l.uf === uf && fold(l.name) === fold(input.design_city!));
  if (matches.length === 0) throw new McpToolError("INVALID_INPUT", `Cidade "${input.design_city}" não encontrada em ${uf}.`);
  if (matches.length > 1) throw new McpToolError("INVALID_INPUT", `Há mais de um lugar chamado "${input.design_city}" em ${uf}; use design_locality_id.`);
  return matches[0].id;
}

function itemFilters(input: DesignFilterInput): ItemFilters {
  const design_uf = checkUf(input.design_uf, "design_uf");
  const design_locality = resolveDesignLocality({ ...input, design_uf });
  if (input.design_region && design_uf && UF_TO_REGION[design_uf] !== input.design_region) throw new McpToolError("INVALID_INPUT", "design_uf não pertence à design_region informada.");
  return clean({
    design_region: input.design_region,
    design_uf,
    design_locality,
    family: input.family,
    product_id: input.product_id,
    delivery_uf: checkUf(input.delivery_uf, "delivery_uf"),
    delivery_city: input.delivery_city?.trim() || undefined,
    category: input.category?.trim() || undefined,
    promotion_code: input.promotion_code?.trim() || undefined,
  }) as ItemFilters;
}

const categoryTag = (e: CategoryEntry): CategoryTag => ({ key: categoryKey(e), label: `${e.name} · ${e.store}`, store: e.store, id: e.id, slug: e.slug, visibility: e.visibility });

/**
 * The category side of a sales question, built only when the question uses categories (the snapshot is not read otherwise). The sync matched
 * members against the catalog's city designs and merch only, so any other sold product (a garment sibling, a product delisted since) has an
 * UNKNOWN membership (`null`), as has every product of a store whose categories were never synced, or that still has categories recorded by an
 * older sync with only part of their members.
 */
function categoryMatcher(deps: ToolDeps, ref: string | undefined, stores: readonly CommerceStoreKey[], needed: boolean): CategoryMatcher | undefined {
  if (!ref && !needed) return undefined;
  const cats = deps.categories();
  const { index } = deps.catalog();
  const selected = ref ? new Set(resolveCategories(cats, ref, stores).map(categoryKey)) : undefined;
  const reliable = new Set(cats.stores.filter((s) => s.incomplete === 0).map((s) => s.store));
  return {
    selected,
    of: (store, productId) => {
      const k = `${store}:${productId}`;
      const entry = index.byKey.get(k);
      if (!entry || entry.kind === "garment_variant" || !reliable.has(store)) return null;
      return (cats.byProduct.get(k) ?? []).map(categoryTag);
    },
  };
}

/** Units whose category membership is unknown make a category answer partial: said in the coverage, never folded into "no category". */
function withCategoryCoverage(coverage: Coverage, cc: { units_membership_unknown: number; membership_unknown_share: number } | undefined): Coverage {
  if (!cc || cc.units_membership_unknown === 0) return coverage;
  const reason = `${cc.units_membership_unknown} unidade(s) (${Math.round(cc.membership_unknown_share * 1000) / 10}%) são de produtos fora do snapshot de categorias (outros modelos vendidos por link, produtos retirados): a categoria delas não é conhecida`;
  return { status: "partial", reason: coverage.reason ? `${coverage.reason}; ${reason}` : reason };
}

export function pickStores(deps: Pick<ToolDeps, "stores" | "hasCredential">, requested: readonly CommerceStoreKey[] | undefined): { stores: CommerceStoreKey[]; skipped: CommerceStoreKey[] } {
  if (requested && requested.length > 0) {
    for (const s of requested) {
      if (!deps.stores.includes(s)) throw new McpToolError("FORBIDDEN", `Loja ${s} não está entre as lojas desta integração.`);
      if (!deps.hasCredential(s)) throw new McpToolError("MISSING_CREDENTIAL", `A loja ${s} não tem credencial INK configurada neste servidor.`);
    }
    return { stores: [...new Set(requested)], skipped: [] };
  }
  const stores = deps.stores.filter((s) => deps.hasCredential(s));
  if (stores.length === 0) throw new McpToolError("MISSING_CREDENTIAL", "Nenhuma loja tem credencial INK configurada neste servidor.");
  return { stores, skipped: deps.stores.filter((s) => !deps.hasCredential(s)) };
}

async function ordersOfPeriod(deps: ToolDeps, stores: readonly CommerceStoreKey[], period: Period, extra: Omit<OrderQuery, "beginDate" | "endDate">) {
  const budget = deps.newBudget();
  const results = await Promise.all(stores.map((s) => deps.storeOrders(s, { ...period.inkRange, ...extra }, budget)));
  return { results, orders: results.flatMap((r) => r.orders), unreadable: results.reduce((a, r) => a + r.unreadable, 0), requests: budget.used, dataAsOf: oldest(results.map((r) => r.fetchedAt)), fromCache: results.every((r) => r.fromCache) };
}

function ordersCoverage(skipped: readonly CommerceStoreKey[], unreadable: number): Coverage {
  const reasons = [...(skipped.length ? [`lojas sem credencial INK, fora da soma: ${skipped.join(", ")}`] : []), ...(unreadable ? [`${unreadable} pedido(s) que a INK devolveu ilegíveis ficaram fora`] : [])];
  return { status: reasons.length ? "partial" : "complete", reason: reasons.length ? reasons.join("; ") : null };
}

// ── Tools ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function capabilities(deps: ToolDeps): Promise<ToolResult> {
  const now = deps.now();
  let catalog: { stores: ProductIndex["stores"]; garmentIndexPresent: boolean } | null = null;
  let catalogError: string | null = null;
  try {
    const { index } = deps.catalog();
    catalog = { stores: index.stores, garmentIndexPresent: index.garmentIndexPresent };
  } catch (err) {
    catalogError = err instanceof McpToolError ? err.message : "catálogo indisponível";
  }
  let categories: CategoryIndex["stores"] | null = null;
  try {
    categories = deps.categories().stores;
  } catch {
    // reported as null: the categories tools then answer CATALOG_UNAVAILABLE
  }
  return {
    meta: { source: "ink_api+use_origens_index", generated_at: iso(now), data_as_of: catalog ? oldest(catalog.stores.map((s) => new Date(s.syncedAt))) : null, period: null, date_basis: null, filters_applied: {}, coverage: catalogError ? { status: "partial", reason: catalogError } : { status: "complete", reason: null }, unclassified_count: null, next_cursor: null },
    data: {
      access: "Somente leitura. Nenhuma ferramenta altera a INK ou a Use Origens.",
      stores: deps.stores.map((s) => ({ store: s, region: Object.values(REGIONS).find((r) => r.storeKey === s)?.slug ?? null, ink_credential: deps.hasCredential(s) })),
      sources: {
        catalog: "Índice da Use Origens (snapshot do catálogo INK + índice de peças por cluster), atualizado pelos syncs do site; preços atuais da INK no momento do sync.",
        orders_and_sales: "API INK ao vivo a cada pergunta (sem base própria de pedidos), cache de 5 minutos por consulta.",
        categories: "Categorias (coleções) da INK por loja, do snapshot sincronizado pelo site: nome, visibilidade na INK e os produtos do catálogo que pertencem a cada uma.",
        promotions: "Cupons e promoções como publicados no painel da Use Origens (por região) + promotion_code e promotion_value dos pedidos da INK. A configuração das promoções dentro da INK (regra, valor) não é lida.",
      },
      catalog,
      categories,
      history: "Pedidos: o histórico que a API INK devolve para cada loja (filtro por dia de criação). Não há histórico de lojas antigas fora da INK.",
      limits: { sales_period_max_days: SALES_MAX_DAYS, orders_period_max_days: ORDERS_MAX_DAYS, list_limit_default: 20, list_limit_max: 100, ranking_limit_default: 10, ranking_limit_max: 50, ink_requests_per_question_max: 45, ink_pace_per_store: "1 requisição/s (a INK permite 100/min por loja, compartilhado com os syncs)" },
      definitions: {
        time_zone: TIME_ZONE,
        sales_universe: "Pedidos criados no período (dias de São Paulo, início e fim inclusivos) com pagamento \"Pago\" no momento da consulta. Excluídos e contados: não pagos, trocas (is_exchange), pedidos com total ≤ 0, duplicados de paginação.",
        units: "Unidades líquidas = quantidade − reembolsadas − brinde.",
        order_money: "Total do pedido = itens + frete − promoção − desconto de pagamento − freight_value_difference (identidade conferida em 400 pedidos reais). Repasse = kickback_value informado pela INK (não é lucro).",
        items_value: "Com filtro por item (estampa, UF, cidade, família, produto, destino): preço unitário × unidades líquidas, antes de promoção/desconto do pedido e sem frete.",
        design_vs_delivery: "Região/UF/cidade da ESTAMPA vêm da classificação do produto na Use Origens; cidade/UF de ENTREGA vêm do pedido. Loja comercial = origem do pedido, não a região da estampa.",
        unclassified: "Itens sem estampa reconhecida (merch, nome ambíguo, cidade não encontrada) ficam em unclassified com participação informada; nunca são atribuídos por aproximação.",
        campaign: "Não há atribuição de campanha nos pedidos da INK: estes dados não dizem qual anúncio gerou uma venda.",
        categories:
          "Categoria = coleção da INK (public = aparece na loja INK; internal = segmentação oculta). Um produto pode estar em várias, então os totais por categoria se sobrepõem. A pertença só é conhecida para estampas clássicas e merch do catálogo; outros modelos (Oversized, Body…) ficam como 'categoria desconhecida', nunca como 'sem categoria'.",
        promotions:
          "O painel descreve o cupom; a INK aplica. Status do painel (live, scheduled, ended, disabled) é o de agora. Uso = pedidos pagos do período com aquele promotion_code (sem diferenciar maiúsculas); promotion_discount = promotion_value informado pela INK. Pedido com cupom não prova que o cupom causou a venda.",
        on_sale: "Produto em promoção = preço promocional da INK abaixo do preço normal no último sync (list_price = preço normal; discount_percent truncado como na INK).",
      },
      tools: ["origens_capabilities", "origens_search_products", "origens_get_product", "origens_list_categories", "origens_promotions", "origens_sales_summary", "origens_sales_ranking", "origens_list_orders", "origens_get_order", "origens_list_exchanges", "origens_get_exchange", "origens_catalog_status"],
      write_tools: {
        tools: ["origens_preview_product_changes", "origens_preview_order_item_edit", "origens_preview_exchange", "origens_confirm_change", "origens_change_status"],
        available: "Só em conexões autorizadas com \"Também permitir alterações na INK\" e nas lojas com credencial de escrita.",
        rule: "Toda alteração é prévia (nada muda) → aprovação explícita do dono → origens_confirm_change com o código. Até 25 produtos por prévia; sem excluir, sem reembolso.",
      },
    },
  };
}

/** INK's own "% OFF" (truncated, as its page shows it), from cents. */
const discountOf = (price: number | null, list: number | null): number | undefined => (price === null || list === null ? undefined : discountPercent({ price: price / 100, listPrice: list / 100 }));

const productOut = (e: ProductEntry) =>
  clean({
    store: e.store,
    product_id: e.productId,
    kind: e.kind,
    visibility: e.visibility,
    name: e.name,
    family: e.family,
    design_uf: e.uf,
    design_region: e.designRegion,
    design_locality_id: e.localityKey,
    design_city: e.localityName,
    garment_type: e.garmentType,
    variant: e.designVariant && e.designVariant !== "base" ? e.designVariant : undefined,
    price: e.priceCents === null ? null : money(e.priceCents),
    list_price: e.listPriceCents === null ? undefined : money(e.listPriceCents),
    on_sale: isOnSale(e) || undefined,
    discount_percent: discountOf(e.priceCents, e.listPriceCents),
    url: e.url,
    cluster_id: e.clusterId,
  });

export async function searchProductsTool(deps: ToolDeps, input: ProductFilters & { category?: string; cursor?: string; limit?: number }): Promise<ToolResult> {
  const { index } = deps.catalog();
  const { cursor, limit = 20, category, ...filters } = input;
  const query = clean({ ...filters, uf: checkUf(filters.uf, "uf"), category: category?.trim() || undefined }) as ProductFilters & { category?: string };
  let all = searchProducts(index, query);
  if (query.category) {
    const members = new Set(resolveCategories(deps.categories(), query.category, query.store ? [query.store] : undefined).flatMap((c) => [...c.members].map((id) => `${c.store}:${id}`)));
    all = all.filter((e) => members.has(`${e.store}:${e.productId}`));
  }
  const offset = decodeCursor(cursor, query);
  const p = page(all, offset, limit, query);
  const syncs = index.stores.filter((s) => !query.store || s.store === query.store).map((s) => new Date(s.syncedAt));
  return {
    meta: { source: "use_origens_index", generated_at: iso(deps.now()), data_as_of: oldest(syncs), period: null, date_basis: null, filters_applied: query, coverage: { status: "complete", reason: null }, unclassified_count: null, next_cursor: p.next_cursor },
    data: {
      total_matches: all.length,
      products: p.items.map(productOut),
      note: `Preços atuais da INK no último sync do catálogo. Produtos sem classificação ficam fora desta busca: veja origens_catalog_status.${query.category ? " Com categoria, só entram estampas clássicas e merch: a pertença de outros modelos não é conhecida." : ""}`,
    },
  };
}

export async function getProductTool(deps: ToolDeps, input: { store: CommerceStoreKey; product_id: string; live?: boolean }): Promise<ToolResult> {
  pickStores(deps, [input.store]);
  const { index, ctx } = deps.catalog();
  const entry = index.byKey.get(`${input.store}:${input.product_id}`) ?? null;
  let live: InkLiveProduct | null = null;
  let liveAt: Date | null = null;
  let coverage: Coverage = { status: "complete", reason: null };
  if (input.live !== false) {
    try {
      const r = await deps.storeProduct(input.store, input.product_id, deps.newBudget());
      live = r.product;
      liveAt = r.fetchedAt;
    } catch (err) {
      if (!(err instanceof McpToolError)) throw err;
      if (err.code === "NOT_FOUND" && !entry) throw err;
      coverage = { status: "partial", reason: `Leitura ao vivo na INK falhou (${err.code}); dados do índice do último sync.` };
    }
  }
  if (!entry && !live) throw new McpToolError("NOT_FOUND", "Produto não encontrado no índice desta loja.");
  let categories: unknown = null;
  try {
    const known = entry && entry.kind !== "garment_variant";
    const list = known ? (deps.categories().byProduct.get(`${input.store}:${input.product_id}`) ?? []).map((c) => ({ category_id: c.id, name: c.name, slug: c.slug, visibility: c.visibility })) : null;
    categories = !list ? "desconhecida: só estampas clássicas e merch do catálogo têm a pertença sincronizada" : list.length ? list : "nenhuma no último sync de categorias";
  } catch (err) {
    if (!(err instanceof McpToolError)) throw err;
    categories = "indisponível: categorias da INK não sincronizadas neste servidor";
  }
  const design = classifyProduct(input.store, { id: input.product_id, name: live?.name ?? entry?.name ?? "", tags: live?.tags ?? [] }, ctx);
  return {
    meta: { source: live && entry ? "ink_api+use_origens_index" : live ? "ink_api" : "use_origens_index", generated_at: iso(deps.now()), data_as_of: liveAt ? iso(liveAt) : (entry?.syncedAt ?? null), period: null, date_basis: null, filters_applied: { store: input.store, product_id: input.product_id }, coverage, unclassified_count: design.status === "unclassified" ? 1 : 0, next_cursor: null },
    data: clean({
      index: entry ? productOut(entry) : null,
      in_index: Boolean(entry),
      classification: design.status === "classified" ? { status: "classified", via: design.via, design_uf: design.uf, design_region: design.region, design_locality_id: design.localityKey, design_city: design.localityName, family: design.family } : design,
      categories,
      live: live
        ? clean({
            name: live.name,
            status: live.status,
            approval_status: live.approvalStatus,
            visible_in_store: live.visibleInStore,
            price: live.priceCents === null ? null : money(live.priceCents),
            promotional_price: live.promotionalPriceCents === null ? undefined : money(live.promotionalPriceCents),
            discount_percent: discountOf(live.promotionalPriceCents, live.priceCents),
            product_type: live.productType,
            cluster_id: live.clusterId,
            url: live.storeProductUrl,
            image_url: live.imageUrl,
            updated_at: live.updatedAt,
            variants_count: live.variants.length,
            variants: live.variants.slice(0, 60),
            ...(live.variants.length > 60 ? { variants_truncated: true } : {}),
          })
        : null,
    }),
  };
}

export async function salesSummaryTool(deps: ToolDeps, input: PeriodInput & DesignFilterInput & { stores?: CommerceStoreKey[] }): Promise<ToolResult> {
  const period = resolvePeriod(input, deps.now(), SALES_MAX_DAYS);
  const filters = itemFilters(input);
  const { stores, skipped } = pickStores(deps, input.stores);
  const { ctx } = deps.catalog();
  const categories = categoryMatcher(deps, filters.category, stores, false);
  const fetched = await ordersOfPeriod(deps, stores, period, { paymentStatus: "paid" });
  const summary = salesSummary(fetched.orders, period, ctx, filters, categories);
  const coverage = withCategoryCoverage(ordersCoverage(skipped, fetched.unreadable), "category_coverage" in summary ? summary.category_coverage : undefined);
  return {
    meta: { source: "ink_api+use_origens_index", generated_at: iso(deps.now()), data_as_of: fetched.dataAsOf, period: describePeriod(period), date_basis: SALES_DATE_BASIS, filters_applied: { stores, ...filters }, coverage, unclassified_count: summary.design_coverage.unclassified_units, next_cursor: null },
    data: { ...summary, ink_requests: fetched.requests, from_cache: fetched.fromCache },
  };
}

const RANK_CRITERIA: Partial<Record<RankDimension, string>> = {
  category: "Pelas categorias (coleções da INK) do produto vendido: um produto em várias categorias conta em cada uma, então as linhas se sobrepõem e as participações não somam 100%.",
  model: "Pelo modelo da variante vendida, como a INK grava no pedido.",
  size: "Pelo tamanho da variante vendida, como a INK grava no pedido.",
  color: "Pela cor da variante vendida, como a INK grava no pedido.",
};

export async function salesRankingTool(
  deps: ToolDeps,
  input: PeriodInput & DesignFilterInput & { stores?: CommerceStoreKey[]; dimension: RankDimension; metric?: RankMetric; limit?: number; category_visibility?: CategoryVisibility },
): Promise<ToolResult> {
  const period = resolvePeriod(input, deps.now(), SALES_MAX_DAYS);
  const filters = itemFilters(input);
  const { stores, skipped } = pickStores(deps, input.stores);
  const { ctx } = deps.catalog();
  const categories = categoryMatcher(deps, filters.category, stores, input.dimension === "category");
  const fetched = await ordersOfPeriod(deps, stores, period, { paymentStatus: "paid" });
  const categoryVisibility = input.dimension === "category" ? (input.category_visibility ?? "public") : undefined;
  const ranking = salesRanking(fetched.orders, period, ctx, { dimension: input.dimension, metric: input.metric ?? "units", limit: input.limit ?? 10, filters, categories, categoryVisibility });
  const cc = "category_coverage" in ranking ? ranking.category_coverage : undefined;
  const criterion = RANK_CRITERIA[input.dimension] ?? (input.dimension.startsWith("design_") || input.dimension === "family" ? "Pela estampa do produto vendido (não pelo endereço de entrega)." : input.dimension.startsWith("delivery_") ? "Pelo endereço de entrega do pedido." : "Por produto/loja.");
  return {
    meta: { source: "ink_api+use_origens_index", generated_at: iso(deps.now()), data_as_of: fetched.dataAsOf, period: describePeriod(period), date_basis: SALES_DATE_BASIS, filters_applied: clean({ stores, ...filters, dimension: input.dimension, metric: input.metric ?? "units", category_visibility: categoryVisibility }), coverage: withCategoryCoverage(ordersCoverage(skipped, fetched.unreadable), cc), unclassified_count: ranking.design_coverage.unclassified_units, next_cursor: null },
    data: { ...ranking, criterion, ink_requests: fetched.requests },
  };
}

const categoryOut = (c: CategoryEntry) =>
  clean({
    store: c.store,
    category_id: c.id,
    name: c.name,
    slug: c.slug,
    visibility: c.visibility,
    position: c.position,
    products_in_catalog: c.productsInCatalog,
    city_designs: c.cityDesigns,
    merch: c.merch,
    reported_by_ink: c.reportedProducts,
    url: c.url,
    membership_complete: c.membershipComplete ? undefined : false,
  });

export async function listCategoriesTool(deps: ToolDeps, input: CategoryFilters & { cursor?: string; limit?: number }): Promise<ToolResult> {
  const cats = deps.categories();
  const { cursor, limit = 50, ...filters } = input;
  const query = clean(filters) as CategoryFilters;
  const all = searchCategories(cats, query);
  const p = page(all, decodeCursor(cursor, query), limit, query);
  const stores = cats.stores.filter((s) => !query.store || s.store === query.store);
  const missing = deps.stores.filter((s) => !cats.stores.some((x) => x.store === s));
  const incomplete = stores.filter((s) => s.incomplete > 0);
  const reasons = [...(missing.length && !query.store ? [`sem categorias sincronizadas: ${missing.join(", ")}`] : []), ...incomplete.map((s) => `${s.store}: ${s.incomplete} categoria(s) de um sync antigo, com só parte dos produtos (rodar collections:sync)`)];
  return {
    meta: { source: "use_origens_index", generated_at: iso(deps.now()), data_as_of: oldest(stores.map((s) => new Date(s.syncedAt))), period: null, date_basis: null, filters_applied: query, coverage: reasons.length ? { status: "partial", reason: reasons.join("; ") } : { status: "complete", reason: null }, unclassified_count: null, next_cursor: p.next_cursor },
    data: {
      total_matches: all.length,
      categories: p.items.map(categoryOut),
      stores: stores.map((s) => ({ store: s.store, synced_at: s.syncedAt, catalog_synced_at: s.catalogSyncedAt, categories: s.categories, public: s.public })),
      note: "products_in_catalog = estampas clássicas e merch do catálogo da loja que estão na categoria (a contagem útil); reported_by_ink conta também produtos ocultos e não publicados. Vendas por categoria: origens_sales_ranking com dimension=category.",
    },
  };
}

export async function promotionsTool(deps: ToolDeps, input: PeriodInput & { region?: RegionSlug; stores?: CommerceStoreKey[] }): Promise<ToolResult> {
  const now = deps.now();
  const config = deps.promotions();
  const configured = configuredRows(config, now.getTime(), input.region);
  const notes = [
    "O painel descreve o cupom ou a promoção; quem aplica é a INK. A configuração dentro da INK (regra, valor, limite) não é lida por este conector.",
    "status é o de agora (live, scheduled, ended, disabled): o painel não guarda quando um item esteve ligado.",
    ...(config.source === "seed" ? ["Nada publicado no painel ainda: sem cupons configurados."] : []),
  ];
  const wantsUsage = input.start_date !== undefined || input.end_date !== undefined || input.last_days !== undefined;
  if (!wantsUsage) {
    return {
      meta: { source: "use_origens_panel", generated_at: iso(now), data_as_of: config.asOf, period: null, date_basis: null, filters_applied: clean({ region: input.region }), coverage: { status: "complete", reason: null }, unclassified_count: null, next_cursor: null },
      data: { configured, usage: null, notes: [...notes, "Para ver o uso dos códigos nos pedidos, passe last_days ou start_date/end_date."] },
    };
  }
  const period = resolvePeriod(input, now, SALES_MAX_DAYS);
  const { stores, skipped } = pickStores(deps, input.stores ?? (input.region ? [REGIONS[input.region].storeKey] : undefined));
  const fetched = await ordersOfPeriod(deps, stores, period, { paymentStatus: "paid" });
  const usage = promotionUsage(fetched.orders, period, config, stores, now.getTime());
  return {
    meta: { source: "ink_api+use_origens_panel", generated_at: iso(now), data_as_of: fetched.dataAsOf, period: describePeriod(period), date_basis: SALES_DATE_BASIS, filters_applied: clean({ region: input.region, stores }), coverage: ordersCoverage(skipped, fetched.unreadable), unclassified_count: null, next_cursor: null },
    data: {
      configured,
      usage,
      notes: [
        ...notes,
        "Pedido com cupom não prova que o cupom causou a venda: o ticket com e sem código é uma comparação, não um efeito.",
        "Promoção sem código (ex.: frete grátis automático) não aparece por código; um desconto da INK sem código entra em without_code.orders_with_promotion_discount.",
        "Para as estampas ou produtos vendidos com um cupom: origens_sales_ranking com promotion_code.",
      ],
      ink_requests: fetched.requests,
    },
  };
}

const orderSummary = (o: McpOrder) =>
  clean({
    store: o.store,
    order_id: o.orderId,
    created_at: o.createdAt,
    order_status: o.orderStatus,
    order_status_label: o.orderStatusLabel,
    payment_status: o.paymentStatusLabel,
    is_exchange: o.isExchange || undefined,
    units: o.items.reduce((a, i) => a + netUnits(i), 0),
    total: o.totalCents === null ? null : money(o.totalCents),
    production_deadline: o.delivery.productionDeadline,
    production_delayed: o.delivery.productionDelayed,
    estimated_delivery_date: o.delivery.estimatedDeliveryDate,
    delivery_delayed: o.delivery.deliveryDelayed,
    delivered_at: o.delivery.deliveredAt,
    destination_uf: o.destination.uf,
  });

export async function listOrdersTool(
  deps: ToolDeps,
  input: PeriodInput & { stores?: CommerceStoreKey[]; order_status?: string; payment_status?: string; production_delayed?: boolean; delivery_delayed?: boolean; cursor?: string; limit?: number },
): Promise<ToolResult> {
  const period = resolvePeriod({ include_today: true, ...input }, deps.now(), ORDERS_MAX_DAYS);
  const { stores, skipped } = pickStores(deps, input.stores);
  const fetched = await ordersOfPeriod(deps, stores, period, clean({ paymentStatus: input.payment_status, orderStatus: input.order_status }) as Omit<OrderQuery, "beginDate" | "endDate">);
  const matching = fetched.orders
    .filter((o) => inPeriod(o.createdAt, period))
    .filter((o) => (input.production_delayed === undefined || o.delivery.productionDelayed === input.production_delayed) && (input.delivery_delayed === undefined || o.delivery.deliveryDelayed === input.delivery_delayed))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.store.localeCompare(b.store) || a.orderId.localeCompare(b.orderId));
  const query = { stores, period: describePeriod(period), order_status: input.order_status, payment_status: input.payment_status, production_delayed: input.production_delayed, delivery_delayed: input.delivery_delayed };
  const p = page(matching, decodeCursor(input.cursor, query), input.limit ?? 20, query);
  const byStatus: Record<string, number> = {};
  for (const o of matching) byStatus[o.orderStatus || "unknown"] = (byStatus[o.orderStatus || "unknown"] ?? 0) + 1;
  return {
    meta: { source: "ink_api", generated_at: iso(deps.now()), data_as_of: fetched.dataAsOf, period: describePeriod(period), date_basis: "order_created_at (dia de São Paulo); status atual informado pela INK", filters_applied: clean(query), coverage: ordersCoverage(skipped, fetched.unreadable), unclassified_count: null, next_cursor: p.next_cursor },
    data: {
      total_orders: matching.length,
      by_order_status: byStatus,
      production_delayed: matching.filter((o) => o.delivery.productionDelayed === true).length,
      delivery_delayed: matching.filter((o) => o.delivery.deliveryDelayed === true).length,
      orders: p.items.map(orderSummary),
      known_order_statuses: KNOWN_ORDER_STATUSES,
      note: "Atraso = o que a INK informa (production_delayed / delivery_delayed), não um cálculo nosso. Sem dados do comprador.",
      ink_requests: fetched.requests,
    },
  };
}

export async function getOrderTool(deps: ToolDeps, input: { store: CommerceStoreKey; order_id: string }): Promise<ToolResult> {
  pickStores(deps, [input.store]);
  const { ctx } = deps.catalog();
  const { order: o, fetchedAt } = await deps.storeOrder(input.store, input.order_id, deps.newBudget());
  let unclassifiedItems = 0;
  const items = o.items.map((i) => {
    const d = classifyProduct(o.store, { id: i.productId, name: i.productName, tags: i.productTags }, ctx);
    if (d.status === "unclassified") unclassifiedItems++;
    return clean({
      item_id: i.itemId,
      product_id: i.productId,
      product_name: i.productName,
      sku: i.sku,
      variant_id: i.variant.id,
      model: i.variant.model,
      color: i.variant.color,
      size: i.variant.size,
      quantity: i.quantity,
      refunded_quantity: i.refundedQuantity || undefined,
      free_quantity: i.freeQuantity || undefined,
      unit_value: i.unitValueCents === null ? null : money(i.unitValueCents),
      total_value: i.totalValueCents === null ? null : money(i.totalValueCents),
      produced: i.produced,
      design: d.status === "classified" ? clean({ design_uf: d.uf, design_city: d.localityName, family: d.family ? (familyById(d.family)?.name ?? d.family) : null }) : { unclassified: d.reason },
    });
  });
  const m = (c: number | null) => (c === null ? null : money(c));
  return {
    meta: { source: "ink_api+use_origens_index", generated_at: iso(deps.now()), data_as_of: iso(fetchedAt), period: null, date_basis: null, filters_applied: { store: input.store, order_id: input.order_id }, coverage: { status: "complete", reason: null }, unclassified_count: unclassifiedItems, next_cursor: null },
    data: clean({
      store: o.store,
      order_id: o.orderId,
      created_at: o.createdAt,
      order_status: o.orderStatus,
      order_status_label: o.orderStatusLabel,
      payment_status: o.paymentStatusLabel,
      is_exchange: o.isExchange,
      exchange: { items_editable: o.itemsEditable, exchangeable: o.exchangeable, how: o.itemsEditable ? "antes da fábrica: trocar o item no pedido (origens_preview_order_item_edit)" : o.exchangeable ? "abrir troca (origens_preview_exchange)" : "a INK não aceita edição nem troca agora" },
      totals: { total: m(o.totalCents), shipping: m(o.shippingCents), promotion_discount: m(o.promotionCents), payment_discount: m(o.paymentDiscountCents), freight_value_difference: m(o.freightDifferenceCents), store_payout_reported_by_ink: m(o.kickbackCents) },
      promotion_code: o.promotionCode,
      destination: o.destination,
      delivery: clean({
        carrier: o.delivery.carrier,
        current_status: o.delivery.currentStatus,
        production_deadline: o.delivery.productionDeadline,
        production_delayed: o.delivery.productionDelayed,
        estimated_delivery_date: o.delivery.estimatedDeliveryDate,
        delivery_delayed: o.delivery.deliveryDelayed,
        delivered_at: o.delivery.deliveredAt,
        tracking_code: o.delivery.trackingCode,
        last_events: o.delivery.lastEvents,
      }),
      items,
      note: "Sem nome, documento, contato, endereço completo ou dados de pagamento do comprador.",
    }),
  };
}

function categoriesStatus(deps: ToolDeps, store: CommerceStoreKey | undefined, now: Date) {
  try {
    return deps
      .categories()
      .stores.filter((s) => !store || s.store === store)
      .map((s) => ({ ...s, sync_age_hours: Math.round(((now.getTime() - Date.parse(s.syncedAt)) / 3_600_000) * 10) / 10 }));
  } catch (err) {
    if (!(err instanceof McpToolError)) throw err;
    return err.message;
  }
}

export async function catalogStatusTool(deps: ToolDeps, input: { store?: CommerceStoreKey; include_unclassified?: boolean; cursor?: string; limit?: number }): Promise<ToolResult> {
  const { index } = deps.catalog();
  const stores = index.stores.filter((s) => !input.store || s.store === input.store);
  const missing = deps.stores.filter((s) => !index.stores.some((x) => x.store === s));
  let unclassified: { items: unknown[]; next_cursor: string | null; total: number } | null = null;
  if (input.include_unclassified) {
    const all = stores.flatMap((s) => (index.excluded.get(s.store) ?? []).map((e) => clean({ store: s.store, product_id: e.inkProductId, name: e.name, reason: e.reason, detail: e.detail })));
    const query = { store: input.store, include_unclassified: true };
    const p = page(all, decodeCursor(input.cursor, query), input.limit ?? 20, query);
    unclassified = { items: p.items, next_cursor: p.next_cursor, total: all.length };
  }
  const now = deps.now();
  return {
    meta: { source: "use_origens_index", generated_at: iso(now), data_as_of: oldest(stores.map((s) => new Date(s.syncedAt))), period: null, date_basis: null, filters_applied: clean({ store: input.store, include_unclassified: input.include_unclassified }), coverage: missing.length && !input.store ? { status: "partial", reason: `Sem snapshot para: ${missing.join(", ")}` } : { status: "complete", reason: null }, unclassified_count: stores.reduce((a, s) => a + s.excluded, 0), next_cursor: unclassified?.next_cursor ?? null },
    data: clean({
      stores: stores.map((s) => ({ ...s, sync_age_hours: Math.round(((now.getTime() - Date.parse(s.syncedAt)) / 3_600_000) * 10) / 10 })),
      garment_index_present: index.garmentIndexPresent,
      categories: categoriesStatus(deps, input.store, now),
      unclassified_products: unclassified,
      note: "excluded = produtos visíveis na INK que o indexador não conseguiu ligar a uma cidade/família (ficam fora do site). Classificações existentes não são reinterpretadas aqui.",
    }),
  };
}
