import "server-only";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { MediaAssetInfo } from "../../site-config/schema";
import { adminDevDir, readJson, writeJsonAtomic } from "../local-store";
import { listBanners, resolveBanners } from "./banners";
import { processImage, safeLabel } from "./process";
import type { MediaChoice, MediaStore } from "./types";

/**
 * Local media for the CMS sandbox: `upload:<24 hex>` files under data/admin-dev/uploads, served ONLY by the dev-guarded route
 * /admin/media/<id>.webp. Not versioned, not production storage (production uses R2: r2-store.ts).
 */
export const UPLOAD_ID = /^[0-9a-f]{24}$/;
const uploadsDir = () => path.join(adminDevDir(), "uploads");

export async function readDevUpload(id: string): Promise<Buffer | null> {
  if (!UPLOAD_ID.test(id)) return null; // only a 24-hex id reaches the file system
  try {
    return await readFile(path.join(uploadsDir(), `${id}.webp`));
  } catch {
    return null;
  }
}

async function listUploads(): Promise<MediaChoice[]> {
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

export function devMediaStore(): MediaStore {
  return {
    canUpload: true,
    async list() {
      return [...listBanners(), ...(await listUploads())];
    },
    async resolve(assetIds) {
      const ids = [...assetIds];
      const out: Record<string, MediaAssetInfo> = resolveBanners(ids);
      const uploads = new Map((await listUploads()).map((m) => [m.assetId, m]));
      for (const id of ids) {
        const m = uploads.get(id);
        if (m) out[id] = { src: m.src, width: m.width, height: m.height };
      }
      return out;
    },
    async save(bytes, originalName) {
      const processed = await processImage(bytes);
      if (!processed.ok) return processed;
      const master = processed.image.variants.at(-1)!;
      const id = randomBytes(12).toString("hex");
      const label = safeLabel(originalName);
      await mkdir(uploadsDir(), { recursive: true });
      await writeFile(path.join(uploadsDir(), `${id}.webp`), master.data, { flag: "wx" });
      await writeJsonAtomic(path.join(uploadsDir(), `${id}.json`), { id, label, width: master.w, height: master.h, bytes: master.data.length, createdAt: new Date().toISOString() });
      return { ok: true, choice: { assetId: `upload:${id}`, label, src: `/admin/media/${id}.webp`, width: master.w, height: master.h, kind: "upload" } };
    },
    async remove(assetId) {
      const id = assetId.replace(/^upload:/, "");
      if (!UPLOAD_ID.test(id)) return { ok: false, error: "identificador inválido" };
      try {
        await stat(path.join(uploadsDir(), `${id}.webp`));
      } catch {
        return { ok: false, error: "imagem não encontrada" };
      }
      await rm(path.join(uploadsDir(), `${id}.webp`), { force: true });
      await rm(path.join(uploadsDir(), `${id}.json`), { force: true });
      return { ok: true };
    },
  };
}
