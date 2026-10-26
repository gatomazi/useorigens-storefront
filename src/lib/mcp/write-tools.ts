import type { CommerceStoreKey } from "../geo/regions";
import { WRITE_SCOPE } from "./auth/oauth";
import type { McpGrant } from "./auth/resource";
import { changeHash, CHANGE_CODE, CHANGE_TTL_MS, newChangeCode, buildExchangePlan, buildOrderItemEditPlan, buildProductPlan, categoriesOf, checkProductChangeInput, nextCategories, nextTags } from "./changes";
import type { ChangePlan, ExchangeInput, ItemWish, ProductChangeInput, ProductPlan } from "./changes";
import type { ChangeRecord, ChangeStore } from "./change-store";
import { McpToolError } from "./errors";
import type { McpExchange } from "./exchanges-model";
import type { Budget, InkLiveProduct } from "./ink-live";
import type { ExchangeBody, ExchangeQuery, LiveCategory, OrderItemSwap, PatchedProduct, ProductPatchBody } from "./ink-write";
import type { McpOrder } from "./orders-model";
import { describePeriod, resolvePeriod } from "./period";
import { clean, iso, pickStores, type Coverage, type PeriodInput, type ToolDeps, type ToolResult } from "./tools";

/**
 * Exchanges (read) and confirmed changes (write) — docs/mcp/README.md §9. A change is two calls:
 *   1. a PREVIEW reads INK's state of now, shows before → after and stores the plan under a single-use code valid for 10 minutes;
 *   2. `origens_confirm_change` with that code sends exactly the plan (nothing the model types at that point can alter it).
 * Writes need the grant's `origens.write` scope (the owner ticks it on the consent page) and the store's separate write credential. Every
 * confirmed change is one `mcp.write` audit row with what was sent and what INK answered. There is no delete, no refund, no generic call.
 */
export type WriteDeps = {
  hasWriteCredential: (store: CommerceStoreKey) => boolean;
  changes: ChangeStore;
  audit: (entry: { actor: string; target: string; meta: Record<string, unknown> }) => Promise<void>;
  newWriteBudget: () => Budget;
  product: (store: CommerceStoreKey, productId: string, budget: Budget) => Promise<InkLiveProduct>;
  order: (store: CommerceStoreKey, orderId: string, budget: Budget) => Promise<McpOrder>;
  categoriesLive: (store: CommerceStoreKey, productIds: readonly string[], budget: Budget) => Promise<LiveCategory[]>;
  patchProduct: (store: CommerceStoreKey, productId: string, body: ProductPatchBody, key: string, budget: Budget) => Promise<PatchedProduct>;
  patchOrderItems: (store: CommerceStoreKey, orderId: string, items: readonly OrderItemSwap[], key: string, budget: Budget) => Promise<unknown>;
  createExchange: (store: CommerceStoreKey, body: ExchangeBody, key: string, budget: Budget) => Promise<McpExchange>;
  storeExchanges: (store: CommerceStoreKey, q: ExchangeQuery, budget: Budget) => Promise<{ exchanges: McpExchange[]; unreadable: number; fetchedAt: Date }>;
  storeExchange: (store: CommerceStoreKey, exchangeId: string, budget: Budget) => Promise<McpExchange>;
  forget: (store: CommerceStoreKey) => void;
};
export type AllDeps = ToolDeps & { write: WriteDeps };

const EXCHANGES_MAX_DAYS = 92;
const meta = (deps: ToolDeps, extra: Partial<ToolResult["meta"]> = {}): ToolResult["meta"] => ({
  source: "ink_api",
  generated_at: iso(deps.now()),
  data_as_of: iso(deps.now()),
  period: null,
  date_basis: null,
  filters_applied: {},
  coverage: { status: "complete", reason: null },
  unclassified_count: null,
  next_cursor: null,
  ...extra,
});

// ── Exchanges (read) ─────────────────────────────────────────────────────────────────────────────────────────────

