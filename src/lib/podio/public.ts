import { familyById } from "../catalog/families";
import type { LocalityType } from "../geo/cities";
import { REGIONS, STATE_NAMES, type RegionSlug } from "../geo/regions";
import { PODIUM_SIZE } from "./rank";
import type { Movement, PodioRunState, PodioSnapshot } from "./types";
import { PODIO_TZ } from "./window";

/**
 * The PUBLIC projection of a pódio snapshot: what a page renders, and nothing else. No unit counts, no revenue, no order data, no
 * internal positions beyond the podium — the same function feeds the state page and the home teaser, from the same `latest.json`.
 */

/** A snapshot older than this is hidden entirely (and logged): an old podium is not "the last 30 days" any more. */
export const MAX_AGE_MS = 72 * 60 * 60 * 1000;
/** Older than this (or a failed attempt after it): still shown, with its real date and a discreet "atualização pendente". */
export const PENDING_AFTER_MS = 26 * 60 * 60 * 1000;

export type PublicMovement = { kind: Movement["kind"]; label: string; description: string };

export type PublicLocalityEntry = {
  position: number;
  id: string;
  name: string;
  kind: LocalityType;
  href: string | null;
  movement: PublicMovement | null;
};

export type PublicFamilyEntry = {
  position: number;
  id: string;
  name: string;
  /** The real product page of one contributing place for this family (the only family destination that exists inside a UF). */
  href: string | null;
  /** A real product image of this family from a place of THIS UF that contributed to the result; null → discreet fallback. */
  example: { imageUrl: string; placeName: string } | null;
  movement: PublicMovement | null;
};

export type PublicPodium = {
  region: RegionSlug;
  uf: string;
  stateName: string;
  /** "4 de outubro" — when the snapshot was computed (São Paulo time). */
  updatedLabel: string;
  updatedAt: string;
  pending: boolean;
  localities: PublicLocalityEntry[];
  families: PublicFamilyEntry[];
};

/** What the projection needs from the catalog/geo, injected so it stays pure (and testable without a snapshot on disk). */
export type PodioCatalogView = {
  locality(id: string): { name: string; slug: string; uf: string; type: LocalityType } | undefined;
  /** True when the locality's own page exists (a DF administrative region is a page only when it has products). */
  hasPage(id: string): boolean;
  /** Image of the place's current product for the family, when it has one with a valid https image. */
  familyImage(localityId: string, familyId: string): string | null;
};

const plural = (n: number) => `${n} ${n === 1 ? "posição" : "posições"}`;

export function publicMovement(movement: Movement | null): PublicMovement | null {
  if (!movement) return null;
  switch (movement.kind) {
    case "up":
      return { kind: "up", label: `↑${movement.by}`, description: `Subiu ${plural(movement.by)} desde a atualização anterior` };
    case "down":
      return { kind: "down", label: `↓${movement.by}`, description: `Caiu ${plural(movement.by)} desde a atualização anterior` };
    case "same":
      return { kind: "same", label: "—", description: "Manteve a posição desde a atualização anterior" };
    case "new":
      return { kind: "new", label: "NOVO", description: "Entrou no pódio desde a atualização anterior" };
  }
}

const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: PODIO_TZ });

export type Freshness = { visible: false; reason: "missing" | "stale" } | { visible: true; pending: boolean };

export function freshnessOf(snapshot: PodioSnapshot | null, state: PodioRunState | null, now: Date): Freshness {
  if (!snapshot) return { visible: false, reason: "missing" };
  const computed = Date.parse(snapshot.computedAt);
  const age = now.getTime() - computed;
  if (!Number.isFinite(age) || age > MAX_AGE_MS) return { visible: false, reason: "stale" };
  const failedSince = state?.lastAttempt.ok === false && Date.parse(state.lastAttempt.at) > computed;
  return { visible: true, pending: age > PENDING_AFTER_MS || failedSince };
}

/** One UF's public podium, or null when it has nothing real to show (no snapshot, stale, or no eligible sales there). */
export function projectPodium(
  snapshot: PodioSnapshot | null,
  state: PodioRunState | null,
  region: RegionSlug,
  uf: string,
  view: PodioCatalogView,
  now: Date,
): PublicPodium | null {
  const fresh = freshnessOf(snapshot, state, now);
  if (!fresh.visible || !snapshot || snapshot.region !== region || !REGIONS[region].ufs.includes(uf)) return null;
  const ranking = snapshot.states[uf];
  if (!ranking) return null;
  const ufPath = `/${region}/${uf.toLowerCase()}`;

  const localities: PublicLocalityEntry[] = [];
  for (const entry of ranking.localities.slice(0, PODIUM_SIZE)) {
    const place = view.locality(entry.id);
    if (!place || place.uf !== uf || entry.units <= 0) continue;
    localities.push({
      position: entry.position,
      id: entry.id,
      name: place.name,
      kind: place.type,
      href: view.hasPage(entry.id) ? `${ufPath}/${place.slug}` : null,
      movement: publicMovement(entry.movement),
    });
  }

  const families: PublicFamilyEntry[] = [];
  for (const entry of ranking.families.slice(0, PODIUM_SIZE)) {
    const family = familyById(entry.id);
    if (!family || entry.units <= 0) continue;
    let example: PublicFamilyEntry["example"] = null;
    let href: string | null = null;
    for (const placeId of entry.representatives) {
      const place = view.locality(placeId);
      if (!place || place.uf !== uf || !view.hasPage(placeId)) continue;
      const imageUrl = view.familyImage(placeId, family.id);
      if (!imageUrl) continue;
      example = { imageUrl, placeName: place.name };
      href = `${ufPath}/${place.slug}/${family.id}`;
      break;
    }
    families.push({ position: entry.position, id: family.id, name: family.name, href, example, movement: publicMovement(entry.movement) });
  }

  if (localities.length === 0 && families.length === 0) return null;
  return {
    region,
    uf,
    stateName: STATE_NAMES[uf],
    updatedLabel: dateLabel.format(new Date(snapshot.computedAt)),
    updatedAt: snapshot.computedAt,
    pending: fresh.pending,
    localities,
    families,
  };
}

export type PodiumLeader = { uf: string; stateName: string; leaderName: string; href: string };

/** Home teaser: the leading place of each UF, in the order given (the site's editorial state order — NOT a ranking of states). */
export function projectLeaders(
  snapshot: PodioSnapshot | null,
  state: PodioRunState | null,
  region: RegionSlug,
  ufs: readonly string[],
  view: PodioCatalogView,
  now: Date,
): PodiumLeader[] {
  const leaders: PodiumLeader[] = [];
  for (const uf of ufs) {
    const podium = projectPodium(snapshot, state, region, uf, view, now);
    const first = podium?.localities[0];
    if (!podium || !first || first.position !== 1) continue;
    leaders.push({ uf, stateName: podium.stateName, leaderName: first.name, href: `/${region}/${uf.toLowerCase()}#podio` });
  }
  return leaders;
}
