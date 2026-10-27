import "server-only";
import sharp from "sharp";
import { serverPrintStore } from "../print-studio/server";
import { PRINT_ID } from "../print-studio/server-store";

/**
 * A base's thumbnail for the art picker: its saved preview cropped to the inked area (a chest logo fills the tile instead of sitting in a corner).
 * Pixels almost transparent (the soft halo some arts carry) do not count as ink.
 */
export async function artThumbnail(id: string): Promise<Buffer | null> {
  if (!PRINT_ID.test(id)) return null;
  const store = serverPrintStore();
  const metadata = await store.read(id, "metadata.json");
  if (!metadata || JSON.parse(metadata.toString()).kind !== "template") return null;
  const preview = await store.read(id, "preview.webp");
  if (!preview) return null;
  const { data, info } = await sharp(preview).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let [left, top, right, bottom] = [info.width, info.height, -1, -1];
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 48) continue;
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
  }
  if (right < 0) return null;
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.06);
  const region = { left: Math.max(0, left - pad), top: Math.max(0, top - pad), width: 0, height: 0 };
  region.width = Math.min(info.width, right + pad + 1) - region.left;
  region.height = Math.min(info.height, bottom + pad + 1) - region.top;
  return sharp(preview).extract(region).resize({ width: 240, height: 240, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}
