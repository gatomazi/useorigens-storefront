import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * The LOCAL CMS round trip (docs/admin/cms-local-usage.md). Separate from the storefront suite on purpose: it needs a development server with
 * ADMIN_DEV_MODE, and it writes drafts and sandbox publications — into a throw-away temp directory, never into data/admin-dev or any Volume.
 *   npm run test:admin
 */
const port = 3320;
const sandbox = process.env.CMS_TEST_SANDBOX ?? mkdtempSync(path.join(tmpdir(), "cms-e2e-"));
process.env.CMS_TEST_SANDBOX = sandbox;

export default defineConfig({
  testDir: "tests/e2e-admin",
  timeout: 240_000,
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
    timeout: 240_000,
    env: {
      ADMIN_DEV_MODE: "true",
      SITE_CONFIG_HOME: "on",
      ADMIN_DEV_DATA_DIR: sandbox,
      SITE_CONFIG_DIR: path.join(sandbox, "published"),
      NEXT_DIST_DIR_HINT: "cms-e2e", // documentation only
    },
  },
});
