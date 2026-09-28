import path from "node:path";
import { defineConfig } from "@playwright/test";

// Same app, but with Norte and Centro-Oeste marked as launched through a local published bundle
// (tests/e2e-regions/fixtures/published.json, CMS flag on). Only this test server sees it; the default e2e
// config keeps its Sul-only behaviour, which sul.spec.ts asserts.
const port = 3101;

export default defineConfig({
  testDir: "tests/e2e-regions",
  timeout: 90_000,
  retries: 0,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npm run dev -- -p ${port}`,
    url: `http://localhost:${port}/norte`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      SITE_CONFIG_HOME: "on",
      SITE_CONFIG_DIR: path.resolve("tests/e2e-regions/fixtures"),
      NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT: "true",
    },
  },
});
