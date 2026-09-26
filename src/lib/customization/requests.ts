import { createHash, createHmac } from "node:crypto";
import type { RegionSlug } from "../geo/regions";
import type { CommerceStoreKey } from "../geo/regions";
import type { ModelSnapshot, Values } from "./validate";

/**
 * Personalization REQUESTS: what a customer typed on a model's page, stored so the operation can act on it. A request is NOT an order and does not
 * travel to INK by itself: linking it to an INK order is a manual, audited step (see docs/admin/cms-hotpages-personalizacao-round.md, "Fronteira com a INK").
 */
export const REQUEST_STATUSES = ["submitted", "awaitingOrderLink", "inReview", "linkedToInkOrder", "fulfilled", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "Recebida",
  awaitingOrderLink: "Aguardando vínculo com o pedido",
  inReview: "Em análise",
  linkedToInkOrder: "Vinculada a um pedido da INK",
  fulfilled: "Concluída",
  cancelled: "Cancelada",
};
/** What the customer sees on the reference page: never internal detail. */
export const PUBLIC_STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "Solicitação recebida",
  awaitingOrderLink: "Solicitação recebida: aguardando o vínculo com a sua compra",
  inReview: "Em análise pela equipe",
  linkedToInkOrder: "Vinculada à sua compra",
  fulfilled: "Concluída",
  cancelled: "Cancelada",
};

/** Manual status changes an operator may make (linking an order is its own action and the only way into `linkedToInkOrder`). */
const NEXT: Record<RequestStatus, RequestStatus[]> = {
  submitted: ["awaitingOrderLink", "inReview", "cancelled"],
  awaitingOrderLink: ["inReview", "cancelled"],
  inReview: ["awaitingOrderLink", "fulfilled", "cancelled"],
  linkedToInkOrder: ["inReview", "fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: ["submitted"],
};
export const nextStatuses = (from: RequestStatus): RequestStatus[] => NEXT[from];
export const canLinkOrder = (from: RequestStatus): boolean => from === "submitted" || from === "awaitingOrderLink" || from === "inReview";

/** An INK order number as an operator would copy it: letters, digits and hyphens only, so nothing else can be smuggled in. */
export const ORDER_NUMBER = /^[A-Za-z0-9-]{3,40}$/;

export type RequestEvent = { at: string; actor: string; action: "created" | "status" | "linked" | "replaced"; detail?: string };
export type RequestRecord = {
  id: string;
  tokenHash: string;
  region: RegionSlug;
  customizerId: string;
  customizerSlug: string;
  customizerName: string;
  customizerVersion: number;
  /** The model as it was when the request was made: labels and limits stay with the request. */
  snapshot: ModelSnapshot;
  values: Values;
  status: RequestStatus;
  order: { store: CommerceStoreKey; number: string; linkedBy: string; linkedAt: string } | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  events: RequestEvent[];
};

export type NewRequest = {
  region: RegionSlug;
  idempotencyKey: string;
  tokenHash: string;
  snapshot: ModelSnapshot;
  values: Values;
  expiresAt: string;
  /** Token hash of an earlier request of the same region this one replaces (the customer edited and sent again): the old one becomes `cancelled`. */
  replacesTokenHash?: string;
};

export type RequestFilter = { region?: RegionSlug; status?: RequestStatus; customizerId?: string; q?: string };

export interface RequestStore {
  /** Idempotent by (region, idempotencyKey): a repeat returns the existing record with `duplicate: true` and creates nothing. */
  create(input: NewRequest): Promise<{ record: RequestRecord; duplicate: boolean }>;
  get(id: string): Promise<RequestRecord | null>;
  findByTokenHash(hash: string): Promise<RequestRecord | null>;
  list(filter: RequestFilter, limit: number, offset: number): Promise<{ rows: RequestRecord[]; total: number }>;
  setStatus(id: string, to: RequestStatus, actor: string, note?: string): Promise<{ ok: true; record: RequestRecord } | { ok: false; error: string }>;
  linkOrder(id: string, order: { store: CommerceStoreKey; number: string }, actor: string): Promise<{ ok: true; record: RequestRecord } | { ok: false; error: string }>;
  /** Removes the requests past their retention that no operator is still working on. Returns how many. */
  purgeExpired(now: Date): Promise<number>;
}

// ── The opaque reference ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The reference the customer keeps. Derived from the browser-generated idempotency key with a server secret (HMAC-SHA-256, 192 bits, base64url):
 * unguessable without the secret, and the SAME key always yields the same reference, which is what makes a double click or a retry harmless. Only its
 * SHA-256 is stored, so a database leak does not reveal usable references.
 */
export const tokenFor = (secret: string, region: string, idempotencyKey: string): string => createHmac("sha256", secret).update(`cz-ref:${region}:${idempotencyKey}`).digest("base64url").slice(0, 32);
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32}$/;

export function retentionDays(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CUSTOMIZATION_RETENTION_DAYS);
  return Number.isInteger(n) && n >= 7 && n <= 3650 ? n : 180;
}
export const expiryFrom = (now: Date, days: number): string => new Date(now.getTime() + days * 86_400_000).toISOString();

/** A short, non-secret way to talk about a request in the queue: the tail of its id. */
export const shortRef = (id: string): string => id.slice(-8);

/** How the INK handoff is configured. `verified` is reserved: no mechanism to attach a personalization to a paid order has been proven, so it is never reported. */
export type HandoffMode = "unavailable" | "manual" | "verified";
export function handoffMode(env: Record<string, string | undefined> = process.env): HandoffMode {
  const v = env.CUSTOMIZATION_HANDOFF;
  if (v === "unavailable") return "unavailable";
  return "manual"; // the default everywhere; "verified" is intentionally not honoured until an integration is proven and reviewed
}
