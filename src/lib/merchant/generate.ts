import "server-only";
import path from "node:path";
import sharp from "sharp";
import { singleStoreDataDir } from "../catalog/commerce-mode";
import { familyById } from "../catalog/families";
import { readSnapshot, snapshotPath } from "../catalog/snapshot-file";
import { LOJA_UNICA } from "../catalog/unificado/loja-unica";
import { localityById } from "../geo/localities";
import { REGIONS, STATE_NAMES } from "../geo/regions";
import { candidateHex, classifyCoverPixels, COVER_CLASSIFIER_VERSION, type CoverColorVerdict } from "./cover-color";
import { buildMerchantFeed, type DesignInfo } from "./feed";
import { FEED_FILE, FEED_REPORT_FILE, readCoverColors, readFeedReport, readMerchantSource, writeAtomic, writeCoverColors, type FeedReport } from "./files";
import type { MerchantSourceProduct } from "./source";
import { parseInkTsv, tsvLine } from "./tsv";

/** INK's Google feed export of the single store (Merchant Center's current data source). Its rows are the feed's universe. */
export function inkFeedUrl(): string | null {
  const url = process.env.INK_GOOGLE_FEED_URL?.trim();
  return url && url.startsWith("https://") ? url : null;
}

const COVER_CONCURRENCY = 6;
const IMAGE_TIMEOUT_MS = 20_000;

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ scope: "merchant-feed", event, ...fields }));
}

const candidatesKey = (product: MerchantSourceProduct) =>
  `v${COVER_CLASSIFIER_VERSION}|` +
  product.colors
    .map((c) => `${c.name}:${candidateHex(c) ?? "-"}`)
    .sort()
    .join(",");

async function judgeCover(url: string, product: MerchantSourceProduct, fetchImpl: typeof fetch): Promise<CoverColorVerdict | null> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`cover ${res.status}`);
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(64, 64, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return classifyCoverPixels(new Uint8Array(data), info.width, info.height, product.colors);
}

/**
 * Judges the cover of every product not judged yet (or whose colors changed), a few images at a time from INK's image CDN (not the INK
 * API, so no API quota). Verdicts are cached by cover URL on the Volume: a daily run only looks at new or changed covers.
 */
export async function updateCoverColors(opts: { dir?: string; fetchImpl?: typeof fetch; maxImages?: number } = {}): Promise<{ judged: number; failed: number; cached: number; pending: number }> {
  const dir = opts.dir ?? singleStoreDataDir();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const source = await readMerchantSource(dir);
  if (!source) return { judged: 0, failed: 0, cached: 0, pending: 0 };
  const cache = await readCoverColors(dir);
  const live = new Set<string>();
  const todo: { url: string; key: string; product: MerchantSourceProduct }[] = [];
  for (const product of source.products) {
    if (!product.cover || product.colors.length === 0) continue;
    live.add(product.cover);
    const key = candidatesKey(product);
    if (cache.entries[product.cover]?.key !== key) todo.push({ url: product.cover, key, product });
  }
  for (const url of Object.keys(cache.entries)) if (!live.has(url)) delete cache.entries[url];

  const batch = todo.slice(0, opts.maxImages ?? todo.length);
  let judged = 0;
  let failed = 0;
  let next = 0;
  let saving: Promise<void> = Promise.resolve();
  const worker = async () => {
    while (next < batch.length) {
      const item = batch[next++];
      try {
        const verdict = await judgeCover(item.url, item.product, fetchImpl);
        cache.entries[item.url] = { key: item.key, verdict, at: new Date().toISOString() };
        judged++;
      } catch {
        failed++; // Not cached: tried again on the next run.
      }
      // A checkpoint every 500 covers, one write at a time: an interrupted first run (17 mil covers) keeps what it judged.
      if ((judged + failed) % 500 === 0) {
        const done = judged + failed;
        saving = saving.then(() => writeCoverColors(dir, cache)).then(() => log("covers-progress", { done, of: batch.length }));
        await saving;
      }
    }
  };
  await Promise.all(Array.from({ length: COVER_CONCURRENCY }, worker));
  await saving;
  await writeCoverColors(dir, cache);
  return { judged, failed, cached: Object.keys(cache.entries).length, pending: todo.length - batch.length };
}

