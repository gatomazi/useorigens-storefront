import { effectiveNavbarGroups } from "./navbar-groups";
import type { CollectionMenu, CollectionRef, ScopeDoc } from "./schema";

/**
 * The region's ONE collection menu, as PURE data operations (no I/O). It feeds the storefront header (collections on the bar + "Categorias") and the
 * navbar the Worker draws on the INK product pages (`site-config/navbar.ts`). Every collection has one of three places:
 *   top   on the bar, in the owner's order (and first in "Categorias" on the phone)
 *   more  in "Categorias" (the Worker's "Demais categorias")
 *   none  not in the menu
 * "Categorias" is AUTOMATIC: a collection that is public on INK is in it unless the owner takes it out (`hidden`), so a new collection shows up on its own.
 * An internal one (no INK page; a page on the site once enabled) stays out unless the owner brings it in (`added`). The document stores only what departs
 * from that default. Whether a collection can really be linked (a page of ours, an INK page) is decided when the menu is read, against the synced data.
 */
export type MenuPosition = "none" | "top" | "more";

const same = (a: CollectionRef, b: CollectionRef) => a.store === b.store && a.collectionId === b.collectionId;
const without = (list: readonly CollectionRef[], ref: CollectionRef) => list.filter((r) => !same(r, ref));
const has = (list: readonly CollectionRef[], ref: CollectionRef) => list.some((r) => same(r, ref));

/**
 * The menu a document shows. `own` = the document has its menu (the Worker follows it too). A document from before keeps the older INK navbar choice
 * where it still means something: its "Topo" stays on top, and every public collection is in "Categorias" (the old "Demais categorias" was a hand-picked
 * subset only because nothing was automatic then).
 */
export function effectiveMenu(doc: ScopeDoc | undefined): { menu: CollectionMenu; own: boolean } {
  const own = doc?.collections?.menu;
  if (own) return { menu: { top: [...own.top], hidden: [...own.hidden], added: [...own.added] }, own: true };
  return { menu: { top: effectiveNavbarGroups(doc).groups.top, hidden: [], added: [] }, own: false };
}

export function menuPositionOf(menu: CollectionMenu, ref: CollectionRef, isPublic: boolean): MenuPosition {
  if (has(menu.top, ref)) return "top";
  if (has(menu.hidden, ref)) return "none";
  if (has(menu.added, ref)) return "more";
  return isPublic ? "more" : "none";
}

/** Moves a collection to a place. "top" appends it at the END of the bar (the owner then reorders). Idempotent. */
export function withMenuPosition(menu: CollectionMenu, ref: CollectionRef, position: MenuPosition, isPublic: boolean): CollectionMenu {
  if (menuPositionOf(menu, ref, isPublic) === position) return menu;
  const entry: CollectionRef = { store: ref.store, collectionId: ref.collectionId };
  const next: CollectionMenu = { top: without(menu.top, ref), hidden: without(menu.hidden, ref), added: without(menu.added, ref) };
  if (position === "top") next.top.push(entry);
  else if (position === "none" && isPublic) next.hidden.push(entry);
  else if (position === "more" && !isPublic) next.added.push(entry);
  return next;
}

/** One step left or right on the bar; a no-op at the edge or when it is not on the bar. */
export function movedOnTop(menu: CollectionMenu, ref: CollectionRef, direction: "up" | "down"): CollectionMenu {
  const top = [...menu.top];
  const i = top.findIndex((r) => same(r, ref));
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= top.length) return menu;
  [top[i], top[j]] = [top[j], top[i]];
  return { ...menu, top };
}

/** Writes the menu into the document. The older INK navbar lists go away: from now on the Worker reads this menu. */
export function withMenu(doc: ScopeDoc, menu: CollectionMenu): ScopeDoc {
  const { navbar: _flat, navbarGroups: _groups, ...rest } = doc.collections ?? { enabled: [] };
  void _flat;
  void _groups;
  return { ...doc, collections: { ...rest, enabled: rest.enabled ?? [], menu } };
}
