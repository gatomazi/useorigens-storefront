import type { CollectionRef, ScopeDoc } from "./schema";

/**
 * LEGACY, read-only: the INK navbar as it was chosen before the collection menu (`collection-menu.ts`) existed. Two editorial places a PUBLIC collection
 * could have, "Não exibir" being simply not listed:
 *   top   straight on the bar (and among the priority links of the mobile menu)
 *   more  the "Demais categorias" dropdown (and its accordion on mobile)
 * A document without `collections.menu` still publishes these to the Worker unchanged; the first edit of the menu replaces them.
 */
export type NavbarGroups = { top: CollectionRef[]; more: CollectionRef[] };

/**
 * The groups a document PUBLISHES. Documents carry `navbarGroups`. A document from before the groups existed carries the flat `navbar` list:
 * deterministically, every entry goes to `top` and `legacy` is true so the reader keeps INK's own order for it (the order that list always had).
 * Neither key = nothing selected.
 */
export function effectiveNavbarGroups(doc: ScopeDoc | undefined): { groups: NavbarGroups; legacy: boolean } {
  const c = doc?.collections;
  if (c?.navbarGroups) return { groups: { top: [...c.navbarGroups.top], more: [...c.navbarGroups.more] }, legacy: false };
  if (c?.navbar && c.navbar.length > 0) return { groups: { top: [...c.navbar], more: [] }, legacy: true };
  return { groups: { top: [], more: [] }, legacy: false };
}
