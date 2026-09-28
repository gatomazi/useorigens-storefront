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
