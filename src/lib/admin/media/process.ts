import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";

/**
 * Image intake, shared by the local sandbox and R2. The declared MIME type and the file name are never trusted: the decoder must accept
 * the bytes, the real format must be PNG, JPEG, WebP or AVIF (no SVG, GIF, HEIC or anything a renderer could execute), animated images
 * are refused, and both the file size and the decoded pixel count are bounded BEFORE any resize is attempted. Output is always WebP:
 * EXIF/ICC metadata and any trailing bytes are dropped, orientation is applied, and a few pre-sized widths are produced so the storefront
 * can use them directly (`srcset`) without going through the image optimizer.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_PIXELS = 6000; // per side
export const VARIANT_WIDTHS = [640, 1080, 1600, 2400] as const;
const MAX_MASTER_WIDTH = 2400;

export type ProcessedImage = {
  sha256: string; // of the uploaded bytes: identical uploads are deduplicated
  format: "png" | "jpeg" | "webp" | "avif";
  width: number; // of the largest variant
  height: number;
  avgLuminance: number; // 0..1, for the text-contrast warning
  variants: { w: number; h: number; data: Buffer }[]; // ascending width; the last one is the master
};
export type ProcessResult = { ok: true; image: ProcessedImage } | { ok: false; error: string };

const limits = { limitInputPixels: MAX_UPLOAD_PIXELS * MAX_UPLOAD_PIXELS };

export const safeLabel = (originalName: string): string => originalName.split(/[\\/]/).pop()!.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 40) || "imagem";

export async function processImage(bytes: Buffer): Promise<ProcessResult> {
  if (bytes.length === 0) return { ok: false, error: "arquivo vazio" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "arquivo acima de 8 MB" };
  let meta: Metadata;
  try {
    meta = await sharp(bytes, limits).metadata();
  } catch {
    return { ok: false, error: "não foi possível ler a imagem (use PNG, JPEG, WebP ou AVIF)" };
  }
  const format = meta.format === "heif" && meta.compression === "av1" ? "avif" : meta.format;
  if (format !== "png" && format !== "jpeg" && format !== "webp" && format !== "avif") return { ok: false, error: "formato não permitido (só PNG, JPEG, WebP ou AVIF)" };
  if ((meta.pages ?? 1) > 1) return { ok: false, error: "imagem animada não é permitida" };
  if (!meta.width || !meta.height || meta.width > MAX_UPLOAD_PIXELS || meta.height > MAX_UPLOAD_PIXELS) return { ok: false, error: "imagem acima de 6000 px de lado" };
  try {
    const master = await sharp(bytes, limits).rotate().resize({ width: MAX_MASTER_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    const widths = [...VARIANT_WIDTHS.filter((w) => w < master.info.width), master.info.width];
    const variants: ProcessedImage["variants"] = [];
    for (const w of widths) {
      if (w === master.info.width) variants.push({ w, h: master.info.height, data: master.data });
      else {
        const v = await sharp(master.data).resize({ width: w }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
        variants.push({ w: v.info.width, h: v.info.height, data: v.data });
      }
    }
    const grey = await sharp(master.data).resize(32, 32, { fit: "inside" }).greyscale().raw().toBuffer();
    const avgLuminance = Math.round((grey.reduce((sum, b) => sum + b, 0) / (grey.length * 255)) * 1000) / 1000;
    return { ok: true, image: { sha256: createHash("sha256").update(bytes).digest("hex"), format, width: master.info.width, height: master.info.height, avgLuminance, variants } };
  } catch {
    return { ok: false, error: "não foi possível processar a imagem" };
  }
}