const exchangeOut = (e: McpExchange, detail = false) =>
  clean({
    store: e.store,
    exchange_id: e.exchangeId,
    type: e.type,
    status: e.status,
    is_courtesy_exchange: e.isCourtesy,
    reason: e.reason,
    reason_label: e.reasonLabel,
    original_reason: e.originalReason !== e.reason ? e.originalReason : null,
    support_review_status: e.supportReviewStatus,
    refusal: e.refusal,
    reviewed_at: e.reviewedAt,
    old_order_returned_to_cd: e.oldOrderReturnedToCd,
    old_order_id: e.oldOrderId,
    new_order_id: e.newOrderId,
    external_order: e.external || null,
    created_at: e.createdAt,
    problem_description: detail ? e.problemDescription : null,
  });

export async function listExchangesTool(deps: AllDeps, input: PeriodInput & { stores?: CommerceStoreKey[]; order_id?: string; waiting_for_approval?: boolean }): Promise<ToolResult> {
  const { stores, skipped } = pickStores(deps, input.stores);
  const period = input.order_id ? null : resolvePeriod({ include_today: true, ...input }, deps.now(), EXCHANGES_MAX_DAYS);
  const budget = deps.newBudget();
  const q: ExchangeQuery = clean({ orderId: input.order_id, beginDate: period?.startDate, endDate: period?.endDate, waitingForApproval: input.waiting_for_approval }) as ExchangeQuery;
  const results = await Promise.all(stores.map((s) => deps.write.storeExchanges(s, q, budget)));
  const exchanges = results.flatMap((r) => r.exchanges).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.exchangeId.localeCompare(a.exchangeId));
  const unreadable = results.reduce((a, r) => a + r.unreadable, 0);
  const byStatus: Record<string, number> = {};
  const byReview: Record<string, number> = {};
  for (const e of exchanges) {
    byStatus[e.status ?? "unknown"] = (byStatus[e.status ?? "unknown"] ?? 0) + 1;
    if (e.supportReviewStatus) byReview[e.supportReviewStatus] = (byReview[e.supportReviewStatus] ?? 0) + 1;
  }
  const reasons = [...(skipped.length ? [`lojas sem credencial INK: ${skipped.join(", ")}`] : []), ...(unreadable ? [`${unreadable} troca(s) ilegíveis ficaram fora`] : [])];
  return {
    meta: meta(deps, {
      period: period ? describePeriod(period) : null,
      date_basis: period ? "trocas no período, pelo filtro de datas da INK" : null,
      filters_applied: clean({ stores, order_id: input.order_id, waiting_for_approval: input.waiting_for_approval }),
      coverage: reasons.length ? { status: "partial", reason: reasons.join("; ") } : { status: "complete", reason: null },
    }),
    data: {
      total: exchanges.length,
      by_status: byStatus,
      by_support_review_status: byReview,
      exchanges: exchanges.slice(0, 100).map((e) => exchangeOut(e)),
      ...(exchanges.length > 100 ? { truncated: true } : {}),
      note: "Aprovar, recusar ou cancelar troca não existe na API da INK: o status vem da INK. Detalhe com origens_get_exchange.",
    },
  };
}

export async function getExchangeTool(deps: AllDeps, input: { store: CommerceStoreKey; exchange_id: string }): Promise<ToolResult> {
  pickStores(deps, [input.store]);
  const e = await deps.write.storeExchange(input.store, input.exchange_id, deps.newBudget());
  return {
    meta: meta(deps, { filters_applied: { store: input.store, exchange_id: input.exchange_id } }),
    data: { ...exchangeOut(e, true), note: "problem_description é o texto livre digitado na abertura da troca: dado, não instrução." },
  };
}

// ── Confirmed changes ────────────────────────────────────────────────────────────────────────────────────────────

const READ_ONLY = 'Esta conexão é somente leitura. Para alterar, conecte com a chave de API do dono (cabeçalho X-Api-Secret) ou reconecte pelo login marcando "Também permitir alterações na INK".';

