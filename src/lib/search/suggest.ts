import { normalizeText } from "../geo/text";
import type { PreparedGlobalDoc } from "./global";

/**
 * "Você quis dizer…": a place name the visitor probably meant, offered ONLY when the search found nothing at all. It never feeds the results (rank.ts
 * has no fuzzy matching on purpose: a wrong city is worse than no city); the visitor decides by tapping the suggestion, which then runs a normal search.
 */

/** Below this a typo cannot be told from another word ("tij" is a prefix, not a mistake). */
const MIN_LENGTH = 4;

/** Edit distance (insert, delete, replace, swap of two neighbours) up to `max`; `max + 1` means "farther than that". Bails out as soon as a row cannot recover. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let beforePrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, beforePrev[j - 2] + 1);
      row[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    beforePrev = prev;
    prev = row;
  }
  return Math.min(prev[b.length], max + 1);
}

/**
 * The title of the one place (a city, a locality, a state) whose name or alias is closest to `query`: one letter away up to 5 characters, two above.
 * Null when nothing is close enough, when the query is too short, or when two DIFFERENT places tie (a guess between them would be a coin toss).
 * Several places with the same title (the same city name in two states) are one suggestion: the search that follows lists them all.
 * `isPlace` says which documents are places (global.ts owns that rule; this file only imports its types, so the two never import each other).
 */
export function suggestPlace(prepared: readonly PreparedGlobalDoc[], query: string, isPlace: (p: PreparedGlobalDoc) => boolean): string | null {
  const q = normalizeText(query);
  if (q.length < MIN_LENGTH) return null;
  const max = q.length <= 5 ? 1 : 2;
  let best = max + 1;
  const titles = new Set<string>();
  for (const p of prepared) {
    if (!isPlace(p)) continue;
    for (const name of p.names) {
      const distance = editDistance(q, name, max);
      if (distance === 0) return null; // the query IS a place: nothing to correct
      if (distance > best) continue;
      if (distance < best) {
        best = distance;
        titles.clear();
      }
      titles.add(p.doc.title);
    }
  }
  return titles.size === 1 ? [...titles][0] : null;
}
