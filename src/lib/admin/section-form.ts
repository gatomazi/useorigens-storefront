/**
 * Turns the section editor's form fields into a validated patch. Pure (takes anything with `get(name)`), so every field is unit-tested
 * without a browser. Nothing from the form is trusted: each value is parsed into the closed vocabulary of the contract and the result still
 * goes through `validateSection` in `applyOp`.
 */
import { EDITORIAL_MODULE_KEYS, GRID_ASPECTS, GRID_COLUMNS, GRID_LABELS, MAX_GRID_TILES, MIN_GRID_TILES, MAX_ARRANGED_IDS, OVERLAY_PRESETS, type Appearance, type Color, type CommerceStoreKey, type Destination, type Fill, type GridLayout, type GridTile, type Overlay, type Section, type Source } from "./contract";
import { STATE_NAMES } from "../geo/regions";
import type { Editable } from "./draft-ops";
import { ARTICLE_KINDS } from "../umapenca/types";

type Fields = { get(name: string): FormDataEntryValue | null };

const str = (f: Fields, name: string): string => {
  const v = f.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const num = (f: Fields, name: string, fallback: number): number => {
  const v = Number.parseFloat(str(f, name));
  return Number.isFinite(v) ? v : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "use-sul:152188" → store + id, or null. */
export function parseCollectionRef(value: string): { store: CommerceStoreKey; collectionId: number } | null {
  const m = /^(use-sul|use-norte|use-centro):(\d{1,12})$/.exec(value);
  return m ? { store: m[1] as CommerceStoreKey, collectionId: Number(m[2]) } : null;
}

function parseFill(f: Fields): Fill {
  const kind = str(f, "fill_kind");
  if (kind === "solid") {
    const pick = str(f, "fill_color_choice");
    const color = (pick.startsWith("token:") ? pick : str(f, "fill_color")) as Color;
    return { kind: "solid", color };
  }
  if (kind === "gradient") return { kind: "gradient", from: str(f, "grad_from") as Color, to: str(f, "grad_to") as Color, angle: clamp(num(f, "grad_angle", 180), 0, 360) };
  return { kind: "none" };
}

function parseOverlay(f: Fields): Overlay {
  if (str(f, "overlay_kind") === "custom") return { color: str(f, "overlay_color") as `#${string}`, opacity: clamp(num(f, "overlay_opacity", 0.4), 0, 0.85) };
  const preset = str(f, "overlay_preset");
  return { preset: (OVERLAY_PRESETS as readonly string[]).includes(preset) ? (preset as (typeof OVERLAY_PRESETS)[number]) : "none" };
}

function parseAppearance(f: Fields, current: Appearance): Appearance {
  const decorative = f.get("img_decorative") !== null;
  const alt = decorative ? "" : str(f, "img_alt");
  const ref = (assetId: string) => (assetId ? { assetId, alt, decorative } : undefined);
  const mobile = ref(str(f, "img_mobile"));
  const desktop = ref(str(f, "img_desktop"));
  const image = mobile || desktop ? { ...(mobile ? { mobile } : {}), ...(desktop ? { desktop } : {}), ...(f.get("reuse_mobile") !== null ? { reuseMobileOnDesktop: true } : {}) } : undefined;
  return {
    fill: parseFill(f),
    image,
    focal: {
      mobile: { x: clamp(num(f, "focal_mx", current.focal.mobile.x), 0, 100), y: clamp(num(f, "focal_my", current.focal.mobile.y), 0, 100) },
      desktop: { x: clamp(num(f, "focal_dx", current.focal.desktop.x), 0, 100), y: clamp(num(f, "focal_dy", current.focal.desktop.y), 0, 100) },
    },
    overlay: parseOverlay(f),
  };
}

/** "hotpage/dia-dos-pais" → a page destination, or null. */
export function parsePageRef(value: string): Destination | null {
  const m = /^(hotpage|categoryLanding)\/([a-z0-9-]{2,60})$/.exec(value);
  return m ? { kind: "page", pageKind: m[1] as "hotpage" | "categoryLanding", slug: m[2] } : null;
}

/** A destination from the `<prefix>_kind` field and the one field of that kind (`<prefix>_collection`, `_url`, `_route`, `_page`, `_anchor`), or null. */
function parseDest(f: Fields, prefix: string): Destination | null {
  const kind = str(f, `${prefix}_kind`);
  if (kind === "ink-collection") {
    const ref = parseCollectionRef(str(f, `${prefix}_collection`));
    return ref ? { kind: "ink-collection", ...ref } : null;
  }
  if (kind === "external") return { kind: "external", url: str(f, `${prefix}_url`) };
  if (kind === "route") return { kind: "route", path: str(f, `${prefix}_route`) };
  if (kind === "page") return parsePageRef(str(f, `${prefix}_page`));
  if (kind === "anchor") return { kind: "anchor", anchor: str(f, `${prefix}_anchor`) };
  return null;
}

function parseCta(f: Fields): Section["cta"] | undefined {
  const dest = parseDest(f, "cta");
  return dest ? { label: str(f, "cta_label") || "Ver todos", dest } : undefined;
}

/**
 * The image grid's tile rows `tile_<i>_*` (i < `tile_count`), in order. A row with neither a name nor a picture is an empty slot and is skipped;
 * a row missing its name or its destination is reported in plain words (`problems`) instead of reaching the validator as a cryptic path.
 * Tile pictures are always decorative: the tile's name is the link text.
 */
export function parseGridTiles(f: Fields): { tiles: GridTile[]; problems: string[] } {
  const tiles: GridTile[] = [];
  const problems: string[] = [];
  const rows = clamp(Math.round(num(f, "tile_count", 0)), 0, MAX_GRID_TILES);
  let n = 0; // the tile's number as the editor shows it (empty slots don't count)
  for (let i = 0; i < rows; i++) {
    const label = str(f, `tile_${i}_label`);
    const assetId = str(f, `tile_${i}_image`);
    if (!label && !assetId) continue;
    n++;
    const dest = parseDest(f, `tile_${i}`);
    if (!label) problems.push(`Bloco ${n}: falta o nome.`);
    if (!dest) problems.push(`Bloco ${n}${label ? ` ("${label}")` : ""}: escolha para onde ele leva.`);
    if (!label || !dest) continue;
    const caption = str(f, `tile_${i}_caption`);
    tiles.push({ label, ...(caption ? { caption } : {}), ...(assetId ? { image: { assetId, alt: "", decorative: true } } : {}), dest });
  }
  if (problems.length === 0 && tiles.length < MIN_GRID_TILES) problems.push(`A grade precisa de pelo menos ${MIN_GRID_TILES} blocos.`);
  return { tiles, problems };
}

function parseGridLayout(f: Fields, current: GridLayout | undefined): GridLayout {
  const columns = Number(str(f, "grid_columns"));
  const aspect = str(f, "grid_aspect");
  const labels = str(f, "grid_labels");
  return {
    columns: (GRID_COLUMNS as readonly number[]).includes(columns) ? (columns as GridLayout["columns"]) : current?.columns ?? 4,
    aspect: (GRID_ASPECTS as readonly string[]).includes(aspect) ? (aspect as GridLayout["aspect"]) : current?.aspect ?? "portrait",
    labels: (GRID_LABELS as readonly string[]).includes(labels) ? (labels as GridLayout["labels"]) : current?.labels ?? "below",
  };
}

const inkIds = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === "string" && /^\d{1,20}$/.test(id)))].slice(0, MAX_ARRANGED_IDS) : []);

