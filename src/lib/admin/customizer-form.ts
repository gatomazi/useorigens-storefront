/**
 * Turns the model editor's form into a patch for `update-customizer`. Pure. Nothing from the form is trusted: every value is parsed into the closed
 * shape of the contract (the schema validates it again when the op is applied and when the model is published).
 */
import type { CommerceStoreKey } from "../geo/regions";
import { MAX_ART_VERSIONS, MAX_CUSTOM_FIELDS, MAX_STUDIO_ARTS, STUDIO_TEMPLATE_ID, customizerProductLabel, isUmaPencaSource, type CustomField, type Customizer, type LineGroup, type MediaRef, type StudioArt } from "../site-config/schema";
import { ARTICLE_KINDS, type ArticleKind } from "../umapenca/types";

type Fields = { get(name: string): FormDataEntryValue | null };
const str = (f: Fields, name: string): string => {
  const v = f.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const int = (f: Fields, name: string, fallback: number): number => {
  const n = Number.parseInt(str(f, name), 10);
  return Number.isFinite(n) ? n : fallback;
};

/** `Nome da cidade` → `nome_da_cidade` (a stable field key). */
export function fieldKeyOf(label: string): string {
  const base = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28);
  return /^[a-z]/.test(base) ? base : `campo_${base}`.slice(0, 30);
}

const media = (id: string, alt: string): MediaRef | undefined => (id ? { assetId: id, alt, decorative: alt === "" } : undefined);

/**
 * The model's "Origem" select: `ink` (a shirt sold on the region's INK store, the default — also when the field is absent) or `umapenca:<kind>`
 * (a "Crie a sua" caneca/ecobag sold on Uma Penca). Anything else falls back to INK, the shape every existing model already has.
 */
export function parseOrigin(raw: string): { kind: "ink" } | { kind: "umapenca"; articleKind: ArticleKind } {
  const m = /^umapenca:([a-z]+)$/.exec(raw);
  return m && (ARTICLE_KINDS as readonly string[]).includes(m[1]) ? { kind: "umapenca", articleKind: m[1] as ArticleKind } : { kind: "ink" };
}

/**
 * The arts editor's rows (`studio_arts_json`): rows with nothing chosen are dropped; a named art needs a base, and an art with several versions
 * needs a name for each ("Adulto", "Infantil"). With a single version its name is not shown to the customer, so it is not kept.
 */
export function parseStudioArts(raw: string): { arts: StudioArt[]; errors: string[] } {
  const errors: string[] = [];
  let rows: unknown;
  try { rows = JSON.parse(raw || "[]"); } catch { return { arts: [], errors: ["Não foi possível ler as artes do estúdio. Recarregue a página."] }; }
  if (!Array.isArray(rows)) return { arts: [], errors: ["Não foi possível ler as artes do estúdio. Recarregue a página."] };
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arts: StudioArt[] = [];
  for (const row of rows) {
    const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const label = text(r.label);
    const versions = (Array.isArray(r.versions) ? r.versions : []).map((v) => {
      const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return { label: text(o.label), templateId: text(o.templateId), lightTemplateId: text(o.lightTemplateId), garment: o.garment === "infantil" ? ("infantil" as const) : undefined };
    }).filter((v) => v.label || v.templateId || v.lightTemplateId);
    if (!label && versions.length === 0) continue;
    const name = label || `Arte ${arts.length + 1}`;
    if (!label) errors.push(`Dê um nome à ${name}: é o que o cliente vê no seletor.`);
    if (label.length > 40) errors.push(`O nome “${label.slice(0, 40)}…” passa de 40 caracteres.`);
    if (versions.length === 0) errors.push(`Escolha a base da arte “${name}”.`);
    if (versions.length > MAX_ART_VERSIONS) errors.push(`A arte “${name}” pode ter no máximo ${MAX_ART_VERSIONS} versões.`);
    for (const v of versions) {
      if (!v.templateId) errors.push(`Escolha a base da camiseta escura em cada versão de “${name}”; a da camiseta clara é opcional.`);
      if ([v.templateId, v.lightTemplateId].some((id) => id && !STUDIO_TEMPLATE_ID.test(id))) errors.push(`Escolha bases válidas do estúdio para “${name}”.`);
      if (versions.length > 1 && !v.label) errors.push(`Dê um nome a cada versão de “${name}” (por exemplo, Adulto e Infantil).`);
      if (v.label.length > 40) errors.push(`O nome da versão “${v.label.slice(0, 40)}…” passa de 40 caracteres.`);
    }
    arts.push({ label: name, versions: versions.map((v) => ({ ...(versions.length > 1 ? { label: v.label } : {}), templateId: v.templateId, ...(v.lightTemplateId ? { lightTemplateId: v.lightTemplateId } : {}), ...(v.garment ? { garment: v.garment } : {}) })) });
  }
  if (arts.length > MAX_STUDIO_ARTS) errors.push(`No máximo ${MAX_STUDIO_ARTS} artes por modelo.`);
  const ids = arts.flatMap((a) => a.versions.flatMap((v) => [v.templateId, v.lightTemplateId].filter(Boolean)));
  if (new Set(ids).size !== ids.length) errors.push("Cada base do estúdio só pode aparecer uma vez no modelo.");
  return { arts, errors: [...new Set(errors)] };
}

