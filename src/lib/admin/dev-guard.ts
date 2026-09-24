/**
 * The local CMS is a DEVELOPMENT tool: there is no OIDC, no database and no shared storage yet, so its screens and actions must not
 * exist anywhere but a developer's own machine. This module is the single, pure decision (unit-tested), enforced in three places:
 * `src/proxy.ts` (404 before anything renders), the admin layout/pages, and every server action / route handler (`requireDevAdmin`).
 *
 * Allowed only when ALL of these hold:
 *   1. `NODE_ENV === "development"` (a `next build` / `next start` / Railway process can never satisfy this),
 *   2. `ADMIN_DEV_MODE === "true"` (explicit opt-in; the literal string),
 *   3. the request's Host is a loopback name (`localhost`, `127.0.0.1`, `[::1]`),
 *   4. no proxy header points anywhere but loopback. Next itself stamps `x-forwarded-host/port/proto/for` on every request it handles, so
 *      their mere presence proves nothing; what matters is their VALUE: a reverse proxy in front of the dev server forwards the real
 *      client address or public host (`x-forwarded-for: 203.0.113.9`, `x-forwarded-host: www.useorigens.com.br`), and any such value, or
 *      a `via` / `forwarded` header at all, means the request did not originate on this machine, whatever Host says.
 * `npm run cms:dev` additionally binds the dev server to 127.0.0.1, so the network never delivers a foreign request in the first place;
 * the checks above are defence in depth, not the only barrier.
 */
export type DevGuardResult = { ok: true } | { ok: false; reason: string };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ALWAYS_PROXY = ["forwarded", "via"]; // only a real intermediary sets these
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);

export function devAdminEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" && env.ADMIN_DEV_MODE === "true";
}

export function isLoopbackHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  // Strip an optional port; keep the brackets of an IPv6 literal.
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return LOOPBACK_HOSTS.has(name);
}

export function checkDevAdminRequest(headers: { get(name: string): string | null }, env: Record<string, string | undefined> = process.env): DevGuardResult {
  if (env.NODE_ENV !== "development") return { ok: false, reason: "not a development server" };
  if (env.ADMIN_DEV_MODE !== "true") return { ok: false, reason: "ADMIN_DEV_MODE is not enabled" };
  if (!isLoopbackHost(headers.get("host"))) return { ok: false, reason: "not a loopback host" };
  const always = ALWAYS_PROXY.find((h) => headers.get(h) !== null);
  if (always) return { ok: false, reason: `proxied request (${always})` };
  for (const h of ["x-forwarded-for", "x-real-ip"]) {
    const value = headers.get(h);
    if (value !== null && !value.split(",").every((ip) => LOOPBACK_IPS.has(ip.trim().toLowerCase()))) return { ok: false, reason: `forwarded from a non-loopback address (${h})` };
  }
  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedHost !== null && !isLoopbackHost(forwardedHost.split(",")[0])) return { ok: false, reason: "forwarded from a non-loopback host" };
  return { ok: true };
}
