import { BUILTIN_FONTS, type PrintProject, type TextLayer, type TextSlot } from "../print-studio/model";
import { pdfFontCharacterError } from "../print-studio/pdf-fonts";
import { fontOptionWeight } from "../print-studio/font-options";
import { normalizeValue, problemWith, type FieldError } from "./validate";

export type ArtworkEdit = { id: string; text: string; fontId: string; color: string; weight?: number };
export type RequestArtwork = {
  templateId: string;
  templateName: string;
  layers: (ArtworkEdit & { name: string; fontName: string })[];
  /** Present when the base has slots: the customer's answers, from which `layers` were built. */
  fields?: { id: string; label: string; value: string }[];
  /** On a page with several arts or versions: the one picked ("Eu vim pela ceia · Infantil"). */
  choice?: string;
};
export type ArtworkField = { id: string; label: string; maxLength: number; example: string };
export type ArtworkInput = { layers?: unknown; fields?: unknown };

const slotLayers = (project: PrintProject) => project.layers.filter((l): l is TextLayer & { slot: TextSlot } => l.visible && l.kind === "text" && Boolean(l.slot));
/** One question per slot field, in layer order. A base with slots locks every other text, font and colour. */
export function artworkFields(project: PrintProject): ArtworkField[] {
  const out: ArtworkField[] = [];
  for (const { slot } of slotLayers(project)) if (!out.some((f) => f.id === slot.field)) out.push({ id: slot.field, label: slot.label, maxLength: slot.maxLength, example: slot.example });
  return out;
}
export const editableTexts = (project: PrintProject): TextLayer[] => slotLayers(project).length ? [] : project.layers.filter((l): l is TextLayer => l.visible && l.kind === "text");
export const artworkFonts = (project: PrintProject) => [...BUILTIN_FONTS, ...project.fonts];
export const initialArtworkEdits = (project: PrintProject): ArtworkEdit[] => editableTexts(project).map(({ id, text, fontId, color }) => ({ id, text, fontId, color }));
const normalizeArtworkText = (text: string) => text.split(/\r?\n/).map(normalizeValue).join("\n").trim();
export const initialFieldValues = (project: PrintProject): Record<string, string> => Object.fromEntries(artworkFields(project).map((f) => [f.id, f.example]));

// Latin-1 letters only: every font offered for a slot is checked to cover them when the base is prepared.
const NAME = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '’.-]+[A-Za-zÀ-ÖØ-öø-ÿ]+)*\.?$/;
const PARTICLES = new Set(["da", "das", "de", "di", "do", "dos", "du", "e", "van", "von"]);
function applyCase(value: string, textCase: TextSlot["textCase"]) {
  if (textCase === "upper") return value.toLocaleUpperCase("pt-BR");
  if (textCase === "none") return value;
  return value.toLocaleLowerCase("pt-BR").replace(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g, (word, at: number) => at > 0 && PARTICLES.has(word) ? word : word[0].toLocaleUpperCase("pt-BR") + word.slice(1));
}

const PARTICLE_START = /^d[ao]s?\s+/i; // da, das, do, dos: "de", "di" e "du" fazem parte de sobrenomes como De Lucca e Di Napoli
/** Where the art already says "dos", an answer typed as "dos Santos" or "da Silva" drops its own leading particle. */
function slotValue(slot: TextSlot, raw: string) {
  const value = normalizeValue(raw);
  return slot.dropParticle ? value.replace(PARTICLE_START, "") : value;
}
/** Words, with particles kept with the next word ("dos Santos"), split into at most `maxLines` lines of balanced length. */
function breakLines(text: string, maxLines: number) {
  const groups: string[] = [];
  for (const word of text.split(" ")) {
    const last = groups.at(-1);
    if (last !== undefined && PARTICLES.has(last.toLocaleLowerCase("pt-BR").split(" ").at(-1)!)) groups[groups.length - 1] = `${last} ${word}`;
    else groups.push(word);
  }
  if (maxLines < 2 || groups.length < 2) return text;
  if (maxLines === 2 || groups.length === 2) {
    let best = 1;
    for (let i = 1; i < groups.length; i++) {
      const width = (k: number) => Math.max(groups.slice(0, k).join(" ").length, groups.slice(k).join(" ").length);
      if (width(i) < width(best)) best = i;
    }
    return `${groups.slice(0, best).join(" ")}\n${groups.slice(best).join(" ")}`;
  }
  return [groups.slice(0, Math.ceil(groups.length / 3)), groups.slice(Math.ceil(groups.length / 3), Math.ceil(groups.length * 2 / 3)), groups.slice(Math.ceil(groups.length * 2 / 3))].map((g) => g.join(" ")).filter(Boolean).join("\n");
}

