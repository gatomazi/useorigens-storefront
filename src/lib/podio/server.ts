import "server-only";
import { getCatalog } from "../catalog/repository";
import { podioPublicEnabled } from "../config/env";
import { localityById } from "../geo/localities";
import type { RegionSlug } from "../geo/regions";
import { freshnessOf, projectLeaders, projectPodium, type PodioCatalogView, type PodiumLeader, type PublicPodium } from "./public";
import { readLatestSnapshot, readRunState } from "./snapshot";

function catalogView(): PodioCatalogView {
  const catalog = getCatalog();
  return {
    locality: (id) => localityById(id),
    hasPage: (id) => {
      const place = localityById(id);
      if (!place) return false;
      // Same rule as the locality route (catalog/resolver.ts): a municipality always has its page, an administrative region only with products.
      return place.type === "municipality" || catalog.cityFamilies(id).length > 0;
    },
    familyImage: (localityId, familyId) => {
      const url = catalog.cityFamilies(localityId).find((e) => e.family.id === familyId)?.primary.imageUrl;
      return url && url.startsWith("https://") ? url : null;
    },
  };
}

const warned = new Set<string>();
/** A hidden podium because of a missing/old snapshot is an operational problem: say so in the server log, once per region and snapshot. */
function logIfHidden(region: RegionSlug): void {
  const snapshot = readLatestSnapshot(region);
  const fresh = freshnessOf(snapshot, readRunState(region), new Date());
  if (fresh.visible) return;
  const key = `${region}:${fresh.reason}:${snapshot?.computedAt ?? "none"}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[podio] ${region}: hidden (${fresh.reason === "missing" ? "no snapshot yet" : `snapshot from ${snapshot?.computedAt} is older than 72 h`})`);
}

/** The state page's podium. Null = render nothing (flag off, no snapshot, stale, or no eligible sales in this UF). */
export function getStatePodium(region: RegionSlug, uf: string): PublicPodium | null {
  if (!podioPublicEnabled()) return null;
  logIfHidden(region);
  return projectPodium(readLatestSnapshot(region), readRunState(region), region, uf, catalogView(), new Date());
}

/** The home teaser's leaders — same snapshot, same projection as the state page. */
export function getPodiumLeaders(region: RegionSlug, ufs: readonly string[]): PodiumLeader[] {
  if (!podioPublicEnabled()) return [];
  logIfHidden(region);
  return projectLeaders(readLatestSnapshot(region), readRunState(region), region, ufs, catalogView(), new Date());
}
