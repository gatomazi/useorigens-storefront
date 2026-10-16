import type { CommerceStoreKey } from "../geo/regions";

/**
 * INK exchange → what the MCP may show. Of the linked orders only their ids are kept (INK nests whole order objects, buyer included);
 * `problem_description` is the free text typed when the exchange was opened, shown only in the detail, as data and never as instructions.
 * INK decides approval (`status`, `support_review_status`): there is no API to approve, refuse or cancel an exchange.
 */
export type McpExchange = {
  store: CommerceStoreKey;
  exchangeId: string;
  type: string | null;
  status: string | null;
  isCourtesy: boolean | null;
  reason: string | null;
  reasonLabel: string | null;
  originalReason: string | null;
  supportReviewStatus: string | null;
  refusal: { code: string | null; label: string | null; reason: string | null; note: string | null } | null;
  reviewedAt: string | null;
  oldOrderReturnedToCd: boolean | null;
  oldOrderId: string | null;
  newOrderId: string | null;
  external: boolean;
  createdAt: string | null;
  problemDescription: string | null;
};

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
const id = (v: unknown): string | null => (typeof v === "number" && Number.isSafeInteger(v) ? String(v) : typeof v === "string" && /^\d{1,15}$/.test(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

export const EXCHANGE_REASONS = ["larger_size", "smaller_size", "change_color", "change_print", "incorrect_print_position", "defect_in_product", "print_quality", "other"] as const;
export type ExchangeReason = (typeof EXCHANGE_REASONS)[number];
/** Reasons INK sends to its support for approval: they require the problem description and at least one photo. */
export const SUPPORT_REVIEW_REASONS: ReadonlySet<ExchangeReason> = new Set(["defect_in_product", "incorrect_print_position", "print_quality"]);

export function parseExchange(raw: unknown, store: CommerceStoreKey): McpExchange | null {
  const e = rec(raw);
  const exchangeId = id(e.id);
  if (!exchangeId) return null;
  const refusal = { code: str(e.refusal_reason_code, 60), label: str(e.refusal_reason_label, 120), reason: str(e.refusal_reason, 300), note: str(e.refusal_note, 300) };
  const oldInternal = id(rec(e.old_order).id);
  const newInternal = id(rec(e.new_order).id);
  return {
    store,
    exchangeId,
    type: str(e.exchange_type, 40),
    status: str(e.status, 60),
    isCourtesy: bool(e.is_courtesy_exchange),
    reason: str(e.exchange_reason, 60),
    reasonLabel: str(e.exchange_reason_label, 120),
    originalReason: str(e.original_exchange_reason, 60),
    supportReviewStatus: str(e.support_review_status, 60),
    refusal: Object.values(refusal).some((v) => v !== null) ? refusal : null,
    reviewedAt: str(e.reviewed_at, 40),
    oldOrderReturnedToCd: bool(e.old_order_returned_to_cd),
    oldOrderId: oldInternal ?? id(rec(e.old_external_order).id),
    newOrderId: newInternal ?? id(rec(e.new_external_order).id),
    external: !oldInternal && Boolean(id(rec(e.old_external_order).id)),
    createdAt: str(e.created_at, 40),
    problemDescription: str(e.problem_description, 1000),
  };
}
