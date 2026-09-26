/**
 * The links of the storefront header that point at sections of the home, decided by the region's published document. Pure (no I/O).
 *
 * - Sections the editor marked "show in the menu" (`section.nav.label`, the "apelido") are the menu, in the order of the home.
 * - Without any such choice, the historical three (Estilos, Fala daqui, Estados) appear, but only for sections the home really has and shows:
 *   a region whose home has no "Fala daqui" no longer gets a dead link to it.
 * - No document (config-driven home off) = the original hard-coded home: the historical three, as always.
 */
import type { ScopeDoc, Section } from "./schema";

export type HeaderLink = { label: string; anchor: string };

const HISTORICAL: readonly HeaderLink[] = [
  { label: "Estilos", anchor: "estilos" },
  { label: "Fala daqui", anchor: "fala" },
  { label: "Estados", anchor: "estados" },
];

/** Suggested apelido when a section is first put in the menu. */
export function suggestedNavLabel(section: Pick<Section, "anchor" | "title" | "template">): string {
  const known = HISTORICAL.find((h) => h.anchor === section.anchor);
  if (known) return known.label;
  if (section.template === "states") return "Estados";
  if (section.template === "city-styles") return "Estilos";
  return (section.title ?? section.anchor).replace(/\n/g, " ").slice(0, 24);
}

const shown = (s: Section) => s.active && s.template !== "hero" && s.template !== "footer";

export function headerLinks(doc: ScopeDoc | undefined): HeaderLink[] {
  if (!doc) return [...HISTORICAL];
  const sections = (doc.home?.sections ?? []).filter(shown);
  const configured = sections.filter((s) => s.nav);
  if (configured.length > 0) return configured.map((s) => ({ label: s.nav!.label, anchor: s.anchor }));
  return HISTORICAL.filter((h) => sections.some((s) => s.anchor === h.anchor));
}

/** Whether the home has a visible state chooser to point "Ver estados" at. */
export const hasStatesSection = (doc: ScopeDoc | undefined): boolean => (doc ? (doc.home?.sections ?? []).some((s) => shown(s) && s.template === "states") : true);
