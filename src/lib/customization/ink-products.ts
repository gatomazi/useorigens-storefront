import { createHash } from "node:crypto";
import type { RegionSlug } from "../geo/regions";
import { INK_COMMERCE_HOSTS } from "../ink/hosts";
import type { StudioGarment } from "../site-config/schema";
import { inkColorTakesDarkInk } from "./shirts";

/**
 * Direct purchase: a product created at INK for what the customer typed (e.g. the surname on one art), hidden from the store and sold by its link.
 * One row per (art version, typed values): the row is the job that makes the product and, once made, the product every later customer with the same
 * name reuses. INK has no DELETE, so a product is permanent: the owner sees them all in the panel.
 */
export const PRODUCT_STATUSES = ["queued", "creating", "photos", "ready", "failed", "check"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
/** No more work on these: ready (link known), failed (nothing created; can be queued again) or check (INK may have created it: a person looks). */
export const isTerminal = (s: ProductStatus): boolean => s === "ready" || s === "failed" || s === "check";

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  queued: "Na fila",
  creating: "Criando na INK",
  photos: "Gerando as fotos",
  ready: "Pronto",
  failed: "Falhou",
  check: "Conferir na INK",
};

/** INK product types (`product_type_id`): the adult Camiseta and the Camiseta Infantil (verified on 27/10/2026, GET /v1/stores/product_types). */
export const PRODUCT_TYPE: Record<StudioGarment, number> = { camiseta: 1, infantil: 2 };

export type ProductJob = {
  id: string;
  dedupeKey: string;
  region: RegionSlug;
  customizerId: string;
  customizerSlug: string;
  /** The product name at INK ("Silva | Natal em família Universitário"). */
  name: string;
  /** "Universitário", "Eu vim pela ceia · Infantil". */
  artLabel: string;
  fields: Record<string, string>;
  templateId: string;
  lightTemplateId: string | null;
  garment: StudioGarment;
  productTypeId: number;
  price: string;
  status: ProductStatus;
  inkProductId: string | null;
  inkUrl: string | null;
  inkImageUrl: string | null;
  /** Why it failed or needs a check, for the panel (never customer text). */
  error: string | null;
  attempts: number;
  leaseUntil: string | null;
  createdAt: string;
  updatedAt: string;
  inkCreatedAt: string | null;
  readyAt: string | null;
};

export type NewProductJob = Pick<ProductJob, "dedupeKey" | "region" | "customizerId" | "customizerSlug" | "name" | "artLabel" | "fields" | "templateId" | "lightTemplateId" | "garment" | "productTypeId" | "price">;
export type ProductJobPatch = Partial<Pick<ProductJob, "status" | "inkProductId" | "inkUrl" | "inkImageUrl" | "error" | "attempts" | "inkCreatedAt" | "readyAt">>;
export type ProductJobFilter = { region?: RegionSlug; status?: ProductStatus };

export interface ProductJobStore {
  /** Idempotent by `dedupeKey`: two customers typing the same name on the same art end on the same row (`created: false` for the second). */
  findOrCreate(input: NewProductJob): Promise<{ job: ProductJob; created: boolean }>;
  get(id: string): Promise<ProductJob | null>;
  /** Takes the job for `leaseMs` when nobody holds it and it is not terminal; null otherwise. Only the holder works on it. */
  claim(id: string, leaseMs: number, now?: Date): Promise<ProductJob | null>;
  /** Applies the patch; `release` also drops the lease. */
  update(id: string, patch: ProductJobPatch, opts?: { release?: boolean }): Promise<ProductJob | null>;
  list(filter: ProductJobFilter, limit: number, offset: number): Promise<{ rows: ProductJob[]; total: number }>;
  /** Jobs created since a moment (the daily ceiling of new products). */
  countCreatedSince(since: Date): Promise<number>;
}

/** Same art version + same typed values = same product. Field order and surrounding spaces do not matter; letter case does (it can show in the art). */
export function productJobKey(input: { region: RegionSlug; templateId: string; lightTemplateId: string | null; garment: StudioGarment; fields: Record<string, string> }): string {
  const fields = Object.keys(input.fields).sort().map((k) => [k, input.fields[k].trim()]);
  return createHash("sha256").update(JSON.stringify([input.region, input.templateId, input.lightTemplateId ?? "", input.garment, fields])).digest("hex");
}

/** "Silva | Natal em família Universitário": what was typed, then the model and the art (INK shows it as the product title; the slug follows it). */
export function productName(fields: Record<string, string>, modelName: string, artLabel: string): string {
  const typed = Object.values(fields).map((v) => v.trim()).filter(Boolean).join(" ");
  return `${typed} | ${modelName} ${artLabel}`.replace(/\s+/g, " ").trim().slice(0, 120);
}

export type PrintArea = { base_image_id: number; color?: { name?: string } | null; model?: string | null };
export type InkArt = { base_image_id: number; art_attachment: string };

/**
 * The `arts` of the product: one entry per print area (INK requires every area, e.g. 9 colours × 2 cuts), the dark-ink art on the light colours and the
 * light-ink art on the others, by the same table as the preview (`SHIRT_COLORS`). An area whose colour is not in the table stops everything.
 */
export function inkArts(areas: readonly PrintArea[], darkInkPng: Buffer, lightInkPng: Buffer): InkArt[] {
  if (!areas.length) throw new Error("o tipo de produto não tem áreas de impressão");
  const dark = darkInkPng.toString("base64");
  const light = lightInkPng.toString("base64");
  return areas.map((area) => {
    const takesDark = inkColorTakesDarkInk(area.color?.name ?? "");
    if (takesDark === null) throw new Error(`cor sem regra de arte: ${area.color?.name ?? "(sem nome)"}`);
    return { base_image_id: area.base_image_id, art_attachment: takesDark ? dark : light };
  });
}

/** INK's product URL, only when it is https on one of our INK stores: never redirect a customer anywhere else. */
export function safeInkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && INK_COMMERCE_HOSTS.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** What the waiting screen shows of a job: never the internal error or the store's ids. */
export type PublicProductJob = { id: string; label: string; status: ProductStatus; url: string | null; image: string | null };
export const publicJob = (job: ProductJob): PublicProductJob => ({ id: job.id, label: job.artLabel, status: job.status, url: job.status === "ready" ? safeInkUrl(job.inkUrl) : null, image: job.status === "ready" ? job.inkImageUrl : null });
