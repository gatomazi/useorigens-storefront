/**
 * The carousels of a state page as a three-level hierarchy, as PURE data operations (no I/O; collection-source.ts feeds it). INK has no parent/child
 * between collections, so the hierarchy is ours:
 *   state        the collection named after the state ("Santa Catarina"): which products are of the state
 *   category     the region's state-page categories, in its order ("Seu Lugar", "Do Nosso Jeito", "Da Nossa Terra", "Feito Para Você", "Fala Daqui")
 *   subcategory  any other collection the region uses on the state page ("Fala de Onde", inside "Fala Daqui")
 *
 * Every product of the state goes in the DEEPEST row that shows it: a subcategory row; else its category's row, with only what no subcategory took; else
 * one row named after the state, with what no category took. A row below its `min` products (per collection: a grid needs fewer than a carousel) is not drawn and its products go up one level. A product in two
 * collections of the same level shows in both. A subcategory row sits in the group of the first category it shares a product with (subcategories first,
 * then the category with what is left); one that shares none comes after the categories, before the state's row.
 */
export type StateRowLevel = "subcategory" | "category" | "state";

export type StateHierarchyRow<C, I> = {
  level: StateRowLevel;
  collection: C;
  /** The category the row is shown under: itself for a category row, null for the state's row and for a subcategory under no category. */
  category: C | null;
  items: I[];
};

export type StateHierarchyInput<C, I> = {
  state: C;
  categories: readonly C[];
  subcategories: readonly C[];
  /** A collection's product ids (INK's order). */
  members: (collection: C) => readonly string[];
  /** The cards of `ids` as `collection` shows them in the region: its arrangement (order, hidden ones out), only products of the catalog and region. */
  items: (collection: C, ids: readonly string[]) => I[];
  /** The fewest products a row needs to be drawn: one number, or per collection (a grid row shows from one, a carousel needs more). Never below 1. */
  min: number | ((collection: C) => number);
};

export function stateHierarchyRows<C extends { id: number }, I extends { id: string }>(input: StateHierarchyInput<C, I>): StateHierarchyRow<C, I>[] {
  const { state } = input;
  const min = (c: C) => Math.max(1, typeof input.min === "function" ? input.min(c) : input.min);
  const inState = new Set(input.members(state));
  const ofState = (c: C) => input.members(c).filter((id) => inState.has(id));
  const categories = unique(input.categories.filter((c) => c.id !== state.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  const subcategories = unique(input.subcategories.filter((c) => c.id !== state.id && !categoryIds.has(c.id)));
  const categoryMembers = categories.map((c) => new Set(ofState(c)));

  const drawn = new Set<string>();
  const subRows: { row: StateHierarchyRow<C, I>; home: number }[] = [];
  for (const sub of subcategories) {
    const items = input.items(sub, ofState(sub));
    if (items.length < min(sub)) continue;
    const home = categoryMembers.findIndex((ids) => items.some((i) => ids.has(i.id)));
    subRows.push({ row: { level: "subcategory", collection: sub, category: home >= 0 ? categories[home] : null, items }, home });
    for (const i of items) drawn.add(i.id);
  }

  const rows: StateHierarchyRow<C, I>[] = [];
  const takenBySub = new Set(drawn);
  categories.forEach((category, k) => {
    rows.push(...subRows.filter((s) => s.home === k).map((s) => s.row));
    const items = input.items(category, [...categoryMembers[k]].filter((id) => !takenBySub.has(id)));
    if (items.length < min(category)) return;
    rows.push({ level: "category", collection: category, category, items });
    for (const i of items) drawn.add(i.id);
  });
  rows.push(...subRows.filter((s) => s.home < 0).map((s) => s.row));

  const rest = input.items(state, input.members(state).filter((id) => !drawn.has(id)));
  if (rest.length >= min(state)) rows.push({ level: "state", collection: state, category: null, items: rest });
  return rows;
}

function unique<C extends { id: number }>(list: readonly C[]): C[] {
  const seen = new Set<number>();
  return list.filter((c) => !seen.has(c.id) && (seen.add(c.id), true));
}
