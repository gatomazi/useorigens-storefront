/**
 * Whether a request's `Host` header is the canonical public host (the host of NEXT_PUBLIC_SITE_URL). Pure, so every case is unit-tested.
 *
 * Why the raw header and not `request.nextUrl.hostname`: behind Railway/Cloudflare `nextUrl` carries the server's own bind hostname, so the
 * comparison never matched and EVERY page of the real domain was sent as `noindex`. The header the client sent is what names the public host
 * (the admin routing in src/lib/admin/routing.ts already relies on it).
 *
 * The result only decides whether `X-Robots-Tag: noindex` is added, never identity or a redirect target, and it fails closed: a missing,
 * malformed or multi-valued Host, an IP literal, or anything that is not exactly the canonical name is NOT canonical (stays noindex).
 * `X-Forwarded-Host` is deliberately ignored: any client can send it.
 */
const HOST_HEADER = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.?(:\d{1,5})?$/;

export function isCanonicalHost(hostHeader: string | null | undefined, canonicalSiteUrl: string): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  if (!HOST_HEADER.test(host)) return false;
  const name = host.replace(/:\d+$/, "").replace(/\.$/, "");

  let canonical: string;
  try {
    canonical = new URL(canonicalSiteUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return name === canonical;
}

/**
 * Paths the bare domain never redirects: machine endpoints (the API, OAuth/MCP discovery, the feeds under /api) and assets other systems embed by
 * absolute URL, plus /admin (its own routing in src/lib/admin/routing.ts) and the password-protected /estampas editor. Only storefront PAGES move to www.
 */
const APEX_STAYS = [/^\/api(\/|$)/, /^\/\.well-known(\/|$)/, /^\/admin(\/|$)/, /^\/estampas(\/|$)/, /^\/media\//, /^\/troca-foto\//, /^\/_next\//];

/**
 * Where a request to the bare domain (`useorigens.com.br`) goes: the same path and query on the canonical `www` host, or null when it stays where it is.
 * It moves only a GET/HEAD for a storefront page whose Host is EXACTLY the canonical host without `www.` — so nothing happens when the canonical URL has
 * no `www.` (localhost, a temporary Railway address), for other subdomains, look-alike names, or POSTs (a form or a Server Action keeps working).
 *
 * The destination is built by plain concatenation onto the canonical ORIGIN, never with `new URL(path, base)`: a path such as `//evil.example` would
 * otherwise become another host. It never uses anything the request says about itself except the path and query it asked for.
 */
export function apexRedirect(input: { hostHeader: string | null | undefined; pathname: string; search: string; method: string; canonicalSiteUrl: string }): string | null {
  const { hostHeader, pathname, search, method, canonicalSiteUrl } = input;
  if (method !== "GET" && method !== "HEAD") return null;
  if (!hostHeader) return null;
  const host = hostHeader.trim().toLowerCase();
  if (!HOST_HEADER.test(host)) return null;
  const name = host.replace(/:\d+$/, "").replace(/\.$/, "");

  let canonical: URL;
  try {
    canonical = new URL(canonicalSiteUrl);
  } catch {
    return null;
  }
  const canonicalName = canonical.hostname.toLowerCase();
  if (!canonicalName.startsWith("www.") || name !== canonicalName.slice(4)) return null;
  if (APEX_STAYS.some((stays) => stays.test(pathname))) return null;
  return `${canonical.origin}${pathname}${search}`;
}
