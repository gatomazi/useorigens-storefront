import "server-only";
import { getCatalog } from "../catalog/repository";
import { libraryEntries } from "../catalog/collection-source";
import { REGIONS, type RegionSlug } from "../geo/regions";
import { getRegionHome } from "../home";
import type { Section } from "../site-config/schema";

const noImage = () => ({ fill: { kind: "none" as const }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" as const } });

/** Anchors and heading ids are DOM ids: keep them to [a-z0-9-] whatever the INK slug holds. */
const safe = (slug: string): string => slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 26) || "colecao";

export type RegionSeed = { sections: Section[]; notes: string[]; collections: number };

/**
 * The initial, lean home of a region that has none yet (Norte, Centro-Oeste), built ONLY from what really exists for that region's own INK
 * store: the hero (its copy names the region and promises nothing; the city count is the real one), the state chooser when real state pages
 * exist, and up to three carousels fed by the region's PUBLIC collections that have at least the minimum of active products in the same
 * store's catalog snapshot. Nothing is copied from Sul (no titles, slogans, curation or numbers), no campaign, no reviews, no "best sellers".
 * Every section is an ordinary, editable section (the carousels can be removed); the CTA "Ver todos" exists only because the collection is
 * public on INK (an internal one would get none). An empty region gets just the hero and the footer, and says so in `notes`.
 */
export function buildRegionSeed(region: Exclude<RegionSlug, "sul">, maxCarousels = 3): RegionSeed {
  const store = REGIONS[region].storeKey;
  const name = REGIONS[region].name;
  const notes: string[] = [];
  const catalogPresent = getCatalog().productsOfStore(store).merch.size + getCatalog().productsOfStore(store).cityDesigns.size > 0;
  if (!catalogPresent) notes.push(`O catálogo da loja ${name} ainda não foi sincronizado neste ambiente: a home sai só com o topo.`);

  const home = getRegionHome(region);
  const realStates = home.states.some((s) => s.cityCount > 0);
  const collections = libraryEntries(store, new Set())
    .filter((e) => e.visibility === "public" && e.selectable)
    .sort((a, b) => a.position - b.position)
    .slice(0, maxCarousels);
  if (collections.length === 0) notes.push(`Nenhuma coleção pública da loja ${name} tem produtos suficientes no catálogo: sincronize as coleções (Coleções → Sincronizar) e crie as seções pela Biblioteca.`);

  const sections: Section[] = [
    {
      id: "seed-hero", anchor: "hero", headingId: "hero-title", template: "hero", active: true, locked: true,
      title: `Camisetas do ${name}`,
      subtitle: "Encontre a camiseta da sua cidade.",
      appearance: { ...noImage(), fill: { kind: "solid", color: "token:ground" } },
    },
  ];
  if (realStates) sections.push({ id: "seed-estados", anchor: "estados", headingId: "states-title", template: "states", active: true, title: "Escolha o seu estado", appearance: noImage() });
  collections.forEach((entry, i) => {
    const section: Section = {
      id: `custom-seed${i + 1}`, anchor: `colecao-${safe(entry.slug)}`, headingId: `colecao-${safe(entry.slug)}-title`, template: "product-carousel", active: true,
      title: entry.name,
      layout: { variant: "standard", tone: "light", surface: i % 2 === 0 ? "paper" : "plain" },
      source: { kind: "ink-category", store, collectionId: entry.id, order: "category", limit: 8 },
      analyticsSource: "homeCollection",
      cta: { label: "Ver todos", dest: { kind: "ink-collection", store, collectionId: entry.id } },
      appearance: noImage(),
    };
    sections.push(section);
  });
  sections.push({ id: "seed-footer", anchor: "footer", headingId: "footer-title", template: "footer", active: true, locked: true, appearance: noImage() });
  return { sections, notes, collections: collections.length };
}
