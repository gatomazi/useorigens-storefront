/**
 * schema.org JSON-LD builders. Only what is verifiable and true of these pages: breadcrumbs that mirror the visible ones, the site and the
 * organisation. NEVER `Product`/`Offer`, prices, stock, shipping or ratings: the city pages only hand the shopper over to the regional store.
 */
export type Crumb = { name: string; path: string };

type Json = Record<string, unknown>;

const absolute = (siteUrl: string, path: string): string => `${siteUrl.replace(/\/$/, "")}${path}`;

/** Same items, same order and same names as the visible breadcrumb (Google requires them to agree). */
export function breadcrumbList(siteUrl: string, crumbs: readonly Crumb[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: absolute(siteUrl, crumb.path) })),
  };
}

export function webSite(siteUrl: string): Json {
  return { "@context": "https://schema.org", "@type": "WebSite", name: "Use Origens", url: absolute(siteUrl, "/"), inLanguage: "pt-BR" };
}

export function organization(siteUrl: string, input: { logoPath: string; sameAs: readonly string[] }): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Use Origens",
    url: absolute(siteUrl, "/"),
    logo: absolute(siteUrl, input.logoPath),
    ...(input.sameAs.length > 0 ? { sameAs: [...input.sameAs] } : {}),
  };
}

/**
 * JSON for an inline `<script type="application/ld+json">`. `<`, `>` and `&` are escaped so no value (a city name, say) can close the
 * script tag or open a comment, and U+2028/U+2029 (valid JSON, invalid in old JS parsers) are escaped too.
 */
export function serializeJsonLd(data: Json): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
