/**
 * Host/path routing decision for the admin surface (D4), as a pure function so its precedence is testable. `src/proxy.ts` calls it first
 * and acts on the decision.
 *
 * Precedence, highest first:
 *   1. Operational endpoints (`/api/health`, `/api/ready`) answer on every host, never gated, never rewritten.
 *   2. Static assets (`/_next/*`, favicon, robots, sitemap) pass through on every host.
 *   3. On the ADMIN host (`ADMIN_HOST`, only when the production admin is fully configured): only `/admin/**` exists (the panel's own
 *      links carry the prefix, so nothing is rewritten); `/` redirects to `/admin`; everything else, including the storefront and the
 *      public API, is a 404. The catalog readiness gate never applies (the admin must work precisely when the catalog is missing), and
 *      every response is `noindex, nofollow` + `no-store`.
 *   4. On any OTHER host: `/admin/**` is a 404, unless this is a development server started with ADMIN_DEV_MODE (`devAdmin`), where the
 *      pages themselves still insist on a loopback request. The store domain never exposes an admin screen.
 * The decision is only the FIRST layer: every admin page, Server Action and route handler still authenticates and authorises on its own
 * (Data Access Layer), as the Next.js authentication guide requires. Host headers are never proof of identity.
 */
export type RouteDecision =
  | { action: "pass"; headers?: Readonly<Record<string, string>> } // storefront/API/static as today, or an admin page with hardening headers
  | { action: "redirect"; pathname: string; headers: Readonly<Record<string, string>> }
  | { action: "not-found" };

const OPERATIONAL = new Set(["/api/health", "/api/ready"]);
const STATIC_PREFIXES = ["/_next/", "/favicon.ico", "/robots.txt", "/sitemap.xml"];
export const ADMIN_HEADERS = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } as const;

const isStatic = (p: string) => STATIC_PREFIXES.some((s) => p === s || p.startsWith(s));
const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/");

export function decideRoute(input: { host: string; pathname: string; adminHost: string | null; devAdmin?: boolean }): RouteDecision {
  const { pathname } = input;
  const host = input.host.trim().toLowerCase();
  if (OPERATIONAL.has(pathname) || isStatic(pathname)) return { action: "pass" };

  const onAdminHost = input.adminHost !== null && (input.adminHost.includes(":") ? host === input.adminHost.toLowerCase() : host.split(":")[0] === input.adminHost.toLowerCase());
  if (onAdminHost) {
    if (pathname.includes("..") || pathname.includes("//")) return { action: "not-found" };
    if (pathname === "/") return { action: "redirect", pathname: "/admin", headers: ADMIN_HEADERS };
    if (isAdminPath(pathname)) return { action: "pass", headers: ADMIN_HEADERS };
    return { action: "not-found" }; // the storefront and the public API do not exist on the admin host
  }

  if (isAdminPath(pathname)) return input.devAdmin ? { action: "pass", headers: ADMIN_HEADERS } : { action: "not-found" };
  return { action: "pass" };
}
