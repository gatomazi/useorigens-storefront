import { createHash, createHmac } from "node:crypto";
import type { CommerceStoreKey, RegionSlug } from "../geo/regions";
import { REGIONS } from "../geo/regions";
import type { ModelSnapshot, Values } from "./validate";

/**
 * Personalization REQUESTS: what a customer typed on a model's page, plus how to reach them. A request is NOT an order and nothing here talks to INK:
 * the team makes the print by hand, contacts the customer (WhatsApp or e-mail, by a person, after a click) and points them to the INK store to buy.
 * The CMS follows the REQUEST and the CONTACT, never the commercial order (see docs/admin/cms-hotpages-personalizacao-release-gate.md).
 */
export const REQUEST_STATUSES = ["received", "inCreation", "artReady", "customerContacted", "closed", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  received: "Recebida",
  inCreation: "Em criação",
  artReady: "Arte pronta",
  customerContacted: "Cliente contatado",
  closed: "Encerrada",
  cancelled: "Cancelada",
};
/** What the customer sees on the reference page: never internal detail, never a promise of a date. */
export const PUBLIC_STATUS_LABEL: Record<RequestStatus, string> = {
  received: "Solicitação recebida",
  inCreation: "Estamos preparando a sua estampa",
  artReady: "Estampa pronta: nossa equipe vai falar com você pelo contato informado",
  customerContacted: "Nossa equipe já entrou em contato pelo canal informado",
  closed: "Solicitação encerrada",
  cancelled: "Solicitação cancelada",
};

/** Statuses a request can be in while someone still has to act on it (received, being made, ready but the customer not yet told). */
export const OPEN_STATUSES: readonly RequestStatus[] = ["received", "inCreation", "artReady"];

/** Manual status changes an operator may make. `closed` and `cancelled` are administrative: neither says anything about a purchase. */
// "closed" is reachable directly from any open state: the whole creation-and-contact process sometimes happens off-system (the operator makes
// the art, talks to the customer, and only then opens the panel), so nothing forces a click through every intermediate step first. "closed" makes
// no factual claim about having contacted anyone (unlike "customerContacted", which still needs its own confirmation to be reached at all).
const NEXT: Record<RequestStatus, RequestStatus[]> = {
  received: ["inCreation", "closed", "cancelled"],
  inCreation: ["artReady", "closed", "received", "cancelled"],
  artReady: ["customerContacted", "closed", "inCreation", "cancelled"],
  customerContacted: ["closed", "artReady", "cancelled"],
  closed: ["inCreation"],
  cancelled: ["received"],
};
export const nextStatuses = (from: RequestStatus): RequestStatus[] => NEXT[from];

/**
 * Requests made before the manual-contact flow used other status names (they tracked an INK order). They are read tolerantly, without losing anything:
 * "awaiting link" and "submitted" were still untouched, "in review" was being worked, and the two order-based endings are administrative closings.
 */
const LEGACY_STATUS: Record<string, RequestStatus> = { submitted: "received", awaitingOrderLink: "received", inReview: "inCreation", linkedToInkOrder: "closed", fulfilled: "closed" };
export function normalizeStatus(raw: unknown): RequestStatus {
  if (typeof raw === "string") {
    if ((REQUEST_STATUSES as readonly string[]).includes(raw)) return raw as RequestStatus;
    if (raw in LEGACY_STATUS) return LEGACY_STATUS[raw];
  }
  return "received";
}

export type RequestEventAction = "created" | "status" | "replaced" | "note" | "product-link" | "linked";
/** `linked` only exists in history written before this flow; it is shown without the order number and never produced again. */
export type RequestEvent = { at: string; actor: string; action: RequestEventAction; detail?: string };

/** Who to talk to, as the customer typed it (normalised) and confirmed. Requests made before the contact form have none (`contact: null`). */
export type RequestContact = { name: string; whatsapp?: string; email?: string; confirmedAt: string; noticeVersion: string };
export type ProductLink = { url: string; setBy: string; setAt: string };

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
  contact: RequestContact | null;
  /** When an operator recorded that the customer was contacted (set by the status change, never inferred). */
  contactedAt: string | null;
  /** The INK product page prepared for this customer, typed by the team. A purchase orientation only: it is not tied to an order. */
  productLink: ProductLink | null;
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
  contact: RequestContact;
  expiresAt: string;
  /** Token hash of an earlier request of the same region this one replaces (the customer edited and sent again): the old one becomes `cancelled`. */
  replacesTokenHash?: string;
};

/** `q` looks at the reference, the customer's name, the model and the typed text (never the contact details). */
export type RequestFilter = { region?: RegionSlug; status?: RequestStatus; customizerId?: string; q?: string };

export interface RequestStore {
  /** Idempotent by (region, idempotencyKey): a repeat returns the existing record with `duplicate: true` and creates nothing. */
  create(input: NewRequest): Promise<{ record: RequestRecord; duplicate: boolean }>;
  get(id: string): Promise<RequestRecord | null>;
  findByTokenHash(hash: string): Promise<RequestRecord | null>;
  list(filter: RequestFilter, limit: number, offset: number): Promise<{ rows: RequestRecord[]; total: number }>;
  /** How many requests exist in total (every status) in these regions — for a badge that stays visible even once nothing is left open. */
  count(regions: readonly RegionSlug[]): Promise<number>;
  /** How many requests still wait for someone (see `OPEN_STATUSES`) in these regions. */
  countOpen(regions: readonly RegionSlug[]): Promise<number>;
  /** Moves the request along the allowed transitions. Reaching `customerContacted` records `contactedAt` (a person confirmed it). */
  setStatus(id: string, to: RequestStatus, actor: string, note?: string): Promise<{ ok: true; record: RequestRecord } | { ok: false; error: string }>;
  /** An internal note in the history (what was asked of the customer, what they answered). */
  addNote(id: string, actor: string, note: string): Promise<{ ok: true; record: RequestRecord } | { ok: false; error: string }>;
  /** Sets (or clears, with `null`) the product link; the URL must already have passed `productLinkFor`. */
  setProductLink(id: string, url: string | null, actor: string): Promise<{ ok: true; record: RequestRecord } | { ok: false; error: string }>;
  /** Removes the requests past their retention that nobody is still working on. Returns how many. */
  purgeExpired(now: Date): Promise<number>;
}

/** The store hosts a product link may point to, per region: ONLY that region's own INK store. */
const STORE_HOST: Record<CommerceStoreKey, string> = { "use-sul": "www.usesul.com.br", "use-norte": "www.usenorte.com.br", "use-centro": "www.usecentro.com.br", "use-origens": "loja.useorigens.com.br" };

/**
 * Validates the "product ready to buy" link an operator typed: https, no credentials or port, the host EXACTLY the region's INK store (so it can never
 * be a redirect to another site) and a sane length. Returns the normalised URL, or why it was refused.
 */
export function productLinkFor(region: RegionSlug, raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (text.length === 0 || text.length > 500 || /[\s<>"'\p{C}]/u.test(text)) return { ok: false, error: "Link inválido: cole o endereço completo da página do produto, sem espaços." };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "Link inválido: cole o endereço completo da página do produto." };
  }
  const host = STORE_HOST[REGIONS[region].storeKey];
  if (url.protocol !== "https:") return { ok: false, error: "O link precisa começar com https://." };
  if (url.username || url.password || url.port) return { ok: false, error: "O link não pode ter usuário, senha nem porta." };
  if (url.hostname !== host) return { ok: false, error: `O link precisa ser da loja INK de ${REGIONS[region].name} (${host}).` };
  url.hash = "";
  return { ok: true, url: url.toString() };
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
