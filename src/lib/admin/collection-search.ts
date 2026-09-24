/**
 * Search over the collection list: accent- and case-insensitive, by name, slug or id, used by BOTH the library and the editor's
 * autocomplete (client-side, over the few hundred records already loaded). Pure and dependency-free so it can run in the browser.
 */
export type SearchableCollection = { id: number; name: string; slug: string; visibility: "public" | "internal"; position: number; selectable: boolean };

/** "Fala Daqui", "fala-daqui" and "FALÁ  DAQUI" all normalise to the same text. */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Higher = better; 0 = no match. Exact/prefix matches on the name beat a match in the middle, which beats slug and id matches. */
export function scoreCollection(c: SearchableCollection, query: string): number {
  const q = normalizeSearch(query);
  if (q === "") return 1;
  const name = normalizeSearch(c.name);
  const slug = normalizeSearch(c.slug);
  if (/^\d+$/.test(q) && String(c.id) === q) return 100;
  if (name === q) return 90;
  if (name.startsWith(q)) return 80;
  if (name.split(" ").some((w) => w.startsWith(q))) return 70;
  if (name.includes(q)) return 60;
  if (slug.includes(q)) return 40;
  if (/^\d+$/.test(q) && String(c.id).includes(q)) return 30;
  // every word of the query somewhere in the name ("nossa terra" → "Da Nossa Terra")
  const words = q.split(" ");
  if (words.length > 1 && words.every((w) => name.includes(w))) return 50;
  return 0;
}

/** Matches, best first; ties keep public collections ahead of internal ones, then INK's own order. */
export function searchCollections<T extends SearchableCollection>(list: readonly T[], query: string, limit = Infinity): T[] {
  return list
    .map((c) => ({ c, score: scoreCollection(c, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.c.visibility === "public") - Number(a.c.visibility === "public") || a.c.position - b.c.position || a.c.id - b.c.id)
    .slice(0, limit)
    .map((x) => x.c);
}
