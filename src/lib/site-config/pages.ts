/**
 * Pure helpers for the pages of a region (hotpages and parent-category landings): URLs, lookup, constructors. No I/O, no `server-only`, so the
 * admin, the storefront and the tests share them.
 */
import type { RegionSlug } from "../geo/regions";
import { CUSTOMIZER_SEGMENT, PAGE_SEGMENT, RESERVED_SLUGS, type Appearance, type Customizer, type Page, type PageKind, type ScopeDoc, type Section } from "./schema";

export const PAGE_KIND_LABEL: Record<PageKind, string> = { hotpage: "Hotpage", categoryLanding: "Categoria-pai" };

export const pageHref = (region: RegionSlug, page: Pick<Page, "kind" | "slug">): string => `/${region}/${PAGE_SEGMENT[page.kind]}/${page.slug}`;
export const customizerHref = (region: RegionSlug, m: Pick<Customizer, "slug">): string => `/${region}/${CUSTOMIZER_SEGMENT}/${m.slug}`;

export const findPage = (doc: ScopeDoc | undefined, kind: PageKind, slug: string): Page | undefined => doc?.pages?.find((p) => p.kind === kind && p.slug === slug);
/** A page the storefront may serve: present in the PUBLISHED document and not archived. */
export const livePage = (doc: ScopeDoc | undefined, kind: PageKind, slug: string): Page | undefined => {
  const p = findPage(doc, kind, slug);
  return p && !p.archived ? p : undefined;
};
export const liveCustomizer = (doc: ScopeDoc | undefined, slug: string): Customizer | undefined => doc?.customizers?.find((m) => m.slug === slug && m.active);

/** The page as a document the home renderer understands (its sections as the `home`): the SAME components draw a page and the home. */
export const pageAsHomeDoc = (doc: ScopeDoc, page: Page): ScopeDoc => ({ ...doc, home: { sections: page.sections } });

/** `Dia dos Pais!` → `dia-dos-pais` (accents removed, at most 60 characters). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** A slug nobody in `taken` uses and that is not reserved: `slug`, `slug-2`, `slug-3`… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  let root = slugify(base) || "pagina";
  if (root.length < 2) root = `${root}-x`;
  if (RESERVED_SLUGS.includes(root)) root = `${root}-pagina`;
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root.slice(0, 56)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const noImage = (): Appearance => ({ fill: { kind: "none" }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } });

/** The first section of a page: title, subtitle, optional button and background (the same appearance controls as any section). */
export function newPageHero(id: string, title: string, subtitle?: string): Section {
  return {
    id, anchor: "topo", headingId: "topo-title", template: "page-hero", active: true, locked: true, title, ...(subtitle ? { subtitle } : {}),
    appearance: { ...noImage(), fill: { kind: "solid", color: "token:region-primary" } },
    layout: { variant: "standard", tone: "dark", surface: "region-primary" },
  };
}

export function newPage(input: { id: string; kind: PageKind; title: string; slug: string; heroId: string; subtitle?: string }): Page {
  return { id: input.id, kind: input.kind, slug: input.slug, title: input.title, seo: { indexable: false }, sections: [newPageHero(input.heroId, input.title, input.subtitle)], version: 1 };
}
