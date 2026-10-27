import { BUILTIN_FONTS, type PrintLayer, type PrintProject, type TextLayer } from "./model";
import { pdfFontCharacterError } from "./pdf-fonts";

export type LayerBounds = { id: string; x: number; y: number; width: number; height: number };
export type RenderResources = { families: Map<string, string>; images: Map<string, HTMLImageElement> };
const loadedFonts = new Map<string, { dataUrl: string; weight: number; face: FontFace }>();
const loadedImages = new Map<string, { dataUrl: string; image: Promise<HTMLImageElement> }>();

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível abrir a imagem. Tente um PNG, JPG ou WebP válido."));
    image.src = dataUrl;
  });
}

export async function loadResources(project: PrintProject): Promise<RenderResources> {
  const style = getComputedStyle(document.documentElement);
  const families = new Map<string, string>([
    ["hanken", style.getPropertyValue("--font-body").trim() || "sans-serif"],
    ["big-shoulders", style.getPropertyValue("--font-display").trim() || "sans-serif"],
    ["bodoni", style.getPropertyValue("--font-serif").trim() || "serif"],
  ]);
  await document.fonts.ready;
  for (const [id, loaded] of loadedFonts) {
    if (!project.fonts.some((font) => font.id === id && font.dataUrl === loaded.dataUrl && (font.weight ?? 400) === loaded.weight)) {
      document.fonts.delete(loaded.face);
      loadedFonts.delete(id);
    }
  }
  await Promise.all(project.fonts.map(async (font) => {
    if (!loadedFonts.has(font.id)) {
      const face = new FontFace(font.id, `url(${font.dataUrl})`, { weight: String(font.weight ?? 400) });
      try { await face.load(); } catch { throw new Error(`A fonte “${font.name}” não abriu. Envie um arquivo TTF, OTF, WOFF ou WOFF2 válido.`); }
      document.fonts.add(face);
      loadedFonts.set(font.id, { dataUrl: font.dataUrl, weight: font.weight ?? 400, face });
    }
    families.set(font.id, `"${font.id}"`);
  }));
  await Promise.all(BUILTIN_FONTS.map((font) => document.fonts.load(`400 20px ${families.get(font.id)}`)));
  const images = new Map<string, HTMLImageElement>();
  for (const id of loadedImages.keys()) if (!project.layers.some((l) => l.id === id && l.kind === "image")) loadedImages.delete(id);
  await Promise.all(project.layers.filter((layer) => layer.kind === "image").map(async (layer) => {
    if (loadedImages.get(layer.id)?.dataUrl !== layer.asset.dataUrl) loadedImages.set(layer.id, { dataUrl: layer.asset.dataUrl, image: loadImage(layer.asset.dataUrl) });
    const img = await loadedImages.get(layer.id)!.image;
    if (img.naturalWidth !== layer.asset.width || img.naturalHeight !== layer.asset.height) throw new Error(`As dimensões de “${layer.asset.name}” não correspondem à imagem.`);
    images.set(layer.id, img);
  }));
  return { families, images };
}

function setTextStyle(context: CanvasRenderingContext2D, layer: TextLayer, resources: RenderResources) {
  const family = resources.families.get(layer.fontId);
  if (!family) throw new Error("Uma fonte da composição não foi carregada.");
  context.font = `${layer.weight} ${layer.fontSize}px ${family}`;
  context.fillStyle = layer.color;
  context.strokeStyle = layer.color;
  context.lineJoin = "round";
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.letterSpacing = `${layer.letterSpacing}px`;
  context.fontKerning = "normal";
  const fit = layer.boxWidth ?? layer.maxWidth;
  if (fit) {
    const width = Math.max(...layer.text.split("\n").map((line) => context.measureText(line).width));
    if (width > fit) {
      const ratio = fit / width;
      context.font = `${layer.weight} ${layer.fontSize * ratio}px ${family}`;
      context.letterSpacing = `${layer.letterSpacing * ratio}px`;
      return layer.fontSize * ratio;
    }
  }
  return layer.fontSize;
}

/** Distance from the layer top to the first baseline. A fixed box anchors on the cap height, so accents never move a locked composition, and a shrunk line keeps its vertical centre. */
function firstAscent(context: CanvasRenderingContext2D, layer: TextLayer, lines: string[], fontSize: number) {
  if (layer.boxWidth) {
    const cap = context.measureText("H").actualBoundingBoxAscent;
    return (cap * layer.fontSize / fontSize + cap) / 2;
  }
  return Math.max(...lines.map((line) => context.measureText(line || " ").actualBoundingBoxAscent), fontSize * 0.72);
}