/** The slot layers' texts for these answers, as edits on the base's own font and colour. */
export function fieldEdits(base: PrintProject, values: Record<string, string>): ArtworkEdit[] {
  return slotLayers(base).map(({ id, fontId, color, slot }) => {
    const value = breakLines(applyCase(slotValue(slot, values[slot.field] ?? ""), slot.textCase), slot.maxLines ?? 1);
    return { id, fontId, color, text: slot.template.replace(`{${slot.field}}`, value) };
  });
}

export function validateArtworkFields(base: PrintProject, templateId: string, input: unknown): { ok: true; artwork: RequestArtwork } | { ok: false; errors: FieldError[] } {
  const fields = artworkFields(base);
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: [{ key: "artwork", message: "A personalização da arte é inválida." }] };
  const raw = input as Record<string, unknown>;
  const values: Record<string, string> = {};
  const errors: FieldError[] = [];
  for (const field of fields) {
    const value = typeof raw[field.id] === "string" ? normalizeValue(raw[field.id] as string) : "";
    const problem = problemWith(value, field.maxLength);
    if (!value) errors.push({ key: `artwork.${field.id}`, message: `${field.label}: escreva o ${field.label.toLowerCase()}` });
    else if (problem) errors.push({ key: `artwork.${field.id}`, message: `${field.label}: ${problem}` });
    else if (!NAME.test(value)) errors.push({ key: `artwork.${field.id}`, message: `${field.label}: use só letras, espaço, hífen ou apóstrofo` });
    else if (slotLayers(base).some(({ slot }) => slot.field === field.id && !slotValue(slot, value))) errors.push({ key: `artwork.${field.id}`, message: `${field.label}: escreva o sobrenome depois de “${value}”` });
    values[field.id] = value;
  }
  if (errors.length) return { ok: false, errors };
  const fonts = artworkFonts(base);
  const layers = fieldEdits(base, values).map((edit) => {
    const layer = slotLayers(base).find((l) => l.id === edit.id)!;
    return { ...edit, name: layer.name, fontName: fonts.find((f) => f.id === edit.fontId)?.name ?? edit.fontId };
  });
  return { ok: true, artwork: { templateId, templateName: base.name, layers, fields: fields.map((f) => ({ id: f.id, label: f.label, value: values[f.id] })) } };
}

/** The storefront sends `fields` for a base with slots and `layers` for a free text base; the base decides which one is accepted. */
export function validateArtworkInput(base: PrintProject, templateId: string, input: ArtworkInput) {
  return artworkFields(base).length ? validateArtworkFields(base, templateId, input.fields) : validateArtwork(base, templateId, input.layers);
}

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
      return { ...layer, ...(edit ? { text: normalizeArtworkText(edit.text), fontId: edit.fontId, color: edit.color.toLowerCase(), weight: font?.weight ?? edit.weight ?? layer.weight } : {}), ...(layer.boxWidth ? {} : { maxWidth: Math.min(layer.maxWidth ?? base.width, Math.max(1, base.width - layer.x - Math.max(0, Math.min(layer.x, 100)))) }) };
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
