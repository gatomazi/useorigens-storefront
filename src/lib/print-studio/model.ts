/** Portable, versioned print layouts. Coordinates and type sizes are in output pixels. */
export const PROJECT_VERSION = 1;
export const MAX_PROJECT_BYTES = 32 * 1024 * 1024;
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_LAYERS = 40;
export const DEFAULT_FONT = "hanken";

export type PrintFont = { id: string; name: string; dataUrl: string; weight?: number };
export type ImageAsset = { dataUrl: string; name: string; width: number; height: number };
type BaseLayer = { id: string; name: string; x: number; y: number; visible: boolean; groupId?: string };
export type TextLayer = BaseLayer & {
  kind: "text";
  text: string;
  fontId: string;
  fontSize: number;
  weight: number;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  /** Optional automatic text fitting, used by customer personalization bases. */
  maxWidth?: number;
  /** Fixed text box: lines align inside it and shrink to fit it, so a centered name keeps its axis whatever its length. */
  boxWidth?: number;
  /** Radius (px) of an upward arch drawn letter by letter; the box width is then the longest arc allowed. */
  arc?: number;
  /** Outline (px) in the text colour, drawn under the fill to thicken a light typeface. */
  stroke?: number;
  /** Filled by the customer in the storefront; the rest of a base with slots stays locked. */
  slot?: TextSlot;
};
/** `template` carries `{field}`, e.g. "NATAL DOS {sobrenome}"; layers sharing a field share one answer. */
/**
 * `maxLines` > 1 breaks a multi-word answer into balanced lines; only for a layout with room to grow (an arch grows upward).
 * `dropParticle` removes a leading "da/das/do/dos" from the answer where the art already says "dos" ("NATAL DOS {sobrenome}").
 */
export type TextSlot = { field: string; label: string; template: string; textCase: "upper" | "title" | "none"; maxLength: number; example: string; maxLines?: number; dropParticle?: boolean };
export type ImageLayer = BaseLayer & { kind: "image"; asset: ImageAsset; width: number };
export type PrintLayer = TextLayer | ImageLayer;
export type PrintProject = {
  version: 1;
  name: string;
  width: number;
  height: number;
  dpi: number;
  background: string | null;
  layers: PrintLayer[];
  fonts: PrintFont[];
  reference: ImageAsset | null;
};

export const BUILTIN_FONTS = [
  { id: DEFAULT_FONT, name: "Hanken Grotesk" },
  { id: "big-shoulders", name: "Big Shoulders" },
  { id: "bodoni", name: "Bodoni Moda" },
] as const;

export function newId(): string { return crypto.randomUUID(); }

export function newTextLayer(id = newId()): TextLayer {
  return { id, kind: "text", name: "Texto", text: "Sua frase aqui", x: 430, y: 550, visible: true, fontId: DEFAULT_FONT, fontSize: 380, weight: 700, color: "#ffffff", letterSpacing: -8, lineHeight: 1.12, align: "left" };
}

export function createPreset(kind: "celebrar" | "peleia"): PrintProject {
  const base: PrintProject = { version: PROJECT_VERSION, name: kind === "celebrar" ? "Feliz tudo" : "Quem peleia", width: 4270, height: 4900, dpi: 300, background: null, layers: [], fonts: [], reference: null };
  if (kind === "celebrar") {
    base.layers = ["feliz natal&", "feliz ano novo&", "cuca&", "amigo secreto."].map((text, index) => ({
      ...newTextLayer(`celebrar-${index}`), text, name: `Linha ${index + 1}`, x: 420, y: 280 + index * 490, fontSize: 480, weight: 800, color: "#790b1b", letterSpacing: -18,
    }));
  } else {
    base.layers = [
      { ...newTextLayer("peleia-normal"), name: "Frase", text: "Não tá morto", x: 600, y: 550, fontSize: 390, weight: 300, letterSpacing: -8 },
      { ...newTextLayer("peleia-enfase"), name: "Destaque", text: "quem peleia", x: 600, y: 1010, fontSize: 510, weight: 800, letterSpacing: -12 },
    ];
  }
  return base;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("O projeto contém um campo inválido.");
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) throw new Error("O projeto contém um texto inválido ou muito longo.");
  return value;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("O projeto contém uma medida fora do limite.");
  return value;
}
function color(value: unknown): string {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new Error("Use cores no formato #RRGGBB.");
  return value;
}
function dataUrl(value: unknown, kind: "image" | "font"): string {
  const s = string(value, Math.ceil(MAX_ASSET_BYTES * 4 / 3) + 160);
  const prefix = kind === "image" ? /^data:image\/(png|jpeg|webp);base64,/ : /^data:(font\/(ttf|otf|woff2?)|application\/(octet-stream|font-woff|x-font-ttf|x-font-opentype|vnd\.ms-fontobject));base64,/;
  const header = s.match(prefix)?.[0];
  if (!header || !s.slice(header.length) || !/^[A-Za-z0-9+/]*={0,2}$/.test(s.slice(header.length))) throw new Error(kind === "image" ? "A imagem do projeto é inválida. Use PNG, JPG ou WebP." : "A fonte do projeto é inválida.");
  return s;
}
function slot(value: unknown): TextSlot {
  const s = object(value);
  const field = string(s.field, 30);
  const template = string(s.template, 200);
  if (!/^[a-z][a-z0-9-]*$/.test(field) || !template.includes(`{${field}}`)) throw new Error("O projeto contém um campo de personalização inválido.");
  if (!["upper", "title", "none"].includes(String(s.textCase))) throw new Error("O projeto contém um campo de personalização inválido.");
  return { field, label: string(s.label, 60), template, textCase: s.textCase as TextSlot["textCase"], maxLength: number(s.maxLength, 1, 60), example: string(s.example, 60), ...(s.maxLines === undefined ? {} : { maxLines: number(s.maxLines, 1, 3) }), ...(s.dropParticle === undefined ? {} : { dropParticle: s.dropParticle === true }) };
}
function imageAsset(value: unknown): ImageAsset {
  const a = object(value);
  const width = number(a.width, 1, 16000);
  const height = number(a.height, 1, 16000);
  if (width * height > 40_000_000) throw new Error("A imagem deve ter no máximo 40 megapixels.");
  return { dataUrl: dataUrl(a.dataUrl, "image"), name: string(a.name, 200), width, height };
}

