import "server-only";
import type { RegionSlug } from "../geo/regions";
import { offerStripText } from "../offer-strip";
import { publicInkTheme } from "./ink-theme-public";
import { publicPostAddKit } from "./post-add-kit-public";

/**
 * The offer line of a design page of `region` (state `uf`), from the published rules (see src/lib/offer-strip.ts). INK unreachable or no live rule =
 * null: the page shows nothing rather than a number that may no longer be true.
 */
export async function offerStripFor(region: RegionSlug, uf: string): Promise<string | null> {
  const incentive = publicInkTheme(region).incentive;
  const kit = await publicPostAddKit(region).then((p) => p.kit).catch(() => null);
  return offerStripText({ freeShippingItems: incentive && incentive.ufs.includes(uf.toUpperCase()) ? incentive.threshold : null, kit });
}