/** Our classification of every product of the single store's catalog snapshot, by INK id. */
async function designLookup(dir: string): Promise<(id: string) => DesignInfo | undefined> {
  const index = (await readSnapshot(snapshotPath(dir))).stores[LOJA_UNICA];
  const byId = new Map<string, DesignInfo>();
  for (const b of index?.bindings ?? []) {
    const place = localityById(b.localityId ?? b.cityId) ?? localityById(b.cityId);
    if (!place) continue;
    const family = familyById(b.designFamily);
    byId.set(b.inkProductId, {
      regionName: REGIONS[place.regionSlug]?.name ?? null,
      uf: place.uf,
      stateName: STATE_NAMES[place.uf] ?? null,
      cityName: place.name,
      ...(b.localityLabel && !b.localityId ? { localityLabel: b.localityLabel } : {}),
      familyId: b.designFamily,
      familyName: family?.name,
      familyDescription: family?.description,
    });
  }
  for (const m of index?.merch ?? []) {
    if (!byId.has(m.inkProductId)) byId.set(m.inkProductId, { regionName: REGIONS[m.regionSlug]?.name ?? null, uf: null, stateName: null });
  }
  return (id) => byId.get(id);
}

/**
 * Reads INK's export now (prices and availability exactly as INK publishes them at this moment), applies covers and classification, and
 * writes the feed atomically. Refuses (keeps the previous file) when INK's export looks broken: missing columns or far fewer rows than the
 * last good run.
 */
export async function generateMerchantFeed(opts: { dir?: string; fetchImpl?: typeof fetch } = {}): Promise<{ ok: true; report: FeedReport } | { ok: false; error: string }> {
  const dir = opts.dir ?? singleStoreDataDir();
  const url = inkFeedUrl();
  if (!url) return { ok: false, error: "INK_GOOGLE_FEED_URL não configurada" };
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(180_000), cache: "no-store" });
    if (!res.ok) return { ok: false, error: `export da INK respondeu ${res.status}` };
    const { header, rows } = parseInkTsv(await res.text());
    for (const column of ["id", "title", "link", "image_link", "price"]) {
      if (!header.includes(column)) return { ok: false, error: `export da INK sem a coluna ${column}` };
    }
    const previous = await readFeedReport(dir);
    if (previous && rows.length < previous.inkFeedRows * 0.8) {
      return { ok: false, error: `export da INK com ${rows.length} linhas, contra ${previous.inkFeedRows} na última geração — mantido o feed anterior` };
    }
    const source = await readMerchantSource(dir);
    const cache = await readCoverColors(dir);
    const built = buildMerchantFeed({
      inkHeader: header,
      inkRows: rows,
      source: new Map((source?.products ?? []).map((p) => [p.id, p])),
      coverColors: new Map(Object.entries(cache.entries).map(([cover, e]) => [cover, e.verdict])),
      design: await designLookup(dir),
    });
    const report: FeedReport = { generatedAt: new Date().toISOString(), inkFeedRows: rows.length, sourceSyncedAt: source?.syncedAt ?? null, sourceProducts: source?.products.length ?? 0, stats: built.stats };
    await writeAtomic(path.join(dir, FEED_FILE), [tsvLine(built.header), ...built.rows.map(tsvLine)].join("\n") + "\n");
    await writeAtomic(path.join(dir, FEED_REPORT_FILE), JSON.stringify(report, null, 2));
    log("generated", { rows: built.stats.rows, coverImage: built.stats.coverImage, placeholderFixed: built.stats.placeholderFixed, kept: built.stats.kept });
    return { ok: true, report };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type MerchantRefresh = { ok: boolean; error?: string; covers?: Awaited<ReturnType<typeof updateCoverColors>>; rows?: number };

let running: Promise<unknown> | null = null;

/** One generation at a time in this process: a second caller joins the one already running. */
function singleFlight<T>(task: () => Promise<T>): Promise<T> {
  if (!running) running = task().finally(() => (running = null));
  return running as Promise<T>;
}

export const merchantFeedRunning = (): boolean => running !== null;

/** Covers first (new products), then the feed. Never throws. Used by the daily job and by POST /api/admin/merchant-feed. */
export function refreshMerchantFeed(): Promise<MerchantRefresh> {
  return singleFlight(async (): Promise<MerchantRefresh> => {
    if (!inkFeedUrl()) return { ok: false, error: "INK_GOOGLE_FEED_URL não configurada" };
    try {
      const covers = await updateCoverColors();
      const feed = await generateMerchantFeed();
      return feed.ok ? { ok: true, covers, rows: feed.report.stats.rows } : { ok: false, covers, error: feed.error };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

/** Only the feed, from the covers already judged (the public route's refresh of prices between daily runs). Never throws. */
export function regenerateMerchantFeed(): Promise<unknown> {
  return singleFlight(() => generateMerchantFeed());
}