/**
 * The order / hidden products of an ink-category source. The panel's list posts them (`source_arrangement`, JSON) together with the collection it
 * was drawn for (`source_arrangement_for`): they only apply to THAT collection. Choosing another collection starts over in INK's order; a form
 * without the list (the collection did not resolve, so no list was drawn) keeps what is saved, so a save never wipes the owner's order.
 */
function parseArrangement(f: Fields, ref: string, current: Source | undefined): Pick<Extract<Source, { kind: "ink-category" }>, "order" | "productIds" | "hiddenIds"> {
  const raw = f.get("source_arrangement");
  if (typeof raw === "string" && str(f, "source_arrangement_for") === ref) {
    try {
      const v = JSON.parse(raw) as { order?: unknown; productIds?: unknown; hiddenIds?: unknown };
      const hiddenIds = inkIds(v.hiddenIds);
      const productIds = v.order === "manual" ? inkIds(v.productIds) : [];
      return { order: productIds.length > 0 ? "manual" : "category", ...(productIds.length > 0 ? { productIds } : {}), ...(hiddenIds.length > 0 ? { hiddenIds } : {}) };
    } catch {
      // A malformed list is ignored like a missing one.
    }
  }
  if (current?.kind === "ink-category" && `${current.store}:${current.collectionId}` === ref) {
    return { order: current.order, ...(current.productIds ? { productIds: current.productIds } : {}), ...(current.hiddenIds ? { hiddenIds: current.hiddenIds } : {}) };
  }
  return { order: "category" };
}

