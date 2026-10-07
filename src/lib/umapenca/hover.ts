import "server-only";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import { SnapshotWriteError } from "../catalog/snapshot-file";
import { isUmaPencaImageUrl, isUmaPencaProductUrl } from "./hosts";
import { readUmaPencaSnapshot } from "./snapshot";

/**
 * Hover photos of the Uma Penca articles: the second photo a card shows under the pointer. The feed carries only the main photo
 * (`g:additional_image_link` comes empty), so it is read from the product page, which embeds the whole gallery as JSON.
 *
 * This is MANUAL on purpose: `npm run umapenca:fotos` or `POST /api/admin/umapenca-hover-sync`, never the 6-hourly feed cron. A photo,
 * once fetched, is kept in `umapenca-hover.json` (next to `umapenca-snapshot.json`, same contract) and is not fetched again unless a
 * refresh is asked for. An article without an entry simply has no hover.
 */
export type UmaPencaHoverFile = { version: 1; photos: Record<string, { url: string; fetchedAt: string }> };

export function umaPencaHoverPath(): string {
  return path.join(catalogSnapshotDir(), "umapenca-hover.json");
}

function isHoverFile(value: unknown): value is UmaPencaHoverFile {
  const v = value as UmaPencaHoverFile;
  return typeof v === "object" && v !== null && v.version === 1 && typeof v.photos === "object" && v.photos !== null;
}

let cache: { filePath: string; mtimeMs: number; file: UmaPencaHoverFile | null } | null = null;

/** `filePath` is only ever overridden by tests. A missing or unreadable file is "no hover photos", never an error. */
export function readUmaPencaHover(filePath: string = umaPencaHoverPath()): UmaPencaHoverFile | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
  if (cache && cache.filePath === filePath && cache.mtimeMs === mtimeMs) return cache.file;
  let file: UmaPencaHoverFile | null = null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    file = isHoverFile(parsed) ? parsed : null;
  } catch {
    file = null;
  }
  cache = { filePath, mtimeMs, file };
  return file;
}

/** Article id → hover photo URL, only for photos still on an allowed image host (next/image would throw on any other). */
export function umaPencaHoverPhotos(read: () => UmaPencaHoverFile | null = readUmaPencaHover): Record<string, string> {
  const photos = read()?.photos ?? {};
  return Object.fromEntries(Object.entries(photos).flatMap(([id, p]) => (isUmaPencaImageUrl(p.url) ? [[id, p.url]] : [])));
}

async function writeUmaPencaHover(file: UmaPencaHoverFile, filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(file));
    await rename(tmp, filePath);
  } catch (err) {
    throw new SnapshotWriteError(`could not write Uma Penca hover photos to ${filePath} (directory ${dir}) — is the volume mounted and writable?`, err);
  }
}

type GalleryImage = { url?: unknown; type_id?: unknown; main?: unknown; order?: unknown; is_video?: unknown };

/** The `"images":[…]` array the product page embeds, or null when it is not there (the page changed, or it is not a product page). */
function galleryOf(html: string): GalleryImage[] | null {
  const start = html.indexOf('"images":[');
  if (start < 0) return null;
  const open = start + '"images":'.length;
  let depth = 0;
  let inString = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) {
      try {
        const parsed: unknown = JSON.parse(html.slice(open, i + 1));
        return Array.isArray(parsed) ? (parsed as GalleryImage[]) : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const pathOf = (raw: string) => {
  try {
    return new URL(raw).pathname;
  } catch {
    return raw;
  }
};

// type_id 6 is a product mockup photo (the ones the store's own gallery shows); type_id 1 is the bare print file, never a card photo.
const MOCKUP_TYPE = 6;

/**
 * Pure, unit-tested: the hover photo for an article whose card shows `mainImageUrl`. The first mockup photo (gallery order) that is
 * not the card's own photo — for a caneca, the other side of the mug. Null when the gallery has no second mockup.
 */
export function pickHoverPhoto(html: string, mainImageUrl: string): string | null {
  const gallery = galleryOf(html);
  if (!gallery) return null;
  const main = pathOf(mainImageUrl);
  const candidates = gallery
    .filter((img): img is GalleryImage & { url: string } => typeof img.url === "string" && img.type_id === MOCKUP_TYPE && img.is_video !== true && img.main !== true)
    .filter((img) => isUmaPencaImageUrl(img.url) && pathOf(img.url) !== main)
    .sort((a, b) => (typeof a.order === "number" ? a.order : 0) - (typeof b.order === "number" ? b.order : 0));
  return candidates[0]?.url ?? null;
}

export type UmaPencaHoverSyncResult =
  | { ok: true; fetched: { id: string; url: string }[]; kept: number; missing: { id: string; reason: string }[] }
  | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 20_000;

/**
 * Fetches the product page of each synced article that has no hover photo yet (all of them with `refresh`), one GET each, in
 * sequence, read-only. A page that fails or has no second photo leaves that article as it was (with `refresh`, its old photo stays).
 */
export async function syncUmaPencaHover(options: { refresh?: boolean; fetchImpl?: typeof fetch; filePath?: string; snapshotPath?: string; now?: () => Date } = {}): Promise<UmaPencaHoverSyncResult> {
  const snapshot = readUmaPencaSnapshot(options.snapshotPath);
  if (!snapshot) return { ok: false, error: "no Uma Penca snapshot yet — run the feed sync first" };
  const filePath = options.filePath ?? umaPencaHoverPath();
  const fetchImpl = options.fetchImpl ?? fetch;
  const previous = readUmaPencaHover(filePath)?.photos ?? {};
  const photos = { ...previous };
  const fetchedAt = (options.now?.() ?? new Date()).toISOString();

  const fetched: { id: string; url: string }[] = [];
  const missing: { id: string; reason: string }[] = [];
  let kept = 0;
  for (const article of snapshot.articles) {
    if (previous[article.id] && !options.refresh) {
      kept++;
      continue;
    }
    if (!isUmaPencaProductUrl(article.url)) {
      missing.push({ id: article.id, reason: "product URL is not on the Uma Penca store" });
      continue;
    }
    let html: string;
    try {
      const res = await fetchImpl(article.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "text/html" } });
      if (!res.ok) {
        missing.push({ id: article.id, reason: `product page answered HTTP ${res.status}` });
        continue;
      }
      html = await res.text();
    } catch (err) {
      missing.push({ id: article.id, reason: `could not fetch the product page: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }
    const url = pickHoverPhoto(html, article.imageUrl);
    if (!url) {
      missing.push({ id: article.id, reason: "the product page has no second photo" });
      continue;
    }
    photos[article.id] = { url, fetchedAt };
    fetched.push({ id: article.id, url });
  }

  if (fetched.length > 0) await writeUmaPencaHover({ version: 1, photos }, filePath);
  return { ok: true, fetched, kept, missing };
}
