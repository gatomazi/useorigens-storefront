/**
 * The Black Month calendar: "Checkpoints semanais" (an image grid in the `checkpoints` composition), the product sections with a period of their own
 * and the opening's scheduled texts. Pure rules, shared by the storefront and the tests. Days are YYYY-MM-DD in Brasília time, both ends included,
 * compared as strings (the format sorts like the calendar).
 */
import type { GridTile, ScopeDoc, Section } from "./schema";

/** "locked": before its first day; "current": the week running now; "open": running too, but not the latest (a block without an end); "ended": after its last day. */
export type CheckpointState = "open" | "current" | "locked" | "ended";
/** A period of the calendar: from its first to its last day (both included). No start = from always; no end = for good. */
export type Period = { opensAt?: string; closesAt?: string };
export type PeriodState = "locked" | "running" | "ended";

/** Today in Brasília time, YYYY-MM-DD (the store's campaigns turn at Brasília midnight, wherever the server runs). */
export function todayInBrasilia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Where `today` falls in one period. */
export function periodState(p: Period, today: string): PeriodState {
  if (p.opensAt && today < p.opensAt) return "locked";
  if (p.closesAt && today > p.closesAt) return "ended";
  return "running";
}

/**
 * Each block's state on `today`. Among the running ones, the one that opened last is "current" (the week running now); a block without a day is open
 * from the start and is current only while no dated block runs. Between two periods (07/11 ended, 09/11 not yet open) no block is current. With
 * `accumulate`, a week past its end stays "open" (its offer still holds) instead of "ended".
 */
export function checkpointStates(tiles: readonly Pick<GridTile, "opensAt" | "closesAt">[], today: string, accumulate = false): CheckpointState[] {
  const states = tiles.map((t) => periodState(t, today));
  let current = -1;
  tiles.forEach((t, i) => {
    if (states[i] !== "running") return;
    if (current < 0 || (t.opensAt ?? "") >= (tiles[current].opensAt ?? "")) current = i;
  });
  // Offers that accumulate (CMS `accumulate`): a week past its end keeps its offer ("Valendo"), it is only no longer the current one.
  return tiles.map((_, i) => (i === current ? "current" : states[i] === "running" || (accumulate && states[i] === "ended") ? "open" : states[i]));
}

/** "2026-11-16" → "16/11". */
export const dayMonth = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** A period as the calendar shows it: "02–07/11", "28/11–03/12", "a partir de 02/11", "até 07/11" (null: neither end). */
export function periodLabel(p: Period): string | null {
  if (p.opensAt && p.closesAt) {
    return p.opensAt.slice(5, 7) === p.closesAt.slice(5, 7) ? `${p.opensAt.slice(8, 10)}–${dayMonth(p.closesAt)}` : `${dayMonth(p.opensAt)}–${dayMonth(p.closesAt)}`;
  }
  if (p.opensAt) return `a partir de ${dayMonth(p.opensAt)}`;
  if (p.closesAt) return `até ${dayMonth(p.closesAt)}`;
  return null;
}

/**
 * The collections the calendar keeps closed on `today`, only from sections the owner marked "Fechar as páginas das coleções" (`sealCollections`, never
 * inferred from the days): the destination of a checkpoint that has not opened yet, or the source of a product section whose period has not started,
 * in the home (the theme in use and the kept ones: a kept Black theme already seals its weeks) and in every live page. Each collection opens on the
 * EARLIEST day a sealed section opens it. Keys are `store:collectionId`; the value is the day it opens. Until then the site keeps it out of reach: its
 * page shows only a padlock, its API, the sitemap and the search leave it out (the offer is a surprise).
 */
export function collectionLocks(doc: ScopeDoc | undefined, today: string): Map<string, string> {
  if (!doc) return new Map();
  const earliest = new Map<string, string>();
  const note = (key: string, day: string) => {
    const seen = earliest.get(key);
    if (!seen || day < seen) earliest.set(key, day);
  };
  const sections: Section[] = [...(doc.home?.sections ?? []), ...Object.values(doc.homeThemes ?? {}).flatMap((t) => t?.sections ?? []), ...(doc.pages ?? []).filter((p) => !p.archived).flatMap((p) => p.sections)];
  for (const s of sections) {
    if (s.sealCollections !== true || s.active === false) continue;
    if (s.template === "image-grid" && s.variant === "checkpoints") {
      for (const t of s.tiles ?? []) if (t.opensAt && (t.dest.kind === "collection-page" || t.dest.kind === "ink-collection")) note(`${t.dest.store}:${t.dest.collectionId}`, t.opensAt);
    }
    if (s.template === "product-carousel" && s.period?.opensAt && s.source?.kind === "ink-category") note(`${s.source.store}:${s.source.collectionId}`, s.period.opensAt);
  }
  return new Map([...earliest].filter(([, day]) => today < day));
}

/**
 * The locks of every region's document at once (the published bundle's `docs`), each collection on its earliest day. The keys name the INK store, so a
 * collection Sul seals is sealed wherever that store's collection is served: Norte and Centro-Oeste follow Sul's home and pages but not its KEPT themes
 * (the Black theme waiting for 01/11), and under the single store their collection pages are the same collections.
 */
export function bundleCollectionLocks(docs: Iterable<ScopeDoc | undefined>, today: string): Map<string, string> {
  const all = new Map<string, string>();
  for (const doc of docs) {
    for (const [key, day] of collectionLocks(doc, today)) {
      const seen = all.get(key);
      if (!seen || day < seen) all.set(key, day);
    }
  }
  return all;
}

/** Whole days from `today` to `day` (both YYYY-MM-DD). */
export const daysBetween = (today: string, day: string): number => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
