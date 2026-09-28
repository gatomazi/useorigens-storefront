import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * The Federal District / administrative-region round, end to end (docs/storefront/df-administrative-regions-round.md):
 *   npm run test:df
 * One `next dev` server in CMS dev mode over a throw-away sandbox (nothing here touches production, INK, Railway or the Worker). The spec launches
 * Centro-Oeste and Norte in that sandbox through the CMS itself (the same flow tests/e2e-admin/scopes.spec.ts proves), then checks the CMS search,
 * the public search, the DF and RA pages, the home, the sitemap and the three regions. Needs the locally synced catalog + collections snapshots.
 */
const port = 3330;
const sandbox = process.env.CMS_TEST_SANDBOX ?? mkdtempSync(path.join(tmpdir(), "df-e2e-"));
process.env.CMS_TEST_SANDBOX = sandbox;

export default defineConfig({
  testDir: "tests/e2e-df",
  timeout: 900_000,
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
    },
  },
});
