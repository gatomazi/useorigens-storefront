/**
 * Host/path routing decision for the admin surface (D4), as a pure function so its precedence is testable. `src/proxy.ts` calls it first
 * and acts on the decision.
 *
 * The admin lives at `/admin` on the SAME host as the storefront (ADMIN_HOST, e.g. www.useorigens.com.br): one service, no extra domain.
 * Precedence, highest first:
 *   1. Operational endpoints (`/api/health`, `/api/ready`) and static assets (`/_next/*`, favicon, robots, sitemap) pass on every host.
 *   2. On the ADMIN host: `/admin/**` passes with `noindex, nofollow` + `no-store` (never behind the catalog readiness gate: the admin
 *      must work precisely when the catalog is missing). EVERYTHING ELSE is the storefront and passes exactly as before: this decision
 *      never changes public navigation.
 *   3. On the bare (apex) form of the admin host (`useorigens.com.br` for `www.useorigens.com.br`): `/admin/**` redirects to the admin
 *      host, keeping path and query, so a mistyped address does not strand the person (the OAuth callback and the session cookie are bound
 *      to the admin host, so the sign-in itself always starts there). Everything else on the apex passes untouched.
 *   4. On any OTHER host (Railway's temporary address, any look-alike): `/admin/**` is a 404, unless this is a development server started
 *      with ADMIN_DEV_MODE (`devAdmin`), where the pages themselves still insist on a loopback request.
 * The decision is only the FIRST layer: every admin page, Server Action and route handler still authenticates and authorises on its own
 * (Data Access Layer), as the Next.js authentication guide requires. Host headers are never proof of identity.
 */
export type RouteDecision =
  | { action: "pass"; headers?: Readonly<Record<string, string>> } // storefront/API/static as today, or an admin page with hardening headers
  | { action: "redirect"; pathname: string; toAdminHost: true; headers: Readonly<Record<string, string>> }
  | { action: "not-found" };

const OPERATIONAL = new Set(["/api/health", "/api/ready"]);
const STATIC_PREFIXES = ["/_next/", "/favicon.ico", "/robots.txt", "/sitemap.xml"];
export const ADMIN_HEADERS = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } as const;

const isStatic = (p: string) => STATIC_PREFIXES.some((s) => p === s || p.startsWith(s));
const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/");

/** The bare form of a `www.` admin host, or null when the admin host is not a `www.` name. */
export const apexOf = (adminHost: string): string | null => {
  const name = adminHost.toLowerCase().split(":")[0];
  return name.startsWith("www.") && !adminHost.includes(":") ? name.slice(4) : null;
};

export function decideRoute(input: { host: string; pathname: string; adminHost: string | null; devAdmin?: boolean }): RouteDecision {
  const { pathname } = input;
  const host = input.host.trim().toLowerCase();
  if (OPERATIONAL.has(pathname) || isStatic(pathname)) return { action: "pass" };
  if (!isAdminPath(pathname)) return { action: "pass" }; // the storefront: never touched here, on any host

  const admin = input.adminHost?.toLowerCase() ?? null;
  const onAdminHost = admin !== null && (admin.includes(":") ? host === admin : host.split(":")[0] === admin);
  if (onAdminHost) {
    if (pathname.includes("..") || pathname.includes("//")) return { action: "not-found" };
    return { action: "pass", headers: ADMIN_HEADERS };
  }
  if (admin !== null && apexOf(admin) === host.split(":")[0]) return { action: "redirect", pathname, toAdminHost: true, headers: ADMIN_HEADERS };
  return input.devAdmin ? { action: "pass", headers: ADMIN_HEADERS } : { action: "not-found" };
}
