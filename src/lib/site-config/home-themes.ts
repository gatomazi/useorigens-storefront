/**
 * The two THEMES of a region's home (`ScopeDoc.homeTheme`): "original", the look the store has had, and "editorial", the approved editorial direction.
 * Like the themes of a shop platform, each keeps its own sections (the same section types, edited with the same editor); switching swaps the lists and
 * nothing is lost. Pure (no I/O): the panel, the draft operations, the tests and the preview script share it.
 *
 * The first time a region switches to the editorial theme, its sections are built from the ones it already has (`editorialSeed`): the same hero,
 * state chooser, city styles and campaign in their editorial compositions, plus the collection cards and a short selection when the region's store
 * has those collections. Every other section is carried over: the ones the editorial composition already covers (the curated showcases) switched
 * off, the rest as they were. From then on the owner edits that theme like any home.
 */
import type { RegionSlug } from "../geo/regions";
import type { ThemeConfig } from "./navigation-schema";
import { homeThemeOf, type Appearance, type CollectionRef, type GridTile, type HomeThemeName, type KeptHomeTheme, type ScopeDoc, type Section } from "./schema";
import { structuredDefaults, uniqueAnchor } from "./structured";

export const HOME_THEME_LABEL: Record<HomeThemeName, string> = { original: "Original", editorial: "Editorial" };

/** The collections the editorial composition is built on, by their slug in the region's store (resolved on the server from the synced snapshot). */
export const EDITORIAL_COLLECTION_SLUGS = { terra: "da-nossa-terra", fala: "fala-daqui", jeito: "do-nosso-jeito", novidades: "novidades" } as const;
export type EditorialCollections = Partial<Record<keyof typeof EDITORIAL_COLLECTION_SLUGS, CollectionRef>>;

const plain = (fill: Appearance["fill"] = { kind: "none" }): Appearance => ({ fill, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } });
/** A sage of the editorial green: the product half of the opening. */
const SAGE = "#dfe3d3";

/**
 * The editorial theme's first sections, built from the region's current ones. `collections`: the real collections found in the region's store (any of
 * them may be missing: the parts that need it are left out, never pointed elsewhere). `newId`: ids for the sections it adds.
 */
export function editorialSeed(region: RegionSlug, sections: readonly Section[], collections: EditorialCollections, newId: () => string): Section[] {
  const taken = new Set(sections.map((s) => s.anchor));
  const find = (template: Section["template"]) => sections.find((s) => s.template === template);
  const make = (template: "states" | "city-styles" | "campaign") => {
    const s = structuredDefaults(template, region, newId(), taken);
    taken.add(s.anchor);
    return s;
  };
  const hero = find("hero")!;
  const footer = find("footer")!;
  const states = find("states") ?? make("states");
  const styles = find("city-styles") ?? make("city-styles");
  const campaign = find("campaign") ?? make("campaign");
  const { terra, fala, jeito, novidades } = collections;
  const page = (ref: CollectionRef) => ({ kind: "collection-page" as const, store: ref.store, collectionId: ref.collectionId });

  const out: Section[] = [
    {
      ...hero,
      variant: "feature",
      title: "A gente leva\na origem\nno peito.",
      subtitle: "Sua cidade, suas histórias, seu jeito de falar. Busque a sua e vista o que te representa.",
      // The colour paints the product half; a picture chosen later (Aparência of the section) takes the product's place as a banner.
      appearance: plain({ kind: "solid", color: SAGE }),
    },
    { ...states, active: true, variant: "strip", title: "Comece pelo seu estado", subtitle: undefined, appearance: plain() },
    {
      ...styles,
      active: true,
      // Every style of the example city by name, one card at a time (all eight models without eight cards on screen).
      variant: "list",
      count: 8,
      title: "Sua cidade, do seu jeito.",
      subtitle: "O mapa, o nome ou as coordenadas. O exemplo aqui é {city}; ao abrir a sua, você vê só os estilos que existem para ela.",
      appearance: plain(),
    },
  ];

  // Three strong ways in, when the store has the collections: a real shirt on a colour (A) on the sides, a picture (B) in the middle.
  const tiles: GridTile[] = [];
  if (terra) tiles.push({ label: "Da Nossa Terra", caption: "O estado inteiro numa camiseta, não só uma cidade.", format: "product", color: "#dfe3d3", cta: "Ver coleção", dest: page(terra) });
  if (fala) {
    tiles.push(
      region === "sul"
        ? {
            label: "Fala Daqui",
            caption: "Expressões dos três estados, sempre com o lugar de onde vêm.",
            format: "banner",
            // The card is a portrait from 768px and a wide band on phones: the square picture for the card, the wide one for the phone.
            image: { assetId: "legacy:sul/fala-daqui-mobile", alt: "", decorative: true },
            imageMobile: { assetId: "legacy:sul/fala-daqui-desktop", alt: "", decorative: true },
            focal: { mobile: { x: 60, y: 45 }, desktop: { x: 60, y: 40 } },
            tone: "light",
            cta: "Ver coleção",
            dest: page(fala),
          }
        : { label: "Fala Daqui", caption: "Expressões que só quem é daqui entende.", format: "product", color: "#e8c9a9", cta: "Ver coleção", dest: page(fala) },
    );
  }
  if (jeito) tiles.push({ label: "Do Nosso Jeito", caption: "Obras, referências e ícones com sotaque local.", format: "product", color: "#e8c9a9", cta: "Ver coleção", dest: page(jeito) });
  if (tiles.length >= 2) {
    const anchor = uniqueAnchor("colecoes", taken);
    taken.add(anchor);
    out.push({ id: newId(), anchor, headingId: `${anchor}-title`, template: "image-grid", active: true, title: "Tem coisa que é só nossa.", subtitle: "Reconhecer, dar risada, sentir saudade: escolha o que faz sentido pra você.", grid: { columns: 3, aspect: "portrait", labels: "below" }, tiles, appearance: plain() });
  }

  out.push({
    ...campaign,
    active: true,
    variant: "split",
    ...(jeito
      ? { title: "Você conhece a referência. O sotaque é nosso.", subtitle: "Um pouco de arte, um pouco de humor e muito do lugar de onde a gente vem.", cta: { label: "Conhecer as releituras", dest: page(jeito) } }
      : {}),
    fallback: "fill",
    appearance: plain({ kind: "solid", color: "token:region-primary" }),
  });

  if (novidades) {
    const anchor = uniqueAnchor("selecao", taken);
    taken.add(anchor);
    out.push({
      id: newId(), anchor, headingId: `${anchor}-title`, template: "product-carousel", active: true,
      title: "Qual delas é a sua cara?", subtitle: "As estampas que acabaram de chegar à loja.",
      source: { kind: "ink-category", store: novidades.store, collectionId: novidades.collectionId, order: "category", limit: 4 },
      layout: { variant: "standard", tone: "light", surface: "plain", display: "grid" },
      analyticsSource: "homeCollection",
      cta: { label: "Ver novidades", dest: page(novidades) },
      appearance: plain(),
    });
  }

  // Everything else the home had, after the editorial ones: the curated showcases the cards and the campaign already cover are switched off (one click
  // brings any back), the rest keep their state (a "Canecas" section and its menu link stay).
  const used = new Set([hero, states, styles, campaign, footer].map((s) => s.id));
  const covered = new Set([terra, fala, jeito, novidades].filter(Boolean).map((r) => `${r!.store}:${r!.collectionId}`));
  for (const s of sections) {
    if (used.has(s.id)) continue;
    const curated = s.source?.kind === "editorial-module" || (s.source?.kind === "ink-category" && covered.has(`${s.source.store}:${s.source.collectionId}`));
    out.push(curated ? { ...s, active: false } : s);
  }
  out.push(footer);
  for (const s of out) if (s.subtitle === undefined) delete s.subtitle;
  return out;
}

