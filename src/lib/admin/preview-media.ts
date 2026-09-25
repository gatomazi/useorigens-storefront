import type { PublishedBundle } from "../site-config/schema";
import { adminMediaUrl } from "../site-config/media-hosts";

/**
 * The preview renders a draft with the storefront's own components, but a draft's uploads are not public: the storefront's `/media/...`
 * route serves only PUBLISHED objects. So, AFTER the bundle went through the same tolerant reader the storefront uses, the upload URLs are
 * pointed at the authenticated admin route (`/admin/media/...`, same objects, session required). The published bundle is never rewritten.
 */
export function withPreviewMedia(bundle: PublishedBundle): PublishedBundle {
  const media: PublishedBundle["media"] = {};
  for (const [id, m] of Object.entries(bundle.media)) {
    if (!m.src.startsWith("/media/")) {
      media[id] = m;
      continue;
    }
    media[id] = { ...m, src: adminMediaUrl(m.src.slice(1)), variants: m.variants?.map((v) => ({ w: v.w, src: adminMediaUrl(v.src.slice(1)) })) };
  }
  return { ...bundle, media };
}
