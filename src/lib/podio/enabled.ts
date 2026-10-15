import "server-only";
import { podioPublicEnabled } from "../config/env";
import type { RegionSlug } from "../geo/regions";
import { podioEnabledIn } from "../site-config/podio-schema";
import { readPublished } from "../site-config/published";
import type { ScopeDoc } from "../site-config/schema";

/** The region's PUBLISHED document (a draft never reaches the public nor the daily calculation); none = nothing published yet. */
function publishedDoc(region: RegionSlug): ScopeDoc | undefined {
  const state = readPublished();
  return state.source === "published" ? state.bundle.docs[region] : undefined;
}

/**
 * Is "O Pódio" on for this region? Off when `PODIO_PUBLIC=off` (server kill switch, every region) or when the region's published document
 * switched it off in the panel (Home · Seções). Off means BOTH: nothing is shown (home teaser, state pages) and the daily calculation skips
 * the region. `doc` = the document being rendered, when it is not the published one (the admin preview of a draft).
 */
export function podioEnabled(region: RegionSlug, doc: ScopeDoc | undefined = publishedDoc(region)): boolean {
  return podioPublicEnabled() && podioEnabledIn(doc);
}
