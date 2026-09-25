/**
 * The ONE decision about whether the admin exists in this process, and how. Pure (no I/O), so it is unit-tested and importable from the
 * proxy. Three outcomes:
 *   - "dev":  development server + ADMIN_DEV_MODE=true (loopback-only, per request; see dev-guard.ts). The local sandbox under data/admin-dev.
 *   - "prod": NODE_ENV=production AND the complete set of variables below. Login with Railway (OIDC) + PostgreSQL + (optionally) a Railway Storage Bucket + the Volume.
 *   - "off":  everything else. `/admin/**` is a plain 404 and no admin code touches a database, R2 or the disk. `missing` says why.
 * ADMIN_DEV_MODE never enables anything in a production process: it is ignored (and reported), whatever else is set.
 */
export type AdminConfig =
  | { mode: "off"; missing: string[]; ignoredDevMode: boolean }
  | { mode: "dev" }
  | {
      mode: "prod";
      adminHost: string; // lower-case host[:port] the admin answers on
      adminOrigin: string; // https://host (http only for a loopback host, i.e. the automated tests)
      ownerEmail: string;
      oauthClientId: string;
      oauthClientSecret: string;
      /** Optional: the owner's immutable Railway account id (`sub`). Lets the first owner be bound without trusting an e-mail claim. */
      ownerSub: string | null;
      sessionSecret: string;
      databaseUrl: string;
      oidcIssuer: string;
    };

type Env = Record<string, string | undefined>;

const REQUIRED = ["ADMIN_HOST", "ADMIN_OWNER_EMAIL", "RAILWAY_OAUTH_CLIENT_ID", "RAILWAY_OAUTH_CLIENT_SECRET", "ADMIN_SESSION_SECRET", "DATABASE_URL"] as const;
const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{2,5})?$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const RAILWAY_ISSUER = "https://backboard.railway.com";
const isLoopbackName = (host: string) => ["localhost", "127.0.0.1"].includes(host.split(":")[0]);

/** Railway in production. A loopback issuer is accepted only for the automated tests' fake provider. */
function issuerFrom(env: Env): string | null {
  const raw = env.ADMIN_OIDC_ISSUER?.trim();
  if (!raw) return RAILWAY_ISSUER;
  if (raw === RAILWAY_ISSUER) return raw;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" && isLoopbackName(u.host) ? raw.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export function adminConfig(env: Env = process.env): AdminConfig {
  if (env.NODE_ENV === "development" && env.ADMIN_DEV_MODE === "true") return { mode: "dev" };
  const ignoredDevMode = env.ADMIN_DEV_MODE === "true";
  if (env.NODE_ENV !== "production") return { mode: "off", missing: ["NODE_ENV=production or a development server"], ignoredDevMode };

  const missing: string[] = REQUIRED.filter((name) => !env[name]?.trim());
  const adminHost = (env.ADMIN_HOST ?? "").trim().toLowerCase();
  if (adminHost && !HOST_RE.test(adminHost)) missing.push("ADMIN_HOST (a bare host name, without scheme or path)");
  const ownerEmail = (env.ADMIN_OWNER_EMAIL ?? "").trim().toLowerCase();
  if (ownerEmail && !EMAIL_RE.test(ownerEmail)) missing.push("ADMIN_OWNER_EMAIL (a valid e-mail)");
  const sessionSecret = env.ADMIN_SESSION_SECRET ?? "";
  if (sessionSecret && sessionSecret.length < 32) missing.push("ADMIN_SESSION_SECRET (at least 32 characters)");
  const oidcIssuer = issuerFrom(env);
  if (!oidcIssuer) missing.push("ADMIN_OIDC_ISSUER (unset, or Railway's)");
  if (missing.length > 0 || !oidcIssuer) return { mode: "off", missing, ignoredDevMode };

  return {
    mode: "prod",
    adminHost,
    adminOrigin: `${isLoopbackName(adminHost) ? "http" : "https"}://${adminHost}`,
    ownerEmail,
    oauthClientId: env.RAILWAY_OAUTH_CLIENT_ID!.trim(),
    oauthClientSecret: env.RAILWAY_OAUTH_CLIENT_SECRET!.trim(),
    ownerSub: env.ADMIN_OWNER_RAILWAY_SUB?.trim() || null,
    sessionSecret,
    databaseUrl: env.DATABASE_URL!.trim(),
    oidcIssuer,
  };
}

/** The host the admin answers on, or null when the production admin is not configured. */
export function adminHostOf(env: Env = process.env): string | null {
  const c = adminConfig(env);
  return c.mode === "prod" ? c.adminHost : null;
}

/** Whether a request's Host header is the admin host (port compared only when the configured host carries one). */
export function isAdminHost(hostHeader: string | null | undefined, adminHost: string | null): boolean {
  if (!hostHeader || !adminHost) return false;
  const host = hostHeader.trim().toLowerCase();
  return adminHost.includes(":") ? host === adminHost : host.split(":")[0] === adminHost;
}
