/**
 * "Seguir a Sul" applied to a published bundle. Pure (no I/O): `published.ts` runs it once per read of the file, so EVERY public reader (the home, the
 * state and collection pages, the pages, the header, the Worker's navbar, the sitemap, the search) sees the same result. The panel and the publisher
 * keep reading the documents as stored.
 *
 * Two rules, for every region:
 *   1. A section tagged with `regions` shows only in those regions, and `{regiao}` in any text of a section or a page becomes the region's name.
 *   2. A region that FOLLOWS Sul in a part (`follow-schema.ts`) reads that part from Sul's document, adapted to itself:
 *        links to Sul's pages go to the region's (`/sul/h/x` → `/norte/h/x`); a link to a state or a model the region does not have is left out
 *        (a grid tile then leads to the region's home); state covers keep only the region's states; a personalization card is matched by the model's
 *        address. Collections are the same INK collections: in the single store each region already shows only its own products in them, and a
 *        product of another region (a hero card of Curitiba) is dropped when the public resolves it. Following the home, Sul's theme in use
 *        (Black Friday, Natal) comes with its sections, chrome and ground ("Fundo da home"), but the palette stays the region's own.
 *   3. Following the home, the region's own pictures and products (`ScopeDoc.regional`) go over Sul's sections: the structure is Sul's, the banners
 *      and the products of the opening, the states' covers and the grid's blocks can be the region's.
 *
 * A region follows only while it sells in the same INK store as Sul (`canFollow`): under the regional stores (the rollback of the single store) the refs
 * of Sul mean nothing to the others, so each region shows its own content again.
 */
import { REGIONS, REGION_SLUGS, STATE_NAMES, type RegionSlug } from "../geo/regions";
import { effectiveMenu } from "./collection-menu";
import { FOLLOW_SOURCE, REGION_TOKEN, followsPart } from "./follow-schema";
import { defaultStatesBlockLabel } from "./navigation";
import { homeThemeOf, PAGE_SEGMENT, type CollectionRef, type Customizer, type Destination, type Page, type PublishedBundle, type RegionalSection, type ScopeDoc, type Section } from "./schema";

export { REGION_TOKEN };

