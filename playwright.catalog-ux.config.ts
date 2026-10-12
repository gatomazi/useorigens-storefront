import { defineConfig } from "@playwright/test";

/**
 * Catalog UX V1 (docs/design/catalog-ux-v1-result.md): the city page's piece rail, the collection page's filters and sort, the home's first
 * screen, the menu and the overlays. The collection pages only exist with the config-driven store on, so this server runs with the local
 * published configuration (data/admin-dev/published, like `npm run cms:dev`) and the local snapshots (catalog, collections, garment index).
 * The GoToInk test needs the local published GLOBAL document to carry tracking IDs (`tracking.meta.mode = "override"` with the test pixel id below):
 * with the CMS on, the storefront reads the IDs from the published configuration, never from the environment.
 *   npx playwright test -c playwright.catalog-ux.config.ts
 */
const port = 3250;

export default defineConfig({
  testDir: "tests/e2e-catalog-ux",
  timeout: 90_000,
  retries: 0,
  expect: { timeout: 20_000 },
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}/sul`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      SITE_CONFIG_HOME: "on",
      SITE_CONFIG_DIR: `${process.cwd()}/data/admin-dev/published`,
      // Same real (non-secret) IDs and strict consent gate as playwright.config.ts: every test that grants consent mocks `window.fbq` first.
      NEXT_PUBLIC_META_PIXEL_ID: "1558923262073052",
      NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-8GYTEJ1F77",
      NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT: "true",
    },
  },
});
