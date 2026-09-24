import "server-only";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { BANNER_VARIANTS } from "../editorial/banner-variants.generated";
import type { MediaAssetInfo } from "../site-config/schema";
import { adminDevDir, readJson, writeJsonAtomic } from "./local-store";

/**
 * Local media for the CMS sandbox. Two kinds, both resolved to `{ src, width, height }` when a bundle is composed:
 *   - `legacy:<path>`   the banners already in /public/banners (the same masters and static WebP variants the storefront uses);
 *   - `upload:<id>`     a DEV-ONLY upload, validated and re-encoded here, stored under data/admin-dev/uploads and served ONLY by the
 *                       dev-guarded route /admin/media/<id>.webp. Not versioned, not production storage (that will be R2).
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_PIXELS = 6000;
const UPLOAD_ID = /^[0-9a-f]{24}$/;

export type MediaChoice = { assetId: string; label: string; src: string; width: number; height: number; kind: "banner" | "upload" };

const bannerAssetId = (src: string) => `legacy:${src.replace(/^\/banners\//, "").replace(/\.[a-z]+$/i, "")}`;

export function listBanners(): MediaChoice[] {
  return Object.entries(BANNER_VARIANTS)
    .map(([src, e]) => ({ assetId: bannerAssetId(src), label: src.replace(/^\/banners\//, ""), src, width: e.width, height: e.height, kind: "banner" as const }))
    .sort((a, b) => (a.label < b.label ? -1 : 1));
}

const uploadsDir = () => path.join(adminDevDir(), "uploads");

export async function listUploads(): Promise<MediaChoice[]> {
  let names: string[] = [];
  try {
    names = await readdir(uploadsDir());
  } catch {
    return [];
  }
  const out: MediaChoice[] = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    const meta = await readJson<{ id: string; label: string; width: number; height: number }>(path.join(uploadsDir(), name));
    if (meta && UPLOAD_ID.test(meta.id)) out.push({ assetId: `upload:${meta.id}`, label: meta.label, src: `/admin/media/${meta.id}.webp`, width: meta.width, height: meta.height, kind: "upload" });
  }
  return out;
}

export async function listMedia(): Promise<MediaChoice[]> {
  return [...listBanners(), ...(await listUploads())];
}

/** Resolves the asset ids a document uses into the media table of a bundle. Unknown ids are simply absent (they fail validation). */
export async function resolveMedia(assetIds: Iterable<string>): Promise<Record<string, MediaAssetInfo>> {
  const table = new Map((await listMedia()).map((m) => [m.assetId, m]));
  const out: Record<string, MediaAssetInfo> = {};
  for (const id of assetIds) {
    const m = table.get(id);
    if (m) out[id] = { src: m.src, width: m.width, height: m.height };
  }
  return out;
}

export type UploadResult = { ok: true; choice: MediaChoice } | { ok: false; error: string };

/**
 * Validates for real (the decoder must accept it — the declared MIME and file name are never trusted): PNG, JPEG or WebP only (no SVG,
 * GIF, HEIC, or anything a renderer would execute), ≤ 8 MB, ≤ 6000 px a side. Re-encoded to WebP (drops EXIF and any trailing data),
 * stored under a random name; the original file name is only kept as a display label after being stripped to a safe subset.
 */
export async function saveUpload(bytes: Buffer, originalName: string): Promise<UploadResult> {
  if (bytes.length === 0) return { ok: false, error: "arquivo vazio" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "arquivo acima de 8 MB" };
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_UPLOAD_PIXELS * MAX_UPLOAD_PIXELS }).metadata();
  } catch {
    return { ok: false, error: "não foi possível ler a imagem (use PNG, JPEG ou WebP)" };
  }
  if (!meta.format || !["png", "jpeg", "webp"].includes(meta.format)) return { ok: false, error: "formato não permitido (só PNG, JPEG ou WebP)" };
  if (!meta.width || !meta.height || meta.width > MAX_UPLOAD_PIXELS || meta.height > MAX_UPLOAD_PIXELS) return { ok: false, error: "imagem acima de 6000 px de lado" };
  const id = randomBytes(12).toString("hex");
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_UPLOAD_PIXELS * MAX_UPLOAD_PIXELS }).rotate().resize({ width: 2400, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const label = path.basename(originalName).replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 40) || "imagem";
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(uploadsDir(), { recursive: true });
  await writeFile(path.join(uploadsDir(), `${id}.webp`), data, { flag: "wx" });
  await writeJsonAtomic(path.join(uploadsDir(), `${id}.json`), { id, label, width: info.width, height: info.height, bytes: data.length, createdAt: new Date().toISOString() });
  return { ok: true, choice: { assetId: `upload:${id}`, label, src: `/admin/media/${id}.webp`, width: info.width, height: info.height, kind: "upload" } };
}

/** Reads an upload for the dev route. Only a 24-hex id is accepted, so no path segment from a request ever reaches the file system. */
export async function readUpload(id: string): Promise<Buffer | null> {
  if (!UPLOAD_ID.test(id)) return null;
  try {
    return await readFile(path.join(uploadsDir(), `${id}.webp`));
  } catch {
    return null;
  }
}

export async function deleteUpload(assetId: string): Promise<boolean> {
  const id = assetId.replace(/^upload:/, "");
  if (!UPLOAD_ID.test(id)) return false;
  try {
    await stat(path.join(uploadsDir(), `${id}.webp`));
  } catch {
    return false;
  }
  await rm(path.join(uploadsDir(), `${id}.webp`), { force: true });
  await rm(path.join(uploadsDir(), `${id}.json`), { force: true });
  return true;
}