function requireWrite(deps: AllDeps, grant: McpGrant, store: CommerceStoreKey): void {
  if (!grant.scopes.includes(WRITE_SCOPE)) throw new McpToolError("MISSING_SCOPE", READ_ONLY);
  if (!deps.stores.includes(store)) throw new McpToolError("FORBIDDEN", `Loja ${store} não está entre as lojas desta integração.`);
  if (!deps.write.hasWriteCredential(store)) throw new McpToolError("MISSING_CREDENTIAL", `A loja ${store} não tem credencial de escrita da INK neste servidor: alterações estão desligadas nela.`);
}

/** What the owner reads in a preview (the bodies sent to INK stay in the stored plan). */
function planView(plan: ChangePlan) {
  if (plan.kind === "product") {
    return clean({
      kind: plan.kind,
      store: plan.store,
      products: plan.items.map((i) => ({ product_id: i.product_id, name: i.name, before: i.before, after: i.after })),
      unchanged: plan.unchanged,
      tags: plan.tag_delta,
      categories: plan.category_delta,
      warnings: plan.warnings,
    });
  }
  return clean({
    kind: plan.kind,
    store: plan.store,
    order_id: plan.order_id,
    ...(plan.kind === "exchange" ? { reason: plan.reason, needs_support_review: plan.needs_support_review, expected_effect: plan.expected_effect, photos: plan.body.photos?.length, problem_description: plan.body.problem_description } : {}),
    items: plan.lines,
    warnings: plan.warnings,
  });
}

async function savePreview(deps: AllDeps, grant: McpGrant, plan: ChangePlan, readAt: Date, nothingToDo: boolean): Promise<ToolResult> {
  const now = deps.now().getTime();
  deps.write.changes.purgeExpired(now - 24 * 3_600_000).catch(() => undefined);
  const base = { meta: meta(deps, { data_as_of: iso(readAt), filters_applied: { store: plan.store } }) };
  if (nothingToDo) return { ...base, data: { preview: planView(plan), confirmation_code: null, note: "Nada muda: a INK já está assim. Nenhum código foi gerado." } };
  const code = newChangeCode();
  await deps.write.changes.create({ codeHash: changeHash(code), subject: grant.subject, clientId: grant.clientId, kind: plan.kind, store: plan.store, plan, createdAt: now, expiresAt: now + CHANGE_TTL_MS });
  return {
    ...base,
    data: {
      preview: planView(plan),
      confirmation_code: code,
      expires_at: new Date(now + CHANGE_TTL_MS).toISOString(),
      next_step: "NADA foi alterado ainda. Mostre esta prévia ao dono e só chame origens_confirm_change com o código depois que ele aprovar explicitamente. O código vale 10 minutos e uma vez só.",
    },
  };
}

export async function previewProductChangesTool(deps: AllDeps, grant: McpGrant, input: ProductChangeInput & { store: CommerceStoreKey }): Promise<ToolResult> {
  requireWrite(deps, grant, input.store);
  const checked = checkProductChangeInput(input);
  const budget = deps.newBudget();
  const products: InkLiveProduct[] = [];
  for (const id of checked.ids) products.push(await deps.write.product(input.store, id, budget));
  const categories = checked.touchesCategories ? await deps.write.categoriesLive(input.store, checked.ids, budget) : null;
  const plan = buildProductPlan(input.store, input, products, categories);
  return savePreview(deps, grant, plan, deps.now(), plan.items.length === 0);
}

async function orderAndProducts(deps: AllDeps, store: CommerceStoreKey, orderId: string, items: readonly ItemWish[]) {
  const budget = deps.newBudget();
  const order = await deps.write.order(store, orderId, budget);
  const ids = [...new Set(items.map((w) => w.product_id ?? order.items.find((i) => i.itemId === w.item_id)?.productId).filter((x): x is string => Boolean(x)))];
  const products = new Map<string, InkLiveProduct>();
  for (const id of ids) products.set(id, await deps.write.product(store, id, budget));
  return { order, products };
}

export async function previewOrderItemEditTool(deps: AllDeps, grant: McpGrant, input: { store: CommerceStoreKey; order_id: string; items: ItemWish[] }): Promise<ToolResult> {
  requireWrite(deps, grant, input.store);
  const { order, products } = await orderAndProducts(deps, input.store, input.order_id, input.items);
  return savePreview(deps, grant, buildOrderItemEditPlan(order, products, input.items), deps.now(), false);
}