/** The editorial theme's own palette when it is created: deep green, warm cream, terracotta. An ordinary palette from then on (Aparência edits it). */
export const EDITORIAL_PALETTE: ThemeConfig = {
  mode: "override",
  colors: { brandPrimary: "#213b30", headerBackground: "#f7f3ec", headerText: "#213b30", mobileMenuBackground: "#213b30", mobileMenuText: "#ffffff", accent: "#b0472f", pageBackground: "#f7f3ec", pageText: "#213b30" },
};

/** A new editorial theme for a region, built from the sections it has now (see `editorialSeed`), with the editorial palette. */
export function newEditorialTheme(region: RegionSlug, sections: readonly Section[], collections: EditorialCollections, newId: () => string): KeptHomeTheme {
  return { sections: editorialSeed(region, sections, collections, newId), theme: structuredClone(EDITORIAL_PALETTE) };
}

/**
 * The document with `name` in use: its sections and palette come in, the current theme's go into `homeThemes`, untouched. `created` is used when that
 * theme was never set up (null: nothing to swap to). Pure and lossless: swapping back gives the very same document.
 */
export function swapHomeTheme(doc: ScopeDoc, name: HomeThemeName, created?: KeptHomeTheme): ScopeDoc | null {
  const from = homeThemeOf(doc);
  if (from === name) return doc;
  if (!doc.home) return null;
  const kept = { ...(doc.homeThemes ?? {}) };
  const target = kept[name] ?? created;
  if (!target) return null;
  kept[from] = { sections: doc.home.sections, ...(doc.theme ? { theme: doc.theme } : {}) };
  delete kept[name];
  const next: ScopeDoc = { ...doc, home: { ...doc.home, sections: target.sections }, homeThemes: kept };
  if (target.theme) next.theme = target.theme;
  else delete next.theme;
  if (name === "original") delete next.homeTheme;
  else next.homeTheme = name;
  return next;
}

/** Whether the region has `name` set up (in use, or kept). */
export const hasHomeTheme = (doc: Pick<ScopeDoc, "homeTheme" | "homeThemes">, name: HomeThemeName): boolean => homeThemeOf(doc) === name || Boolean(doc.homeThemes?.[name]);

/**
 * The document as it would be with `name` in use, for a PREVIEW or for EDITING a kept theme in the panel (the same swap, nothing saved by itself). Null
 * when that theme has nothing kept (it was never set up in this region).
 */
export function withHomeTheme(doc: ScopeDoc, name: HomeThemeName): ScopeDoc | null {
  return swapHomeTheme(doc, name);
}
