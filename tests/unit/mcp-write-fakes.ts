import { memoryChangeStore } from "@/lib/mcp/change-store";
import { McpToolError } from "@/lib/mcp/errors";
import type { WriteDeps } from "@/lib/mcp/write-tools";

/** Write dependencies that record every call and never reach INK; each test overrides what it exercises. */
export function fakeWrite(over: Partial<WriteDeps> = {}): WriteDeps & { sent: { op: string; store: string; target: string; body: unknown; key: string }[]; audits: Record<string, unknown>[] } {
  const sent: { op: string; store: string; target: string; body: unknown; key: string }[] = [];
  const audits: Record<string, unknown>[] = [];
  const missing = async (): Promise<never> => {
    throw new McpToolError("NOT_FOUND", "A INK não encontrou o registro pedido nesta loja.");
  };
  return {
    sent,
    audits,
    hasWriteCredential: (s) => s === "use-sul",
    changes: memoryChangeStore(),
    audit: async (e) => void audits.push(e),
    newWriteBudget: () => ({ maxRequests: 70, used: 0, deadline: Date.now() + 110_000 }),
    product: missing,
    order: missing,
    categoriesLive: async () => [],
    patchProduct: async (store, productId, body, key) => {
      sent.push({ op: "patchProduct", store, target: productId, body, key });
      return { id: productId, name: null, price: body.price ?? null, visibleInStore: body.visible_in_store ?? null, approvalStatus: "approved" };
    },
    patchOrderItems: async (store, orderId, items, key) => {
      sent.push({ op: "patchOrderItems", store, target: orderId, body: items, key });
      return { orderId };
    },
    createExchange: async (store, body, key) => {
      sent.push({ op: "createExchange", store, target: String(body.original_order_id), body, key });
      return { store, exchangeId: "9001", type: "platform", status: "created", isCourtesy: false, reason: body.exchange_reason, reasonLabel: null, originalReason: null, supportReviewStatus: null, refusal: null, reviewedAt: null, oldOrderReturnedToCd: null, oldOrderId: String(body.original_order_id), newOrderId: "777001", external: false, createdAt: "2026-10-14T12:00:00-03:00", problemDescription: null };
    },
    storeExchanges: async () => ({ exchanges: [], unreadable: 0, fetchedAt: new Date() }),
    storeExchange: missing,
    forget: () => undefined,
    ...over,
  };
}