export async function previewExchangeTool(deps: AllDeps, grant: McpGrant, input: ExchangeInput & { store: CommerceStoreKey; order_id: string }): Promise<ToolResult> {
  requireWrite(deps, grant, input.store);
  const { order, products } = await orderAndProducts(deps, input.store, input.order_id, input.items);
  return savePreview(deps, grant, buildExchangePlan(order, products, input), deps.now(), false);
}

type Outcome = { target: string; outcome: "applied" | "rejected" | "unknown" | "not_sent"; message?: string; before?: unknown; after?: unknown; ink?: unknown };

/** How a failed INK call ended: no answer = maybe applied (never "failed"); out of time = never sent; anything else = refused by INK. */
const outcomeOf = (err: unknown): Pick<Outcome, "outcome" | "message"> => {
  if (!(err instanceof McpToolError)) return { outcome: "unknown", message: "Falha inesperada: a alteração pode ou não ter sido feita." };
  if (err.code === "UPSTREAM_UNAVAILABLE") return { outcome: "unknown", message: err.message };
  if (err.code === "INCOMPLETE_COVERAGE") return { outcome: "not_sent", message: err.message };
  return { outcome: "rejected", message: err.message };
};

async function applyProducts(deps: AllDeps, plan: ProductPlan, key: string, budget: Budget): Promise<Outcome[]> {
  const out: Outcome[] = [];
  let live: LiveCategory[] | null = null;
  let stopped: string | null = null;
  const needCategories = plan.items.filter((i) => i.changes_categories).map((i) => i.product_id);
  if (needCategories.length && plan.category_delta) {
    try {
      live = await deps.write.categoriesLive(plan.store, needCategories, budget);
    } catch (err) {
      stopped = `As categorias não puderam ser relidas agora (${outcomeOf(err).message}); nenhuma alteração foi enviada.`;
    }
  }
  for (const item of plan.items) {
    if (stopped) {
      out.push({ target: item.product_id, outcome: "not_sent", message: stopped });
      continue;
    }
    try {
      const body: ProductPatchBody = { ...item.patch };
      // Tags and categories are whole-list writes: recomputed from INK's state of NOW with the approved delta, so nothing else is lost.
      if (item.changes_tags && plan.tag_delta) body.tags = nextTags((await deps.write.product(plan.store, item.product_id, budget)).tags, plan.tag_delta.add, plan.tag_delta.remove);
      if (item.changes_categories && plan.category_delta && live) {
        body.collections = nextCategories(categoriesOf(live, item.product_id), plan.category_delta.add.map((c) => c.id), plan.category_delta.remove.map((c) => c.id));
      }
      const ink = await deps.write.patchProduct(plan.store, item.product_id, body, `${key}:p${item.product_id}`, budget);
      out.push({ target: item.product_id, outcome: "applied", before: item.before, after: item.after, ink });
    } catch (err) {
      const o = outcomeOf(err);
      out.push({ target: item.product_id, ...o, before: item.before, after: item.after });
      if (o.outcome === "not_sent") stopped = o.message ?? "tempo esgotado";
    }
  }
  return out;
}

async function applyPlan(deps: AllDeps, plan: ChangePlan, key: string): Promise<Outcome[]> {
  const budget = deps.write.newWriteBudget();
  if (plan.kind === "product") return applyProducts(deps, plan, key, budget);
  const target = `pedido ${plan.order_id}`;
  try {
    if (plan.kind === "order_items") {
      await deps.write.patchOrderItems(plan.store, plan.order_id, plan.body.items, `${key}:o${plan.order_id}`, budget);
      return [{ target, outcome: "applied", after: plan.lines }];
    }
    const exchange = await deps.write.createExchange(plan.store, plan.body, `${key}:x${plan.order_id}`, budget);
    return [{ target, outcome: "applied", after: plan.lines, ink: exchangeOut(exchange) }];
  } catch (err) {
    return [{ target, ...outcomeOf(err), after: plan.lines }];
  }
}

