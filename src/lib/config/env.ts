import "server-only";
import path from "node:path";
import type { CommerceStoreKey } from "../geo/regions";

/**
 * Single, validated place for the environment variables that are NOT already owned by `ink/config.ts`
 * (INK_API_BASE_URL, INK_TOKEN_*, ALLOWED_COMMERCE_HOSTS — read and validated there, next to the client that
 * uses them). This module reads: NEXT_PUBLIC_SITE_URL, COMMERCE_STORE_PRIORITY, ADMIN_SYNC_TOKEN.
 *
 * Two execution modes read env vars in this app, and neither needs everything:
 *  - the web process (`next start`/`next dev`, every page/route): every var below already has a safe
 *    default or is optional — this module never throws while just serving pages. It never reads an
 *    INK_TOKEN_* var itself.
 *  - the sync path (`npm run catalog:sync`, or `POST /api/admin/catalog-sync`): also needs at least one
 *    INK_TOKEN_* set — `requireAtLeastOneInkToken()` throws a clear, specific error otherwise, instead of
 *    silently syncing nothing.
 *
 * Build-time vs runtime: `NEXT_PUBLIC_SITE_URL` is the one exception — the `NEXT_PUBLIC_` prefix means
 * Next.js inlines it into the client bundle at `next build` time, so it must be set wherever the build
 * runs (Railway's build step), not only where the container later starts. Every other var here is read at
 * request/call time and only needs to exist where the process actually runs. See docs/deploy/railway.md.
 */

export class ConfigError extends Error {
  constructor(varName: string, reason: string) {
    super(`invalid env var ${varName}: ${reason}`);
    this.name = "ConfigError";
  }
}

const VALID_STORE_KEYS: readonly CommerceStoreKey[] = ["use-sul", "use-norte", "use-centro", "use-origens"];

function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Public site URL for canonical/OG metadata. Optional; falls back to the production domain. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return "https://www.useorigens.com.br";
  if (!isAbsoluteUrl(raw)) throw new ConfigError("NEXT_PUBLIC_SITE_URL", "must be a valid absolute URL, e.g. https://www.useorigens.com.br");
  return raw;
}

const INK_TOKEN_ENV_BY_STORE: Partial<Record<CommerceStoreKey, string>> = {
  "use-sul": "INK_TOKEN_SUL",
  "use-norte": "INK_TOKEN_NORTE",
  "use-centro": "INK_TOKEN_CENTRO",
};

/** Throws unless at least one INK_TOKEN_* is set. Call only from the sync path, never from page rendering. */
export function requireAtLeastOneInkToken(): void {
  const anySet = Object.values(INK_TOKEN_ENV_BY_STORE).some((envName) => Boolean(process.env[envName]));
  if (!anySet) {
    throw new ConfigError(
      "INK_TOKEN_SUL / INK_TOKEN_NORTE / INK_TOKEN_CENTRO",
      "at least one must be set to sync anything — nothing to do otherwise",
    );
  }
}

/**
 * `regional` (default, unset, or the literal string "regional"): caller picks the region's own store first.
 * A comma list overrides it globally, e.g. "use-origens,use-sul" — only meaningful once stores consolidate.
 * Validated against known store keys so a typo fails loudly instead of silently ranking nothing from it.
 */
export function commerceStorePriorityOverride(): CommerceStoreKey[] | null {
  const raw = process.env.COMMERCE_STORE_PRIORITY?.trim();
  if (!raw || raw === "regional") return null;
  const keys = raw.split(",").map((s) => s.trim());
  const invalid = keys.filter((k) => !VALID_STORE_KEYS.includes(k as CommerceStoreKey));
  if (invalid.length > 0) {
    throw new ConfigError("COMMERCE_STORE_PRIORITY", `unknown store key(s): ${invalid.join(", ")} — valid: ${VALID_STORE_KEYS.join(", ")}`);
  }
  return keys as CommerceStoreKey[];
}

/**
 * Bearer token gating `POST /api/admin/catalog-sync`. Unset (the default) means the route stays disabled
 * (503) rather than silently open — set it only where the sync is meant to be triggered from.
 */
export function adminSyncToken(): string | null {
  const value = process.env.ADMIN_SYNC_TOKEN;
  return value && value.length > 0 ? value : null;
}

/**
 * Testing-only escape hatch: when `true`, `POST /api/admin/catalog-sync` accepts a `fixtureSnapshot` body
 * field and promotes it directly instead of fetching from INK — the only way to exercise the real
 * promote-and-revalidate path (including the actual `revalidatePath` call) without calling INK, as required
 * by the bootstrap review (§3: "Não chamar a INK real para esse teste"). Defaults to disabled (`false` unless
 * the literal string `"true"`), so production never has this surface unless a deploy deliberately opts in —
 * which it never should. Never document this as a normal operational setting.
 */
export function allowFixtureSync(): boolean {
  return process.env.ALLOW_FIXTURE_SYNC === "true";
}

/**
 * Directory holding the catalog snapshot — where a Railway Volume must be mounted. Defaults to
 * `data/generated` under `process.cwd()`, which is what `docs/deploy/railway.md` tells an operator to mount
 * on. Overridable via `CATALOG_SNAPSHOT_DIR` for two real reasons: (1) `process.cwd()` at runtime is an
 * assumption, not a guarantee — the bootstrap review explicitly asked not to presume `/app`; this override
 * lets an operator point at the real mount path if it differs, without a code change; (2) it lets tests
 * exercise an empty-volume bootstrap in isolation, deterministically, without touching real snapshot data.
 * Always resolved to an absolute path and logged at boot (`src/instrumentation.ts`) and in `/api/ready`, so
 * the actual path in use is observable rather than assumed.
 */
export function catalogSnapshotDir(): string {
  const override = process.env.CATALOG_SNAPSHOT_DIR;
  if (!override) return path.join(process.cwd(), "data", "generated");
  if (!path.isAbsolute(override)) {
    throw new ConfigError("CATALOG_SNAPSHOT_DIR", `must be an absolute path (got "${override}")`);
  }
  return override;
}