function parseSource(f: Fields, current: Source | undefined): Source | undefined {
  const kind = str(f, "source_kind");
  if (kind === "editorial-module") {
    const key = str(f, "source_module");
    return (EDITORIAL_MODULE_KEYS as readonly string[]).includes(key) ? { kind: "editorial-module", key: key as (typeof EDITORIAL_MODULE_KEYS)[number] } : current;
  }
  if (kind === "ink-category") {
    const ref = parseCollectionRef(str(f, "source_collection"));
    if (!ref) return current;
    return { kind: "ink-category", ...ref, ...parseArrangement(f, `${ref.store}:${ref.collectionId}`, current), limit: clamp(Math.round(num(f, "source_limit", 6)), 3, 24) };
  }
  if (kind === "umapenca") {
    // Checkboxes `source_up_<kind>`: none ticked keeps the current source (the schema refuses an empty list anyway).
    const articleKinds = ARTICLE_KINDS.filter((k) => f.get(`source_up_${k}`) !== null);
    if (articleKinds.length === 0) return current;
    return { kind: "umapenca", articleKinds, limit: clamp(Math.round(num(f, "source_limit", 8)), 3, 24) };
  }
  return current;
}

/**
 * Initial values of the customizer-card fields in the section editor. The suggested texts only fill a card that does not exist yet: once the card
 * is saved, what was saved is shown as-is — an optional description saved empty stays empty instead of coming back on the next save.
 */
export function customizerCardFieldDefaults(card: Section["customizerCard"]): { title: string; button: string; description: string } {
  if (!card) return { title: "Personalize a sua nesse modelo", button: "Personalizar", description: "Escolha as palavras que contam sua história" };
  return { title: card.title, button: card.button, description: card.description ?? "" };
}

