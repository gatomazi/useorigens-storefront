// Read-only readiness check for the production CMS. Run it where the variables are (`railway run npm run cms:check`) BEFORE enabling
// anything. It prints only names and pass/fail: never a value, never a URL with credentials. It writes nothing except one temporary
// file (created and removed) in the Volume's site-config directory, to prove that directory is writable.
//
//   npm run cms:check           exit 0 = everything the admin needs is in place; 1 = at least one requirement is missing
import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { adminConfig } from "../src/lib/admin/config";
import { createPgDb } from "../src/lib/admin/db/pg-db";
import { loadMigrations, migrationStatus } from "../src/lib/admin/db/migrate";
import { createObjectStore, defaultAddressing } from "../src/lib/admin/media/s3";

let failures = 0;
let warnings = 0;
const ok = (msg: string) => console.log(`  OK    ${msg}`);
const bad = (msg: string) => { failures++; console.log(`  FAIL  ${msg}`); };
const warn = (msg: string) => { warnings++; console.log(`  WARN  ${msg}`); };
const scrub = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/[a-z]+:\/\/\S+/gi, "<url>");

console.log("\n[1] Admin configuration (names only)");
const env = process.env;
const config = adminConfig({ ...env, NODE_ENV: "production", ADMIN_DEV_MODE: undefined });
if (config.mode === "prod") {
  ok(`admin host ${config.adminHost}, owner set, Railway OAuth client set, session secret set, DATABASE_URL set`);
  if (config.oidcIssuer !== "https://backboard.railway.com") warn("ADMIN_OIDC_ISSUER is not Railway's: fine for a test provider, wrong for production");
  ok(`redirect URI to register in the Railway OAuth App, exactly: ${config.adminOrigin}/admin/auth/callback`);
  if (!config.ownerSub) warn("ADMIN_OWNER_RAILWAY_SUB is not set: the owner is bound by a VERIFIED e-mail equal to ADMIN_OWNER_EMAIL (if Railway does not report the e-mail as verified, sign in once, copy the account id shown on the refusal screen, and set this variable)");
  if (!config.adminOrigin.startsWith("https://")) warn("the admin origin is not https");
} else {
  bad(`the production admin would be OFF (404). Missing or invalid: ${config.mode === "off" ? config.missing.join(", ") : "unknown"}`);
}
if (env.ADMIN_DEV_MODE === "true") warn("ADMIN_DEV_MODE=true is set: it is ignored in production, but remove it from the service");

console.log("\n[2] Database");
if (config.mode === "prod") {
  const db = createPgDb({ connectionString: config.databaseUrl, max: 1, ssl: env.DATABASE_SSL === "require", connectionTimeoutMs: 8_000, statementTimeoutMs: 10_000 });
  try {
    await db.query("select 1");
    ok("connected");
    const s = await migrationStatus(db, loadMigrations(path.join(process.cwd(), "db", "migrations")));
    if (s.pending.length === 0) ok(`migrations up to date (${s.applied.join(", ") || "none"})`);
    else bad(`pending migrations: ${s.pending.join(", ")}  ->  npm run db:migrate`);
    if (s.unknown.length) warn(`the database has migrations this build does not know: ${s.unknown.join(", ")}`);
  } catch (e) {
    bad(`cannot use the database: ${scrub(e)}`);
  } finally {
    await db.close().catch(() => undefined);
  }
} else warn("skipped (admin not configured)");

console.log("\n[3] Media storage (Railway Storage Bucket, private)");
const bucket = { endpoint: env.BUCKET_ENDPOINT, name: env.BUCKET_NAME, accessKeyId: env.BUCKET_ACCESS_KEY_ID, secretAccessKey: env.BUCKET_SECRET_ACCESS_KEY };
const missingBucket = Object.entries({ BUCKET_ENDPOINT: bucket.endpoint, BUCKET_NAME: bucket.name, BUCKET_ACCESS_KEY_ID: bucket.accessKeyId, BUCKET_SECRET_ACCESS_KEY: bucket.secretAccessKey }).filter(([, v]) => !v).map(([k]) => k);
if (missingBucket.length === 4) warn("bucket not configured: uploads are disabled (the admin still works with the project's banners)");
else if (missingBucket.length > 0) bad(`the bucket is partially configured; missing: ${missingBucket.join(", ")}`);
else {
  const probe = `media/${"0".repeat(64)}/640.webp`;
  try {
    const addressing = env.BUCKET_ADDRESSING === "path" || env.BUCKET_ADDRESSING === "virtual" ? env.BUCKET_ADDRESSING : defaultAddressing(bucket.endpoint!);
    const store = createObjectStore({ endpoint: bucket.endpoint!, bucket: bucket.name!, accessKeyId: bucket.accessKeyId!, secretAccessKey: bucket.secretAccessKey!, region: env.BUCKET_REGION || "auto", addressing });
    await store.exists(probe); // 404 = authenticated and empty; 403 or a network error throws (nothing is written or deleted)
    ok(`the bucket answers (${addressing}-style addressing) and the credentials are accepted; nothing was written`);
  } catch (e) {
    bad(`cannot reach the bucket with these credentials: ${scrub(e)} (if the bucket is an older one, try BUCKET_ADDRESSING=path)`);
  }
  ok("images are served by the storefront's own /media route (the bucket stays private; no public bucket domain is needed)");
}

console.log("\n[4] Volume and published configuration");
const volume = env.CATALOG_SNAPSHOT_DIR ?? path.join(process.cwd(), "data", "generated");
const dir = env.SITE_CONFIG_DIR ?? path.join(volume, "site-config");
try {
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.check-${randomBytes(4).toString("hex")}.tmp`);
  await writeFile(tmp, "ok");
  await rename(tmp, `${tmp}.done`);
  await rm(`${tmp}.done`, { force: true });
  ok("the published-configuration directory is writable (write + rename)");
} catch (e) {
  bad(`the published-configuration directory is not writable: ${scrub(e)}`);
}
if (env.SITE_CONFIG_HOME === "on") warn("SITE_CONFIG_HOME=on: the storefront already reads published.json (intended only after the controlled release)");
else ok("SITE_CONFIG_HOME is off: the storefront ignores the CMS (default)");

console.log("\n[5] INK (only what the sync buttons need)");
const inkTokens = Object.keys(env).filter((k) => k.startsWith("INK_TOKEN_") && env[k]);
if (inkTokens.length > 0) ok(`${inkTokens.length} INK token variable(s) present (names: ${inkTokens.join(", ")})`);
else warn("no INK_TOKEN_* variable here: the catalog and collections sync buttons will fail");

console.log(failures === 0 ? `\nCMS READY (${warnings} warning(s))` : `\nCMS NOT READY: ${failures} requirement(s) missing`);
process.exit(failures === 0 ? 0 : 1);
