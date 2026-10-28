import "server-only";
import { after } from "next/server";
import { adminConfig } from "../admin/config";
import { platform } from "../admin/platform";
import { storeForRegion } from "../catalog/commerce-mode";
import type { CommerceStoreKey, RegionSlug } from "../geo/regions";
import { resolveProductDisplay, type ProductDisplay } from "../catalog/lookup";
import { INK_API_BASE_URL, INK_STORES } from "../ink/config";
import { composeArtwork, validateArtworkInput } from "./artwork";
import { loadArtworkBase } from "./artwork-server";
import { fakeInkProductClient, realInkProductClient, type InkProductClient } from "./ink-product-client";
import { safeInkUrl, type ProductJob, type ProductJobStore } from "./ink-products";
import { inkPhotoOrPlaceholder } from "./product-status";
import { fileProductJobStore, pgProductJobStore } from "./product-store";
import { runProductJob, type WorkerDeps } from "./product-worker";

const g = globalThis as unknown as { __uoProductStore?: ProductJobStore; __uoFakeInk?: InkProductClient };

/** Where the products created at INK are recorded: Postgres in production (migration 0011), a JSON file on the development server, nothing without the admin. */
export function productStoreOrNull(): ProductJobStore | null {
  try {
    if (adminConfig().mode === "off") return null;
    const p = platform();
    if (p.mode === "prod") return p.db ? pgProductJobStore(p.db) : null;
    g.__uoProductStore ??= fileProductJobStore();
    return g.__uoProductStore;
  } catch {
    return null;
  }
}

/** Postgres says the table does not exist (db/migrations/0011 not applied yet): the page keeps the request flow. */
export const missingProductTable = (error: unknown): boolean => /42P01|customization_product/.test(error instanceof Error ? `${(error as { code?: string }).code ?? ""} ${error.message}` : String(error));

/**
 * The INK client for a region, or null when direct purchase cannot run there. Real INK only in production (or with `INK_PRODUCTS_LIVE=on`, a deliberate
 * opt-in) and with the store's write token; anywhere else the stand-in, so a test surname typed on a laptop never becomes a permanent product.
 * `FAKE_INK_CREATE_MS` / `FAKE_INK_PHOTO_MS` tune the stand-in's timings (default: the 27/10 pilot's 30 s and 20 s).
 */
export function inkProductClientFor(region: RegionSlug): InkProductClient | null {
  const live = adminConfig().mode === "prod" || process.env.INK_PRODUCTS_LIVE === "on";
  if (!live) {
    const ms = (name: string, fallback: number) => (Number.isFinite(Number(process.env[name])) && process.env[name] !== undefined ? Number(process.env[name]) : fallback);
    g.__uoFakeInk ??= fakeInkProductClient({ createMs: ms("FAKE_INK_CREATE_MS", 30_000), photoMs: ms("FAKE_INK_PHOTO_MS", 20_000) });
    return g.__uoFakeInk;
  }
  const store = INK_STORES[storeForRegion(region)];
  const token = store ? process.env[store.writeTokenEnv] : undefined;
  return token ? realInkProductClient(token, INK_API_BASE_URL) : null;
}

async function artPng(templateId: string, fields: Record<string, string>): Promise<Buffer> {
  const base = await loadArtworkBase(templateId);
  if (!base) throw new Error(`a base ${templateId} não está disponível`);
  const checked = validateArtworkInput(base, templateId, { fields });
  if (!checked.ok) throw new Error(`os textos não passam na base ${templateId}`);
  // Loaded here, not at the top: a page that never draws (every model without direct purchase) never loads the native canvas.
  const { renderProjectPng } = await import("../print-studio/render-server");
  return renderProjectPng(composeArtwork(base, checked.artwork.layers));
}

/** The two arts of a job from its immutable bases: the "light shirts" base gives the dark-ink art; a version without it uses its only base for every colour. */
export async function renderJobArts(job: ProductJob): Promise<{ darkInk: Buffer; lightInk: Buffer }> {
  const lightInk = await artPng(job.templateId, job.fields);
  const darkInk = job.lightTemplateId ? await artPng(job.lightTemplateId, job.fields) : lightInk;
  return { darkInk, lightInk };
}

/** The product's description and tags at INK; the tags let the team find (and exclude) every personalized product. */
export const describeJob = (job: ProductJob) => ({
  description: "Estampa personalizada, montada na página de personalização da Use Origens.",
  tags: ["personalizado", `personalizado-${job.customizerSlug}`.slice(0, 40)],
});

/** Runs the job after the response is sent (Next's `after`): the customer's request returns at once and the waiting page follows the job. */
export function startProductJob(id: string, region: RegionSlug): void {
  const store = productStoreOrNull();
  const client = inkProductClientFor(region);
  if (!store || !client) return;
  const deps: WorkerDeps = { store, client, render: renderJobArts, now: () => new Date(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
  after(() => runProductJob(id, deps, describeJob).catch(() => undefined));
}

/**
 * A personalized product as "Minhas Estampas" and the buy session show it: only once ready, only on our INK store (it is hidden there, so the
 * synced catalog never has it). When INK had not made the photo within the minute the waiting screen waits, it is asked again here and kept.
 */
export async function personalizedDisplay(storeKey: CommerceStoreKey, inkProductId: string): Promise<ProductDisplay | null> {
  const store = productStoreOrNull();
  if (!store || !/^\d{1,20}$/.test(inkProductId)) return null;
  try {
    const job = await store.findByInkProductId(inkProductId);
    const url = job?.status === "ready" ? safeInkUrl(job.inkUrl) : null;
    if (!job || !url || storeForRegion(job.region) !== storeKey) return null;
    let image = job.inkImageUrl;
    if (!image) {
      const seen = await inkProductClientFor(job.region)?.getProduct(inkProductId).catch(() => null);
      if (seen?.imageUrl) {
        image = seen.imageUrl;
        await store.update(job.id, { inkImageUrl: image }, { onlyIf: ["ready"] }).catch(() => null);
      }
    }
    return { inkProductId, commerceStoreKey: storeKey, title: job.name, context: "Personalizada", imageUrl: inkPhotoOrPlaceholder(image), price: Number(job.price), url };
  } catch {
    return null; // no table yet (migration 0011), the database away: the product simply shows as unavailable
  }
}

/** The catalog first; a personalized product (hidden at INK) when the catalog does not know the id. */
export async function resolveAnyProductDisplay(storeKey: CommerceStoreKey, inkProductId: string): Promise<ProductDisplay | null> {
  return resolveProductDisplay(storeKey, inkProductId) ?? personalizedDisplay(storeKey, inkProductId);
}