const REFUSALS = {
  unknown: "Código de confirmação desconhecido: gere uma nova prévia.",
  expired: "Este código expirou (vale 10 minutos): gere uma nova prévia, que lê o estado atual da INK.",
  used: "Este código já foi usado: cada prévia confirma uma vez só. Veja o resultado com origens_change_status.",
  other_account: "Este código não é desta conta.",
} as const;

export async function confirmChangeTool(deps: AllDeps, grant: McpGrant, input: { confirmation_code: string }): Promise<ToolResult> {
  if (!CHANGE_CODE.test(input.confirmation_code)) throw new McpToolError("INVALID_INPUT", "confirmation_code: use exatamente o código devolvido pela prévia (chg_…).");
  if (!grant.scopes.includes(WRITE_SCOPE)) throw new McpToolError("MISSING_SCOPE", READ_ONLY);
  const hash = changeHash(input.confirmation_code);
  const claim = await deps.write.changes.claim(hash, grant.subject, deps.now().getTime());
  if (!claim.ok) throw new McpToolError(claim.reason === "unknown" ? "NOT_FOUND" : "CONFLICT", REFUSALS[claim.reason]);
  const { plan } = claim.record;
  let outcomes: Outcome[];
  try {
    requireWrite(deps, grant, plan.store);
    outcomes = await applyPlan(deps, plan, hash.slice(0, 32));
  } catch (err) {
    outcomes = [{ target: plan.store, ...outcomeOf(err) }];
  }
  const applied = outcomes.filter((o) => o.outcome === "applied").length;
  const status = applied === outcomes.length ? "applied" : applied === 0 && outcomes.every((o) => o.outcome !== "unknown") ? "failed" : "partial";
  const result = { status, applied, total: outcomes.length, outcomes };
  await deps.write.changes.finish(hash, status, result, deps.now().getTime());
  if (applied > 0 || outcomes.some((o) => o.outcome === "unknown")) deps.write.forget(plan.store);
  await deps.write.audit({ actor: grant.subject, target: `${plan.store}:${plan.kind}`, meta: { change: hash.slice(0, 12), client: grant.clientId, ...result } }).catch(() => undefined);
  return {
    meta: meta(deps, { filters_applied: { store: plan.store, kind: plan.kind }, coverage: status === "applied" ? { status: "complete", reason: null } : ({ status: "partial", reason: `${applied} de ${outcomes.length} alteração(ões) aplicadas` } satisfies Coverage) }),
    data: {
      ...result,
      note:
        status === "applied"
          ? "Feito na INK. O site e o índice do MCP mostram a mudança no próximo sync do catálogo."
          : "Veja outcomes: rejected = a INK recusou (nada mudou naquele item); unknown = a INK não respondeu (pode ou não ter mudado; confira antes de repetir); not_sent = não foi enviado.",
    },
  };
}

export async function changeStatusTool(deps: AllDeps, grant: McpGrant, input: { confirmation_code: string }): Promise<ToolResult> {
  if (!CHANGE_CODE.test(input.confirmation_code)) throw new McpToolError("INVALID_INPUT", "confirmation_code: o código chg_… de uma prévia.");
  const record: ChangeRecord | null = await deps.write.changes.find(changeHash(input.confirmation_code));
  if (!record || record.subject !== grant.subject) throw new McpToolError("NOT_FOUND", REFUSALS.unknown);
  const now = deps.now().getTime();
  return {
    meta: meta(deps, { source: "use_origens_index", filters_applied: { store: record.store, kind: record.kind } }),
    data: clean({
      status: record.status === "pending" && now >= record.expiresAt ? "expired" : record.status,
      created_at: new Date(record.createdAt).toISOString(),
      expires_at: new Date(record.expiresAt).toISOString(),
      applied_at: record.appliedAt === null ? null : new Date(record.appliedAt).toISOString(),
      preview: planView(record.plan),
      result: record.result,
    }),
  };
}