/** Whitelist fields and validate every embedded asset before using an imported project. */
export function parseProject(input: unknown): PrintProject {
  const p = object(input);
  if (p.version !== PROJECT_VERSION) throw new Error("Versão de projeto não suportada. Abra um arquivo .origens.json exportado por este editor.");
  if (!Array.isArray(p.fonts) || p.fonts.length > 20 || !Array.isArray(p.layers) || p.layers.length > MAX_LAYERS) throw new Error("O projeto excede o limite de 20 fontes ou 40 camadas.");
  const fonts: PrintFont[] = p.fonts.map((f) => {
    const font = object(f);
    const id = string(font.id, 100);
    if (!/^font-[a-zA-Z0-9-]+$/.test(id)) throw new Error("Identificador de fonte inválido.");
    return { id, name: string(font.name, 200), dataUrl: dataUrl(font.dataUrl, "font"), ...(font.weight === undefined ? {} : { weight: number(font.weight, 100, 900) }) };
  });
  const fontIds = new Set<string>([...BUILTIN_FONTS.map((f) => f.id), ...fonts.map((f) => f.id)]);
  if (new Set(fonts.map((f) => f.id)).size !== fonts.length) throw new Error("Existem fontes duplicadas no projeto.");
  const layers: PrintLayer[] = p.layers.map((entry) => {
    const l = object(entry);
    if (typeof l.visible !== "boolean") throw new Error("Visibilidade de camada inválida.");
    const base = { id: string(l.id, 100), name: string(l.name, 100), x: number(l.x, -10000, 10000), y: number(l.y, -10000, 10000), visible: l.visible, ...(l.groupId === undefined ? {} : { groupId: string(l.groupId, 100) }) };
    if (l.kind === "image") return { ...base, kind: "image", asset: imageAsset(l.asset), width: number(l.width, 1, 10000) };
    if (l.kind !== "text" || !fontIds.has(String(l.fontId)) || !["left", "center", "right"].includes(String(l.align))) throw new Error("O projeto contém uma camada ou fonte desconhecida.");
    return { ...base, kind: "text", text: string(l.text, 3000), fontId: String(l.fontId), fontSize: number(l.fontSize, 8, 2000), weight: number(l.weight, 100, 900), color: color(l.color), letterSpacing: number(l.letterSpacing, -100, 300), lineHeight: number(l.lineHeight, 0.7, 3), align: l.align as TextLayer["align"], ...(l.maxWidth === undefined ? {} : { maxWidth: number(l.maxWidth, 1, 8000) }), ...(l.boxWidth === undefined ? {} : { boxWidth: number(l.boxWidth, 1, 8000) }), ...(l.arc === undefined ? {} : { arc: number(l.arc, 100, 50000) }), ...(l.stroke === undefined ? {} : { stroke: number(l.stroke, 0, 200) }), ...(l.slot === undefined ? {} : { slot: slot(l.slot) }) };
  });
  if (new Set(layers.map((l) => l.id)).size !== layers.length) throw new Error("Existem camadas duplicadas no projeto.");
  return { version: PROJECT_VERSION, name: string(p.name, 150), width: number(p.width, 300, 8000), height: number(p.height, 300, 8000), dpi: number(p.dpi, 72, 600), background: p.background === null ? null : color(p.background), layers, fonts, reference: p.reference === null ? null : imageAsset(p.reference) };
}

export function parseProjectFile(text: string): PrintProject {
  if (new TextEncoder().encode(text).length > MAX_PROJECT_BYTES) throw new Error("O projeto deve ter no máximo 32 MB.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Não foi possível ler o projeto. Escolha um arquivo .origens.json."); }
  return parseProject(value);
}

export function projectFileName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "minha-estampa";
}

/** Scale all positions and type together when changing print dimensions. */
export function resizeProject(project: PrintProject, width: number, height: number): PrintProject {
  const scale = Math.min(width / project.width, height / project.height);
  return { ...project, width, height, layers: project.layers.map((l) => l.kind === "text" ? { ...l, x: l.x * scale, y: l.y * scale, fontSize: l.fontSize * scale, letterSpacing: l.letterSpacing * scale, ...(l.maxWidth === undefined ? {} : { maxWidth: l.maxWidth * scale }), ...(l.boxWidth === undefined ? {} : { boxWidth: l.boxWidth * scale }), ...(l.arc === undefined ? {} : { arc: l.arc * scale }), ...(l.stroke === undefined ? {} : { stroke: l.stroke * scale }) } : { ...l, x: l.x * scale, y: l.y * scale, width: l.width * scale }) };
}
