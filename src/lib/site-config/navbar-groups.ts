import type { CollectionRef, ScopeDoc } from "./schema";

/**
 * The two editorial places a collection can have in the INK navbar, as PURE data operations (no I/O). "Não exibir" is simply not being listed.
 *   top   straight on the bar (and among the priority links of the mobile menu)
 *   more  the "Demais categorias" dropdown (and its accordion on mobile)
 * Free and ordered: any number in each group, in the owner's order; a collection sits in at most one group. No slot has a special meaning —
 * "Novidades", "Do Nosso Jeito" or a launch are only the names of collections.
 */
export type NavbarPosition = "none" | "top" | "more";
export type NavbarGroups = { top: CollectionRef[]; more: CollectionRef[] };

const same = (a: CollectionRef, b: CollectionRef) => a.store === b.store && a.collectionId === b.collectionId;
const without = (list: readonly CollectionRef[], ref: CollectionRef) => list.filter((r) => !same(r, ref));

/**
 * The groups a document PUBLISHES. New documents carry `navbarGroups`. A document from before the groups existed carries the flat `navbar` list:
 * deterministically, every entry goes to `top` (the owner redistributes them by hand) and `legacy` is true so the reader keeps INK's own order for it
 * (the order that list always had). Neither key = nothing selected. Never an automatic "first five on top, the rest in Mais".
 */
export function effectiveNavbarGroups(doc: ScopeDoc | undefined): { groups: NavbarGroups; legacy: boolean } {
  const c = doc?.collections;
  if (c?.navbarGroups) return { groups: { top: [...c.navbarGroups.top], more: [...c.navbarGroups.more] }, legacy: false };
  if (c?.navbar && c.navbar.length > 0) return { groups: { top: [...c.navbar], more: [] }, legacy: true };
  return { groups: { top: [], more: [] }, legacy: false };
}

export function navbarPositionOf(groups: NavbarGroups, ref: CollectionRef): NavbarPosition {
  if (groups.top.some((r) => same(r, ref))) return "top";
  if (groups.more.some((r) => same(r, ref))) return "more";
  return "none";
}

/** Moves a collection to a position: removed from wherever it was, appended at the END of the target group (the owner then reorders). Idempotent. */
export function withPosition(groups: NavbarGroups, ref: CollectionRef, position: NavbarPosition): NavbarGroups {
  if (navbarPositionOf(groups, ref) === position) return groups;
  const next: NavbarGroups = { top: without(groups.top, ref), more: without(groups.more, ref) };
  if (position !== "none") next[position] = [...next[position], { store: ref.store, collectionId: ref.collectionId }];
  return next;
}

/** One step up or down inside its own group; a no-op at the edge or when it is not listed. */
export function movedWithin(groups: NavbarGroups, ref: CollectionRef, direction: "up" | "down"): NavbarGroups {
  const position = navbarPositionOf(groups, ref);
  if (position === "none") return groups;
  const list = [...groups[position]];
  const i = list.findIndex((r) => same(r, ref));
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return groups;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...groups, [position]: list };
}

/** Writes the groups into the document. Drops the legacy flat list (it has been migrated into `top`) and the whole key when nothing is left. */
export function withNavbarGroups(doc: ScopeDoc, groups: NavbarGroups): ScopeDoc {
  const enabled = doc.collections?.enabled ?? [];
  const next: ScopeDoc = { ...doc };
  const hasGroups = groups.top.length + groups.more.length > 0;
  if (hasGroups) next.collections = { enabled, navbarGroups: groups };
  else if (enabled.length > 0) next.collections = { enabled };
  else delete next.collections;
  return next;
}

/** The set of collection ids with a given position, for one store. */
export function navbarIdsByPosition(doc: ScopeDoc | undefined, store: CollectionRef["store"]): { top: ReadonlySet<number>; more: ReadonlySet<number> } {
  const { groups } = effectiveNavbarGroups(doc);
  const ids = (list: CollectionRef[]) => new Set(list.filter((r) => r.store === store).map((r) => r.collectionId));
  return { top: ids(groups.top), more: ids(groups.more) };
}