/** Every string inside the value with `{regiao}` replaced by the region's name. Returns the same object when there is nothing to replace. */
export function withRegionName<T>(value: T, region: RegionSlug): T {
  if (!JSON.stringify(value).includes(REGION_TOKEN)) return value;
  const name = REGIONS[region].name;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replaceAll(REGION_TOKEN, name);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** The sections a region shows: the ones tagged for it (or untagged), with its name in the texts. */
export const sectionsFor = (sections: readonly Section[], region: RegionSlug): Section[] =>
  sections.filter((s) => !s.regions || s.regions.includes(region)).map((s) => withRegionName(s, region));

type Adapt = { to: RegionSlug; pages: readonly Page[]; sourceCustomizers: readonly Customizer[]; customizers: readonly Customizer[] };

const livePage = (pages: readonly Page[], kind: Page["kind"], slug: string) => pages.some((p) => p.kind === kind && p.slug === slug && !p.archived);
const activeModel = (ctx: Adapt, sourceId: string): Customizer | undefined => {
  const original = ctx.sourceCustomizers.find((m) => m.id === sourceId);
  return original ? ctx.customizers.find((m) => m.slug === original.slug && m.active) : undefined;
};

/** A destination of Sul's structure, in the region. `undefined` = it has no equivalent there (the caller leaves the button out). */
export function followedDestination(d: Destination, ctx: Adapt): Destination | undefined {
  if (d.kind === "page") return livePage(ctx.pages, d.pageKind, d.slug) ? d : undefined;
  if (d.kind === "customizer") {
    const model = activeModel(ctx, d.customizerId);
    return model ? { kind: "customizer", customizerId: model.id } : undefined;
  }
  if (d.kind !== "route") return d;
  const url = new URL(d.path, "https://follow.invalid");
  const segments = url.pathname.split("/").filter(Boolean);
  // Only Sul's own addresses move; a link Sul made to another region on purpose ("Conheça o Norte") stays as it is.
  if (segments[0] !== FOLLOW_SOURCE) return d;
  const second = segments[1];
  if (second && STATE_NAMES[second.toUpperCase()] && !REGIONS[ctx.to].ufs.includes(second.toUpperCase())) return undefined;
  if (second === PAGE_SEGMENT.hotpage && segments[2] && !livePage(ctx.pages, "hotpage", segments[2])) return undefined;
  if (second === "personalizar" && segments[2] && !ctx.customizers.some((m) => m.slug === segments[2] && m.active)) return undefined;
  segments[0] = ctx.to;
  return { kind: "route", path: `/${segments.join("/")}${url.search}${url.hash}` };
}

/** The region's own pictures and products for the home theme Sul has in use (each theme keeps its own: `RegionalSection.theme`). */
export const regionalOf = (doc: ScopeDoc, sul: ScopeDoc): RegionalSection[] => (doc.regional ?? []).filter((e) => (e.theme ?? "original") === homeThemeOf(sul));

/** The region's own pictures and products over one of Sul's sections (`ScopeDoc.regional`): only what the entry carries is replaced. */
export function withRegional(s: Section, own: RegionalSection | undefined): Section {
  if (!own) return s;
  const next: Section = { ...s };
  if (own.appearance) {
    next.appearance = { ...s.appearance, focal: structuredClone(own.appearance.focal) };
    if (own.appearance.image) next.appearance.image = structuredClone(own.appearance.image);
    else delete next.appearance.image;
  }
  if (s.template === "hero" && own.featured) {
    next.featured = structuredClone(own.featured);
    if (own.featuredRotation) next.featuredRotation = own.featuredRotation;
    else delete next.featuredRotation;
  }
  if (s.template === "states" && own.stateCovers) next.stateCovers = structuredClone(own.stateCovers);
  if (s.template === "image-grid" && own.tiles) next.tiles = structuredClone(own.tiles);
  if (s.template === "image-grid" && own.grid) next.grid = structuredClone(own.grid);
  return next;
}

function followedSections(sections: readonly Section[], ctx: Adapt, regional: readonly RegionalSection[] = []): Section[] {
  const home: Destination = { kind: "route", path: `/${ctx.to}` };
  return sections.map((original) => {
    const own = regional.find((e) => e.sectionId === original.id);
    const s = structuredClone(original);
    if (s.cta) {
      const dest = followedDestination(s.cta.dest, ctx);
      if (dest) s.cta.dest = dest;
      else if (s.template === "campaign") s.active = false; // without its button a campaign is a dead end (`campaignLeadsNowhere`)
      else delete s.cta;
    }
    if (s.nav?.dest) {
      const dest = followedDestination(s.nav.dest, ctx);
      if (dest) s.nav.dest = dest;
      else delete s.nav.dest;
    }
    if (s.tiles) s.tiles = s.tiles.map((t) => ({ ...t, dest: followedDestination(t.dest, ctx) ?? home }));
    if (s.stateCovers) s.stateCovers = Object.fromEntries(Object.entries(s.stateCovers).filter(([uf]) => REGIONS[ctx.to].ufs.includes(uf)));
    if (s.customizerCard) {
      const model = activeModel(ctx, s.customizerCard.customizerId);
      if (model) s.customizerCard.customizerId = model.id;
      else delete s.customizerCard;
    }
    // A live banner shows the region's own model of the same address; without one the block is not shown.
    if (s.live) {
      const model = activeModel(ctx, s.live.customizerId);
      if (model) s.live.customizerId = model.id;
      else s.active = false;
    }
    // Last: what the region chose itself (its own links in a grid, its covers and products) is never adapted again.
    return withRegional(s, own);
  });
}

/** A page whose hero gave way to a live banner gets its hero back where the region has no model for that banner (a page always opens with a heading). */
function withOpening(sections: Section[]): Section[] {
  const hero = sections[0];
  if (hero?.template !== "page-hero" || hero.active || sections.some((s) => s.template === "personalization-live" && s.active)) return sections;
  return [{ ...hero, active: true }, ...sections.slice(1)];
}

const refKey = (r: CollectionRef) => `${r.store}:${r.collectionId}`;

/**
 * The region's document as the public reads it. `sul` = Sul's document (as stored, before its own regional filtering). `canFollow` = the region sells in
 * Sul's INK store. Sul and a region that follows nothing only get rule 1.
 */
export function followedDoc(doc: ScopeDoc, sul: ScopeDoc | undefined, canFollow: boolean): ScopeDoc {
  if (doc.scope === "global") return doc;
  const region = doc.scope;
  const follows = (part: Parameters<typeof followsPart>[1]) => canFollow && !!sul && followsPart(doc, part);
  const next: ScopeDoc = { ...doc };

  if (sul && (follows("home") || follows("menu") || follows("statePage") || follows("pages"))) {
    const own = doc.pages ?? [];
    const taken = new Set(own.filter((p) => !p.archived).map((p) => `${p.kind}:${p.slug}`));
    const pages = follows("pages") ? [...own, ...(sul.pages ?? []).filter((p) => !p.archived && !taken.has(`${p.kind}:${p.slug}`))] : own;
    const ctx: Adapt = { to: region, pages, sourceCustomizers: sul.customizers ?? [], customizers: doc.customizers ?? [] };
    if (follows("pages")) next.pages = pages.map((p) => (own.includes(p) ? p : { ...p, sections: withOpening(followedSections(p.sections, ctx)) }));

    if (follows("home") && sul.home) {
      next.home = { sections: followedSections(sul.home.sections, ctx, regionalOf(doc, sul)), ...(sul.home.backdrop ? { backdrop: structuredClone(sul.home.backdrop) } : {}) };
      // Sul's theme is its structure (sections and chrome), never its colours: the region keeps its own palette, the one it keeps for that theme
      // when it has one (`homeThemes`), else the one it uses.
      const name = homeThemeOf(sul);
      const kept = homeThemeOf(doc) === name ? undefined : doc.homeThemes?.[name]?.theme;
      if (kept) next.theme = structuredClone(kept);
      if (sul.homeTheme) next.homeTheme = sul.homeTheme;
      else delete next.homeTheme;
    }

    const collections = { ...(doc.collections ?? { enabled: [] }) };
    if (follows("menu")) {
      if (sul.navigation) {
        const navigation = structuredClone(sul.navigation);
        if (navigation.statesBlock?.label === defaultStatesBlockLabel(FOLLOW_SOURCE)) navigation.statesBlock.label = defaultStatesBlockLabel(region);
        next.navigation = navigation;
      } else delete next.navigation;
      collections.menu = effectiveMenu(sul).menu;
      delete collections.navbarGroups;
      delete collections.navbar;
      for (const key of ["descriptions", "highlights"] as const) {
        if (sul.collections?.[key]) (collections as Record<string, unknown>)[key] = structuredClone(sul.collections[key]);
        else delete collections[key];
      }
    }
    if (follows("statePage")) {
      if (sul.statePage) next.statePage = structuredClone(sul.statePage);
      else delete next.statePage;
      for (const key of ["stateCategories", "stateSubcategories", "stateSubcategoryList", "stateGrids", "stateRows"] as const) {
        if (sul.collections?.[key]) (collections as Record<string, unknown>)[key] = structuredClone(sul.collections[key]);
        else delete collections[key];
      }
    }
    // The internal collections Sul enabled come with its structure (a section on one would not render otherwise). Sul's ORDER of a collection does
    // not: it lists Sul's products, and any order with ids switches a section's own sort off; each region keeps its own.
    const enabled = new Map([...(sul.collections?.enabled ?? []), ...collections.enabled].map((r) => [refKey(r), r]));
    collections.enabled = [...enabled.values()];
    next.collections = collections;
  }

  if (next.home) next.home = { ...next.home, sections: sectionsFor(next.home.sections, region) };
  if (next.pages) next.pages = next.pages.map((p) => withRegionName({ ...p, sections: sectionsFor(p.sections, region) }, region));
  return next;
}

/** The bundle every public reader sees (see the top of this file). `canFollow(region)`: the region sells in Sul's INK store. */
export function withFollowing(bundle: PublishedBundle, canFollow: (region: RegionSlug) => boolean): PublishedBundle {
  const sul = bundle.docs[FOLLOW_SOURCE];
  const docs = { ...bundle.docs };
  for (const region of REGION_SLUGS) docs[region] = followedDoc(bundle.docs[region], sul, region !== FOLLOW_SOURCE && canFollow(region));
  return { ...bundle, docs };
}