export function parseSectionForm(f: Fields, section: Section): Partial<Editable> {
  const patch: Partial<Editable> = {};
  // A field that is not in the form is left alone; a field that is present and empty clears the value (a carousel's title is then rejected).
  if (f.get("title") !== null) patch.title = str(f, "title") || undefined;
  if (f.get("subtitle") !== null) patch.subtitle = str(f, "subtitle") || undefined;
  if (section.template === "product-carousel" || section.template === "campaign" || section.template === "hero" || section.template === "city-styles" || section.template === "states" || section.template === "page-hero" || section.template === "image-grid") {
    patch.appearance = parseAppearance(f, section.appearance);
  }
  if (section.template === "product-carousel") {
    patch.cta = parseCta(f);
    patch.source = parseSource(f, section.source);
    const variant = str(f, "layout_variant") === "poster" ? "poster" : "standard";
    const tone = str(f, "layout_tone") === "dark" ? "dark" : "light";
    const surfaceRaw = str(f, "layout_surface");
    const surface = surfaceRaw === "paper" || surfaceRaw === "region-primary" ? surfaceRaw : "plain";
    patch.layout = { variant, tone, surface };
  }
  if (section.template === "page-hero") {
    patch.cta = parseCta(f);
    patch.layout = { variant: "standard", tone: str(f, "layout_tone") === "light" ? "light" : "dark", surface: "region-primary" };
  }
  if (section.template === "product-carousel" && f.get("cc_present") !== null) {
    // The reserved first card ("personalize yours"). Only the reference and the card's own texts are stored; the model itself is validated on save and on publish.
    const customizerId = str(f, "cc_customizer");
    if (f.get("cc_show") !== null && customizerId) {
      const imageId = str(f, "cc_image");
      const alt = str(f, "cc_alt");
      patch.customizerCard = {
        customizerId,
        ...(imageId ? { image: { assetId: imageId, alt, decorative: alt === "" } } : {}),
        title: str(f, "cc_title"),
        ...(str(f, "cc_description") ? { description: str(f, "cc_description") } : {}),
        button: str(f, "cc_button"),
      };
    } else patch.customizerCard = undefined;
  }
  if (section.template === "campaign") {
    patch.fallback = str(f, "fallback") === "fill" ? "fill" : "crops";
    // No button configured = the original "Encontrar minha cidade" search; a label without a destination is dropped, never a dead link.
    patch.cta = parseCta(f);
  }
  if (section.template !== "hero" && section.template !== "footer" && section.template !== "page-hero" && f.get("nav_present") !== null && f.get("page_scope") === null) {
    // "Mostrar no menu" + the apelido; unchecked clears it. An empty apelido is not defaulted here: the validator refuses it and says so.
    const navDest = str(f, "nav_dest") ? parsePageRef(str(f, "nav_dest")) : null;
    patch.nav = f.get("nav_show") !== null ? { label: str(f, "nav_label"), ...(navDest ? { dest: navDest } : {}) } : undefined;
  }
  if (section.template === "states" && f.get("state_covers_present") !== null) {
    // One picture per state; an empty choice clears that state's cover (it then keeps the code's own cover, if any).
    const covers: Record<string, { assetId: string; alt: string; decorative: boolean }> = {};
    for (const uf of Object.keys(STATE_NAMES)) {
      const assetId = str(f, `state_cover_${uf}`);
      if (!assetId) continue;
      const alt = str(f, `state_alt_${uf}`);
      covers[uf] = { assetId, alt, decorative: alt === "" };
    }
    patch.stateCovers = Object.keys(covers).length > 0 ? covers : undefined;
  }
  if (section.template === "image-grid" && f.get("grid_present") !== null) {
    patch.grid = parseGridLayout(f, section.grid);
    patch.tiles = parseGridTiles(f).tiles; // the caller refuses the save when `parseGridTiles` reports problems
  }
  if (section.template === "city-styles" && f.get("count") !== null) patch.count = clamp(Math.round(num(f, "count", 8)), 1, 8);
  return patch;
}

/**
 * The hero's featured-product fields: `featured_1..3` hold "store:productId" (or nothing). Returns the references in slot order (empty slots
 * closed up: the cards are a list, not fixed holes) and the malformed values, which are refused instead of silently dropped.
 */
export function parseFeaturedFields(f: Fields): { refs: { store: CommerceStoreKey; productId: string }[]; invalid: string[] } {
  const refs: { store: CommerceStoreKey; productId: string }[] = [];
  const invalid: string[] = [];
  for (const slot of [1, 2, 3]) {
    const raw = str(f, `featured_${slot}`);
    if (!raw) continue;
    const m = /^(use-sul|use-norte|use-centro):(\d{1,20})$/.exec(raw);
    if (m) refs.push({ store: m[1] as CommerceStoreKey, productId: m[2] });
    else invalid.push(`posição ${slot}`);
  }
  return { refs, invalid };
}
