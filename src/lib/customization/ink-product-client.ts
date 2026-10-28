import type { PrintArea } from "./ink-products";

/** What the flow reads of a product at INK. `url` may come null right after the creation (the docs' example); `imageUrl` arrives once the mockups are made. */
export type InkProductView = { id: string; url: string | null; imageUrl: string | null };

/**
 * A failed call to INK. `transient`: INK did not take it or may take it on a retry (network, 429, 5xx); the same Idempotency-Key makes the retry safe.
 * `indeterminate`: 409 for a key whose first attempt failed half-way: INK may or may not have created the product, so nobody may send a NEW key —
 * a person checks the store first (the 12/09 migration duplicated products exactly this way).
 */
export class InkRequestError extends Error {
  constructor(message: string, readonly status: number | null, readonly transient: boolean, readonly indeterminate = false) {
    super(message);
  }
}

export interface InkProductClient {
  /** False for the stand-in: nothing reaches INK. */
  readonly live: boolean;
  printableAreas(productTypeId: number): Promise<PrintArea[]>;
  createProduct(body: Record<string, unknown>, idempotencyKey: string): Promise<InkProductView>;
  getProduct(id: string): Promise<InkProductView>;
}

const view = (p: Record<string, unknown> | undefined): InkProductView => ({
  id: String(p?.id ?? ""),
  url: typeof p?.store_product_url === "string" ? p.store_product_url : null,
  imageUrl: typeof p?.main_image_url === "string" ? p.main_image_url : null,
});

/** The real INK API (`store.products.write`). Product types are cached for ten minutes: their print areas change only when INK adds a colour. */
export function realInkProductClient(token: string, base: string, fetchImpl: typeof fetch = fetch): InkProductClient {
  const types = new Map<number, { at: number; areas: PrintArea[] }>();
  async function call(method: "GET" | "POST", route: string, body?: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) Object.assign(headers, { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey ?? "" });
    let res: Response;
    try {
      res = await fetchImpl(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      throw new InkRequestError(`rede: ${e instanceof Error ? e.message : String(e)}`, null, true);
    }
    const text = await res.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { data = {}; }
    if (res.ok) return data;
    const detail = [((data.errors as unknown[]) ?? []).join("; "), typeof data.error === "string" ? data.error : ""].filter(Boolean).join(" ").slice(0, 200);
    const message = `${method} ${route.split("?")[0]} → ${res.status}${detail ? `: ${detail}` : ""}`;
    throw new InkRequestError(message, res.status, res.status === 429 || res.status >= 500, res.status === 409 && /idempot/i.test(text));
  }
  return {
    live: true,
    async printableAreas(productTypeId) {
      const cached = types.get(productTypeId);
      if (cached && Date.now() - cached.at < 10 * 60_000) return cached.areas;
      const data = await call("GET", "/v1/stores/product_types?per_page=100");
      const type = ((data.product_types as Record<string, unknown>[]) ?? []).find((t) => t.id === productTypeId);
      if (!type) throw new InkRequestError(`tipo de produto ${productTypeId} não encontrado na INK`, 200, false);
      const areas = (type.printable_areas as PrintArea[]) ?? [];
      types.set(productTypeId, { at: Date.now(), areas });
      return areas;
    },
    async createProduct(body, idempotencyKey) {
      const data = await call("POST", "/v1/stores/products", body, idempotencyKey);
      return view(data.product as Record<string, unknown>);
    },
    async getProduct(id) {
      const data = await call("GET", `/v1/stores/products/${encodeURIComponent(id)}`);
      return view((data.product as Record<string, unknown>) ?? data);
    },
  };
}

/** The Camiseta's 18 areas and the Camiseta Infantil's 6 as INK listed them on 27/10/2026, for the stand-in. */
const COLORS: Record<number, string[]> = {
  1: ["Vermelho", "Amarelo", "Rosa", "Branca", "Cinza", "Bordeaux", "Marinho", "Verde", "Preta"],
  2: ["Amarelo", "Branca", "Cinza", "Bordeaux", "Marinho", "Preta"],
};

/**
 * The stand-in used everywhere but production (and production without a token): nothing reaches INK. It answers like the 27/10 pilot did — the link
 * right away, after `createMs`, the photo `photoMs` later — so the waiting screen is tried with real timings. The same key returns the same product.
 */
export function fakeInkProductClient({ createMs = 30_000, photoMs = 20_000 }: { createMs?: number; photoMs?: number } = {}): InkProductClient {
  const made = new Map<string, { view: InkProductView; at: number }>();
  const byKey = new Map<string, string>();
  return {
    live: false,
    async printableAreas(productTypeId) {
      const colors = COLORS[productTypeId];
      if (!colors) throw new InkRequestError(`tipo de produto ${productTypeId} não encontrado na INK`, 200, false);
      const models = productTypeId === 1 ? ["Masculino", "Feminino"] : ["Infantil"];
      return models.flatMap((model, m) => colors.map((name, c) => ({ base_image_id: 1000 * productTypeId + 100 * m + c, color: { name }, model })));
    },
    async createProduct(_body, idempotencyKey) {
      const known = byKey.get(idempotencyKey);
      if (known) return made.get(known)!.view;
      await new Promise((r) => setTimeout(r, createMs));
      const id = String(9_000_000 + made.size + 1);
      const result = { id, url: `https://loja.useorigens.com.br/useorigens/product/teste-local-${id}`, imageUrl: null };
      made.set(id, { view: result, at: Date.now() });
      byKey.set(idempotencyKey, id);
      return result;
    },
    async getProduct(id) {
      const entry = made.get(id);
      if (!entry) throw new InkRequestError(`produto ${id} não encontrado`, 404, false);
      return Date.now() - entry.at >= photoMs ? { ...entry.view, imageUrl: "https://www.useorigens.com.br/personalizacao/camisetas/preta.webp" } : entry.view;
    },
  };
}
