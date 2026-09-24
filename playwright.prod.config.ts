import { copyFileSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * The PRODUCTION-mode admin, end to end, on a real `next start` build, with every external service replaced by a local stand-in:
 * PostgreSQL (PGlite over the wire protocol), Google (a fake OpenID provider), R2 (a fake S3 with a public read path). Nothing outside
 * this machine is contacted and no secret is real. Needs a build first:
 *   NEXT_PUBLIC_META_PIXEL_ID=… NEXT_PUBLIC_GA_MEASUREMENT_ID=… npm run build && npm run test:admin:prod
 * The catalog snapshot is COPIED from data/generated into a temp "Volume" (the app writes published.json there, never into the repo).
 */
const APP = 3400;
const volume = process.env.CMS_PROD_VOLUME ?? mkdtempSync(path.join(tmpdir(), "cms-prod-volume-"));
process.env.CMS_PROD_VOLUME = volume;
mkdirSync(volume, { recursive: true });
for (const f of ["catalog-snapshot.json", "collections-snapshot.json"]) {
  const src = path.join(process.cwd(), "data", "generated", f);
  if (existsSync(src)) copyFileSync(src, path.join(volume, f));
}

export default defineConfig({
  testDir: "tests/e2e-prod",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${APP}` },
  webServer: [
    { command: "npx tsx tests/e2e-prod/servers/db.mts", port: 54390, reuseExistingServer: false, timeout: 300_000 },
    { command: "npx tsx tests/e2e-prod/servers/idp.mts", url: "http://127.0.0.1:4555/jwks", reuseExistingServer: false, timeout: 300_000, env: { E2E_CLIENT_ID: "e2e-client", E2E_CLIENT_SECRET: "e2e-secret" } },
    { command: "npx tsx tests/e2e-prod/servers/s3.mts", url: "http://127.0.0.1:4600/__stats", reuseExistingServer: false, timeout: 300_000 },
    {
      command: `npx next start -H 127.0.0.1 -p ${APP}`,
      url: `http://127.0.0.1:${APP}/api/health`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        NODE_ENV: "production",
        ADMIN_HOST: `127.0.0.1:${APP}`,
        ADMIN_OWNER_EMAIL: "owner@e2e.test",
        GOOGLE_OAUTH_CLIENT_ID: "e2e-client",
        GOOGLE_OAUTH_CLIENT_SECRET: "e2e-secret",
        ADMIN_SESSION_SECRET: "e2e-session-secret-e2e-session-secret-0123456789",
        ADMIN_OIDC_ISSUER: "http://127.0.0.1:4555",
        DATABASE_URL: "postgres://postgres@127.0.0.1:54390/postgres",
        DATABASE_POOL_MAX: "3",
        R2_ENDPOINT: "http://127.0.0.1:4600",
        R2_BUCKET: "e2e-bucket",
        R2_ACCESS_KEY_ID: "E2EACCESSKEY",
        R2_SECRET_ACCESS_KEY: "e2e-secret-access-key",
        MEDIA_PUBLIC_BASE_URL: "http://127.0.0.1:4600",
        MEDIA_EXTRA_ORIGINS: "http://127.0.0.1:4600",
        SITE_CONFIG_HOME: "on",
        CATALOG_SNAPSHOT_DIR: volume,
      },
    },
  ],
});