export function measureLayer(context: CanvasRenderingContext2D, layer: PrintLayer, resources: RenderResources): LayerBounds {
  if (layer.kind === "image") return { id: layer.id, x: layer.x, y: layer.y, width: layer.width, height: layer.width * layer.asset.height / layer.asset.width };
  const fontSize = setTextStyle(context, layer, resources);
  const lines = layer.text.split("\n");
  const metrics = lines.map((line) => context.measureText(line || " "));
  const ascent = firstAscent(context, layer, lines, fontSize);
  const descent = Math.max(0, ...metrics.map((m) => m.actualBoundingBoxDescent));
  const width = layer.boxWidth ?? Math.max(40, ...metrics.map((m) => m.width));
  // An arch drops its ends by the sagitta of the drawn arc; the box is an approximation used for selection only.
  const sagitta = layer.arc ? layer.arc * (1 - Math.cos(Math.min(Math.PI / 2, metrics[0].width / layer.arc / 2))) : 0;
  return { id: layer.id, x: layer.x, y: layer.y, width, height: Math.max(fontSize, ascent + descent + (lines.length - 1) * fontSize * layer.lineHeight) + sagitta };
}

function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number, stroke: number) {
  if (stroke > 0) { context.lineWidth = stroke; context.strokeText(text, x, y); }
  context.fillText(text, x, y);
}

/** One line along an upward arch centred on `cx`; `baseline` is the baseline at the apex. Kerning pairs are not applied between letters. */
function paintArc(context: CanvasRenderingContext2D, line: string, cx: number, baseline: number, radius: number, stroke: number) {
  const spacing = parseFloat(context.letterSpacing) || 0;
  context.letterSpacing = "0px";
  const letters = [...line].map((char) => ({ char, width: context.measureText(char).width }));
  const total = letters.reduce((sum, l) => sum + l.width, 0) + spacing * Math.max(0, letters.length - 1);
  let along = -total / 2;
  for (const { char, width } of letters) {
    context.save();
    context.translate(cx, baseline + radius);
    context.rotate((along + width / 2) / radius);
    drawText(context, char, -width / 2, -radius, stroke);
    context.restore();
    along += width + spacing;
  }
}

/** The exact same painter is used by the interactive preview and full-resolution PNG. */
export function paintProject(canvas: HTMLCanvasElement, project: PrintProject, resources: RenderResources, width: number): LayerBounds[] {
  for (const layer of project.layers) {
    if (layer.kind !== "text" || !layer.visible) continue;
    const error = pdfFontCharacterError(layer.fontId, layer.text);
    if (error) throw new Error(error);
  }
  canvas.width = Math.round(width);
  canvas.height = Math.round(width * project.height / project.width);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não conseguiu criar a imagem.");
  context.scale(canvas.width / project.width, canvas.height / project.height);
  if (project.background) { context.fillStyle = project.background; context.fillRect(0, 0, project.width, project.height); }
  const bounds: LayerBounds[] = [];
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const box = measureLayer(context, layer, resources);
    bounds.push(box);
    if (layer.kind === "image") {
      const img = resources.images.get(layer.id);
      if (!img) throw new Error(`A imagem “${layer.name}” não foi carregada.`);
      context.drawImage(img, layer.x, layer.y, box.width, box.height);
    } else {
      const fontSize = setTextStyle(context, layer, resources);
      const lines = layer.text.split("\n");
      const ascent = firstAscent(context, layer, lines, fontSize);
      const stroke = (layer.stroke ?? 0) * fontSize / layer.fontSize;
      if (layer.arc) { paintArc(context, lines.join(" "), layer.x + box.width / 2, layer.y + ascent, layer.arc, stroke); continue; }
      lines.forEach((line, index) => {
        const lineWidth = context.measureText(line).width;
        const offset = layer.align === "center" ? (box.width - lineWidth) / 2 : layer.align === "right" ? box.width - lineWidth : 0;
        drawText(context, line, layer.x + offset, layer.y + ascent + index * fontSize * layer.lineHeight, stroke);
      });
    }
  }
  return bounds;
}

export async function exportPng(project: PrintProject): Promise<Blob> {
  const resources = await loadResources(project);
  const canvas = document.createElement("canvas");
  try {
    paintProject(canvas, project, resources, project.width);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Não foi possível preparar a imagem. Tente salvar novamente.")), "image/png"));
  } finally { canvas.width = 0; canvas.height = 0; }
}