/** "109,90", "R$ 109,90" or "109.90" as INK takes it ("109.90"); null when it is not a price. */
export function inkPrice(raw: string): string | null {
  const m = /^(?:R\$\s*)?(\d{1,4})(?:[.,](\d{2}))?$/.exec(raw.trim());
  return m ? `${m[1]}.${m[2] ?? "00"}` : null;
}

export type ParsedCustomizer = { patch: Partial<Omit<Customizer, "id" | "version">>; errors: string[] };

export function parseCustomizerForm(f: Fields, current: Customizer, region: { store: CommerceStoreKey }, opts: { slugLocked: boolean }): ParsedCustomizer {
  const errors: string[] = [];
  const patch: ParsedCustomizer["patch"] = {};
  patch.name = str(f, "name");
  if (!opts.slugLocked && str(f, "slug")) patch.slug = str(f, "slug");
  patch.description = str(f, "description") || undefined;

  const origin = parseOrigin(str(f, "source_origin"));
  if (origin.kind === "umapenca") {
    patch.source = { kind: "umapenca", articleKind: origin.articleKind };
    if (current.inkProductId) patch.inkProductId = undefined;
  } else {
    const src = /^(use-sul|use-norte|use-centro):(\d{1,12})$/.exec(str(f, "source_collection"));
    if (src) {
      if (src[1] !== region.store) errors.push("Esta coleção pertence a outra loja da INK: cada região usa só as coleções da própria loja.");
      else patch.source = { store: src[1] as CommerceStoreKey, collectionId: Number(src[2]) };
    } else if (isUmaPencaSource(current.source)) errors.push("Para vender pela INK, escolha a coleção da INK do modelo nas sugestões.");
  }

  patch.cardImage = media(str(f, "card_image"), str(f, "card_alt"));
  const mockupId = str(f, "mockup_image");
  const mockupAlt = str(f, "mockup_alt") || (mockupId ? `${customizerProductLabel(patch.source ?? current.source)} ${patch.name || current.name}` : "");
  patch.pageMockup = mockupId ? { assetId: mockupId, alt: mockupAlt, decorative: false } : undefined;
  patch.active = f.get("active") !== null;
  // Absent (bases could not be listed) keeps the arts as they are; the editor posts an empty list to turn the art editor off.
  if (f.get("studio_arts_json") !== null) {
    const parsed = parseStudioArts(str(f, "studio_arts_json"));
    errors.push(...parsed.errors);
    if (parsed.errors.length === 0) patch.studioArts = parsed.arts.length ? parsed.arts : undefined;
  }
  // Direct purchase: only when the form carries its block (the hidden marker), so a form without it never turns it off.
  if (f.get("direct_form") !== null) {
    const enabled = f.get("direct_enabled") !== null;
    const price = inkPrice(str(f, "direct_price"));
    const kidsPrice = inkPrice(str(f, "direct_kids_price"));
    const category = str(f, "direct_collection");
    const inkCollectionId = /^\d{1,12}$/.test(category) && Number(category) > 0 ? Number(category) : undefined;
    const arts = patch.studioArts ?? current.studioArts ?? [];
    const kids = arts.some((a) => a.versions.some((v) => v.garment === "infantil"));
    if (str(f, "direct_price") && !price) errors.push("Preço da camiseta inválido: use o formato 109,90.");
    if (str(f, "direct_kids_price") && !kidsPrice) errors.push("Preço da Camiseta Infantil inválido: use o formato 96,00.");
    if (category && !inkCollectionId) errors.push("Categoria da INK inválida.");
    if (enabled && !arts.length) errors.push("A compra direta precisa das artes do estúdio.");
    if (enabled && !price) errors.push("Informe o preço da camiseta para ligar a compra direta.");
    if (enabled && kids && !kidsPrice) errors.push("Informe o preço da Camiseta Infantil: uma versão é infantil.");
    patch.directPurchase = price || enabled ? { enabled, price: price ?? "109.90", ...(kidsPrice ? { kidsPrice } : {}), ...(inkCollectionId ? { inkCollectionId } : {}) } : undefined;
  }

  // Fields: a JSON list maintained by the editor's add/remove rows. Keys are stable once a field exists; a new row gets one from its label.
  const raw = str(f, "fields_json");
  if (raw) {
    try {
      const list = JSON.parse(raw) as unknown;
      if (!Array.isArray(list)) throw new Error("not a list");
      if (list.length > MAX_CUSTOM_FIELDS) errors.push(`No máximo ${MAX_CUSTOM_FIELDS} campos.`);
      const seen = new Set<string>();
      patch.fields = list.slice(0, MAX_CUSTOM_FIELDS).map((row, i): CustomField => {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        const label = typeof r.label === "string" ? r.label.trim() : "";
        let key = typeof r.key === "string" && /^[a-z][a-z0-9_]{0,29}$/.test(r.key) ? r.key : fieldKeyOf(label || `campo ${i + 1}`);
        for (let n = 2; seen.has(key); n++) key = `${key.slice(0, 26)}_${n}`;
        seen.add(key);
        const text = (name: string) => (typeof r[name] === "string" && (r[name] as string).trim() ? (r[name] as string).trim() : undefined);
        const maxLength = Number.isInteger(r.maxLength) ? (r.maxLength as number) : 30;
        return { key, label, type: "text", required: r.required === true, maxLength, position: i + 1, ...(text("placeholder") ? { placeholder: text("placeholder") } : {}), ...(text("helperText") ? { helperText: text("helperText") } : {}), ...(text("defaultValue") ? { defaultValue: text("defaultValue") } : {}) };
      });
    } catch {
      errors.push("A lista de campos está inválida: recarregue a página e tente de novo.");
    }
  } else patch.fields = [];

  if (f.get("lg_show") !== null) {
    const group: LineGroup = {
      key: str(f, "lg_key") || "linhas",
      label: str(f, "lg_label") || "Linhas",
      lineLabel: str(f, "lg_line_label") || "Linha {n}",
      min: int(f, "lg_min", 1),
      initial: int(f, "lg_initial", 4),
      max: int(f, "lg_max", 6),
      maxLength: int(f, "lg_maxlength", 18),
      ...(str(f, "lg_helper") ? { helperText: str(f, "lg_helper") } : {}),
      ...(str(f, "lg_placeholder") ? { placeholder: str(f, "lg_placeholder") } : {}),
    };
    const defaults = str(f, "lg_defaults").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 10);
    if (defaults.length > 0) group.defaults = defaults;
    patch.lineGroup = group;
  } else patch.lineGroup = undefined;
  return { patch, errors };
}
