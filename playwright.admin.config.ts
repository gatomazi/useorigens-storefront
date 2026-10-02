import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * The LOCAL CMS round trip (docs/admin/cms-local-usage.md). One `next dev` server, one sandbox, shared by every spec — as before.
 *   npm run test:admin
 *
 * Two things a spec creates are irreversible for the rest of this sandbox's lifetime, so the specs that assume the PRISTINE state are pinned to run
 * FIRST via project `dependencies` (Playwright always finishes a dependency project before starting the one that depends on it, and stops that chain
 * on its first failure — this is not parallelism, it is an explicit order):
 *   - `roundtrip.spec.ts` needs the internal collection "Fé de Origem" to start disabled (it proves the section-adder does not offer it yet) AND
 *     needs to be the sandbox's very first publish, since it asserts "release 1" by name — so it goes first, before anything else publishes.
 *   - `scopes.spec.ts` needs Norte AND Centro-Oeste to have no home yet ("Esta região ainda não tem home"); `hero.spec.ts` and `structured.spec.ts`
 *     create one for both regions, and there is no "delete this region's home outright" action, only recall (back to preview) — so scopes runs right
 *     after roundtrip (its own file comment already said as much: "Runs AFTER roundtrip.spec.ts, which counts sandbox releases from 1."), before
 *     hero or structured ever touch Norte or Centro-Oeste. `hotpages.spec.ts` enables that same "Fé de Origem" collection (idempotently, so it works
 *     whether or not roundtrip ran first) and can run anywhere after roundtrip.
 *   - `navigation-theme.spec.ts` launches Norte and Centro-Oeste by itself (idempotently), publishes navigation and palettes for the three regions and leaves
 *     Sul with its own palette, so it goes last; it can also run alone on a fresh sandbox (`--no-deps`).
 *   - `promotions.spec.ts` publishes Sul's coupons and promotions; it does not depend on the others' state and also runs alone (`--no-deps`).
 * `hotpages.spec.ts` and the production-mode suite (`tests/e2e-prod`) additionally treat "already enabled" as fine on their own (see the idempotent
 * enable step in both), so this order is a documented convenience, not the only thing standing between the suite and a false failure.
 * `docs/admin/cms-hotpages-personalizacao-final-gate.md` §C has the failures this replaced and the reproduction command for the old, unordered run.
 */
const port = 3320;
const sandbox = process.env.CMS_TEST_SANDBOX ?? mkdtempSync(path.join(tmpdir(), "cms-e2e-"));
process.env.CMS_TEST_SANDBOX = sandbox;

const ORDER = ["roundtrip.spec.ts", "scopes.spec.ts", "hero.spec.ts", "hotpages.spec.ts", "navbar.spec.ts", "structured.spec.ts", "navigation-theme.spec.ts", "promotions.spec.ts"] as const;

export default defineConfig({
  testDir: "tests/e2e-admin",
  timeout: 600_000,
  // A development server compiles each route on first use (seconds, and far more under load): assertions get a budget that covers a cold
  // compile. This is an upper bound for a state to appear, not a sleep.
  expect: { timeout: 60_000 },
  workers: 1,
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `npx next dev -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 600_000,
    env: {
      ADMIN_DEV_MODE: "true",
      SITE_CONFIG_HOME: "on",
      ADMIN_DEV_DATA_DIR: sandbox,
      SITE_CONFIG_DIR: path.join(sandbox, "published"),
      NEXT_DIST_DIR_HINT: "cms-e2e", // documentation only
    },
  },
  projects: ORDER.map((file, i) => ({
    name: file,
    testMatch: file,
    ...(i > 0 ? { dependencies: [ORDER[i - 1]] } : {}),
  })),
});
