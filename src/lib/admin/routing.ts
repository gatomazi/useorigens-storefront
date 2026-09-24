/**
 * Host/path routing decision for the admin surface (D4), as a pure function so its precedence is testable before any admin
 * page exists. NOT wired into `src/proxy.ts` yet: today the proxy is unchanged and `/admin` does not exist. When the admin lands
 * (docs/admin/cms-v1-round2.md §7) `proxy.ts` calls this first and acts on the decision.
 *
 * Precedence, highest first:
 *   1. Operational endpoints (`/api/health`, `/api/ready`) answer on every host, never gated, never rewritten.
 *   2. Static assets (`/_next/*`, favicon, robots, sitemap) pass through on every host.
 *   3. On the ADMIN host: only admin routes exist. Paths are rewritten under `/admin`; storefront paths are a 404. The catalog
 *      readiness gate never applies (the admin must work precisely when the catalog is missing), and every response is
 *      `noindex, nofollow` + `no-store`. OIDC login and callback are admin routes, so they live on this host too.
 *   4. On any OTHER host: `/admin/**` is a 404 — the store domain never exposes an admin screen. The rest is the storefront
 *      and keeps today's behaviour (catalog gate, noindex on non-canonical hosts).
 *   `/api/admin/catalog-sync` (Bearer-token, machine-to-machine) is a separate, existing API route: unchanged, any host.
 * The decision is only the FIRST layer: every admin Server Action / route handler still authenticates and authorises on its own
 * (Data Access Layer), as the Next.js authentication guide requires.
 */
export type RouteDecision =
  | { action: "pass" } // storefront/API/static as today
  | { action: "rewrite"; pathname: string; headers: Readonly<Record<string, string>> }
  | { action: "not-found" };

const OPERATIONAL = new Set(["/api/health", "/api/ready"]);
const STATIC_PREFIXES = ["/_next/", "/favicon.ico", "/robots.txt", "/sitemap.xml"];
const ADMIN_HEADERS = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } as const;

const isStatic = (p: string) => STATIC_PREFIXES.some((s) => p === s || p.startsWith(s));
const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/");

export function decideRoute(input: { host: string; pathname: string; adminHost: string | null }): RouteDecision {
  const { pathname } = input;
  const host = input.host.toLowerCase().split(":")[0];
  if (OPERATIONAL.has(pathname) || isStatic(pathname)) return { action: "pass" };

  const onAdminHost = input.adminHost !== null && host === input.adminHost.toLowerCase();
  if (onAdminHost) {
    // Reject any attempt to spell the internal prefix or to traverse out of it; the host already says "admin".
    if (isAdminPath(pathname) || pathname.includes("..") || pathname.includes("//")) return { action: "not-found" };
    if (pathname === "/api" || pathname.startsWith("/api/")) return { action: "not-found" }; // no public API surface on the admin host
    return { action: "rewrite", pathname: pathname === "/" ? "/admin" : `/admin${pathname}`, headers: ADMIN_HEADERS };
  }

  if (isAdminPath(pathname)) return { action: "not-found" };
  return { action: "pass" };
}
