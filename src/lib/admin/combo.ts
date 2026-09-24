import type { ComboEntry } from "@/components/admin/CollectionCombobox";
import type { LibraryEntry } from "@/lib/catalog/collection-source";

/** Library rows → what the browser gets for the autocomplete (no product ids, no raw counts). */
export const toComboEntries = (entries: LibraryEntry[]): ComboEntry[] =>
  entries.map((e) => ({
    value: `${e.store}:${e.id}`, id: e.id, name: e.name, slug: e.slug, position: e.position, visibility: e.visibility, enabled: e.enabled,
    eligible: e.eligible, selectable: e.selectable, reason: e.reason, matchedCount: e.matchedCount,
  }));
