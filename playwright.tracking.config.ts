import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Per-region Meta/GA4 tracking, end to end: configured through the CMS screens (dev guard, sandbox in a temp dir), read back on the storefront.
 * The build-time IDs below are FAKE (they play the role of Sul's legacy IDs); the SDKs are mocked in the browser and any request to
 * Meta/Google fails the test, so nothing ever reaches a real pixel.   npx playwright test -c playwright.tracking.config.ts
 */
const port = 3330;
const sandbox = process.env.CMS_TRACKING_SANDBOX ?? mkdtempSync(path.join(tmpdir(), "cms-tracking-"));
process.env.CMS_TRACKING_SANDBOX = sandbox;

export default defineConfig({
  testDir: "tests/e2e-tracking",
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
      NEXT_PUBLIC_META_PIXEL_ID: "1111111111111111",
      NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-LEGACY0001",
    },
  },
});
