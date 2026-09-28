import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Deliberately permissive: crawling is allowed everywhere and only the sitemap is announced. Pages that must stay out of the index (/busca,
 * /meus-lugares, /personalizar, /admin, non-canonical hosts) say so with `noindex` (meta or X-Robots-Tag); a `Disallow` on them would stop
 * Google from ever fetching the page, so it could never read that `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL.replace(/\/$/, "")}/sitemap.xml`,
  };
}
