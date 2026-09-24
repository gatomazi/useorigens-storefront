import { BANNER_VARIANTS } from "../../editorial/banner-variants.generated";
import type { MediaAssetInfo } from "../../site-config/schema";
import type { MediaChoice } from "./types";

/** The banners already in /public/banners (the same masters and static WebP variants the storefront uses). Available in every mode. */
const bannerAssetId = (src: string) => `legacy:${src.replace(/^\/banners\//, "").replace(/\.[a-z]+$/i, "")}`;

export function listBanners(): MediaChoice[] {
  return Object.entries(BANNER_VARIANTS)
    .map(([src, e]) => ({ assetId: bannerAssetId(src), label: src.replace(/^\/banners\//, ""), src, width: e.width, height: e.height, kind: "banner" as const }))
    .sort((a, b) => (a.label < b.label ? -1 : 1));
}

export function resolveBanners(assetIds: Iterable<string>): Record<string, MediaAssetInfo> {
  const table = new Map(listBanners().map((m) => [m.assetId, m]));
  const out: Record<string, MediaAssetInfo> = {};
  for (const id of assetIds) {
    const m = table.get(id);
    if (m) out[id] = { src: m.src, width: m.width, height: m.height };
  }
  return out;
}
