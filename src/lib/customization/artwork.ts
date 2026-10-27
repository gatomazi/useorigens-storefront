import { BUILTIN_FONTS, type PrintProject, type TextLayer } from "../print-studio/model";
import { pdfFontCharacterError } from "../print-studio/pdf-fonts";
import { fontOptionWeight } from "../print-studio/font-options";
import { normalizeValue, problemWith, type FieldError } from "./validate";

export type ArtworkEdit = { id: string; text: string; fontId: string; color: string; weight?: number };
export type RequestArtwork = {
  templateId: string;
  templateName: string;
  layers: (ArtworkEdit & { name: string; fontName: string })[];
};

export const editableTexts = (project: PrintProject): TextLayer[] => project.layers.filter((l): l is TextLayer => l.visible && l.kind === "text");
export const artworkFonts = (project: PrintProject) => [...BUILTIN_FONTS, ...project.fonts];
export const initialArtworkEdits = (project: PrintProject): ArtworkEdit[] => editableTexts(project).map(({ id, text, fontId, color }) => ({ id, text, fontId, color }));
const normalizeArtworkText = (text: string) => text.split(/\r?\n/).map(normalizeValue).join("\n").trim();

/** Only the visible composition and fonts explicitly included in this base may reach a customer. */
export function publicArtworkBase(project: PrintProject): PrintProject {
  return { ...project, reference: null, layers: project.layers.filter((l) => l.visible) };
}

/** Rebuild from the immutable base; positions, images, dimensions and font files never come from the browser. */
export function composeArtwork(base: PrintProject, edits: readonly ArtworkEdit[]): PrintProject {
  const byId = new Map(edits.map((edit) => [edit.id, edit]));
  return {
    ...publicArtworkBase(base),
    // A newly chosen variation freezes its real weight; older requests keep their original fallback.
    fonts: base.fonts.map((font) => {
      const edit = edits.find((e) => e.fontId === font.id && e.weight !== undefined);
      return font.weight === undefined && edit ? { ...font, weight: edit.weight } : font;
    }),
    layers: base.layers.filter((l) => l.visible).map((layer) => {
      if (layer.kind !== "text") return layer;
      const edit = byId.get(layer.id);
      const font = base.fonts.find((f) => f.id === edit?.fontId);
      return { ...layer, ...(edit ? { text: normalizeArtworkText(edit.text), fontId: edit.fontId, color: edit.color.toLowerCase(), weight: font?.weight ?? edit.weight ?? layer.weight } : {}), maxWidth: Math.min(layer.maxWidth ?? base.width, Math.max(1, base.width - layer.x - Math.max(0, Math.min(layer.x, 100)))) };
    }),
  };
}

export function validateArtwork(base: PrintProject, templateId: string, input: unknown): { ok: true; artwork: RequestArtwork } | { ok: false; errors: FieldError[] } {
  const texts = editableTexts(base);
  const invalid = (message: string) => ({ ok: false as const, errors: [{ key: "artwork", message }] });
  if (!texts.length) return invalid("Esta base não tem textos editáveis. Escolha outra base.");
  if (!Array.isArray(input) || input.length !== texts.length) return invalid("Confira todos os textos da sua arte.");
  const fonts = artworkFonts(base);
  const layers: RequestArtwork["layers"] = [];
  const errors: FieldError[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid("A personalização da arte é inválida.");
    const edit = raw as Record<string, unknown>;
    const layer = texts.find((l) => l.id === edit.id);
    if (!layer || seen.has(layer.id)) return invalid("A arte contém um texto desconhecido ou repetido.");
    seen.add(layer.id);
    const key = `artwork.${layer.id}`;
    if (typeof edit.text !== "string" || typeof edit.fontId !== "string" || typeof edit.color !== "string") return invalid("Confira os textos, fontes e cores da arte.");
    const text = normalizeArtworkText(edit.text);
    const problem = problemWith(text.replaceAll("\n", " "), 200);
    const maxLines = Math.max(1, layer.text.split("\n").length);
    const font = fonts.find((f) => f.id === edit.fontId);
    if (!text || problem) errors.push({ key, message: `${layer.name}: ${problem ?? "escreva o texto"}` });
    else if (text.split("\n").length > maxLines) errors.push({ key, message: `${layer.name}: use até ${maxLines} linha(s), como na base.` });
    else if (!font) errors.push({ key, message: `${layer.name}: escolha uma fonte desta base.` });
    else if (!/^#[\da-f]{6}$/i.test(edit.color)) errors.push({ key, message: `${layer.name}: escolha uma cor válida.` });
    else {
      const fontProblem = pdfFontCharacterError(edit.fontId, text);
      if (fontProblem) errors.push({ key, message: fontProblem });
      const weight = edit.weight === undefined ? undefined : fontOptionWeight(font);
      layers.push({ id: layer.id, name: layer.name, text, fontId: edit.fontId, fontName: font.name, color: edit.color.toLowerCase(), ...(weight === undefined ? {} : { weight }) });
    }
  }
  layers.sort((a, b) => texts.findIndex((l) => l.id === a.id) - texts.findIndex((l) => l.id === b.id));
  return errors.length ? { ok: false, errors } : { ok: true, artwork: { templateId, templateName: base.name, layers } };
}
