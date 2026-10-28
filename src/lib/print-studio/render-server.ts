import "server-only";
import { createHash } from "node:crypto";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import type { PrintProject } from "./model";
import { paintProject, type RenderResources } from "./renderer";

/** Fonts already registered in this process, by content. `GlobalFonts` is process-wide, so each font file is registered once and then reused. */
const registered = new Map<string, string>();

const dataUrlBytes = (dataUrl: string): Buffer => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

/**
 * The server twin of `loadResources`: the project's embedded fonts registered under an alias derived from their content, and its images decoded.
 * The built-in families of the site (next/font) have no file on the server, so a visible text in one of them is refused rather than drawn in a
 * fallback font that would not match the preview.
 */
export async function loadServerResources(project: PrintProject): Promise<RenderResources> {
  const families = new Map<string, string>();
  for (const font of project.fonts) {
    const bytes = dataUrlBytes(font.dataUrl);
    const key = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
    let alias = registered.get(key);
    if (!alias) {
      alias = `pf-${key}`;
      if (!GlobalFonts.register(bytes, alias)) throw new Error(`A fonte “${font.name}” não abriu no servidor.`);
      registered.set(key, alias);
    }
    families.set(font.id, `"${alias}"`);
  }
  for (const layer of project.layers) {
    if (layer.kind === "text" && layer.visible && !families.has(layer.fontId)) throw new Error(`O texto “${layer.name}” usa uma fonte do site, que o servidor não desenha.`);
  }
  const images = new Map<string, unknown>();
  await Promise.all(project.layers.filter((layer) => layer.kind === "image").map(async (layer) => {
    const image = await loadImage(dataUrlBytes(layer.asset.dataUrl));
    if (image.width !== layer.asset.width || image.height !== layer.asset.height) throw new Error(`As dimensões de “${layer.asset.name}” não correspondem à imagem.`);
    images.set(layer.id, image);
  }));
  return { families, images } as unknown as RenderResources;
}

/** The art as a PNG, drawn by the same painter as the preview and the studio (`paintProject`); full size unless `width` is given. */
export async function renderProjectPng(project: PrintProject, width = project.width): Promise<Buffer> {
  const resources = await loadServerResources(project);
  const canvas = createCanvas(1, 1);
  paintProject(canvas as unknown as HTMLCanvasElement, project, resources, width);
  return canvas.encode("png");
}
