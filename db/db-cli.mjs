// Explicit database operations for the CMS. Never run by a build, a deploy hook or a public route.
//
//   npm run db:status      which migrations are applied / pending (read-only)
//   npm run db:migrate     apply pending migrations (idempotent; safe to run twice)
//   npm run db:validate    run every migration up/down/up against an in-memory PostgreSQL (PGlite); needs no DATABASE_URL
//
// Plain Node + `pg` only, so it runs inside the deployed service:  railway ssh --service useorigens-storefront -- npm run db:migrate
// DATABASE_URL comes from the environment; the URL is never printed.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadMigrations, migrate, migrationStatus } from "./migrate-core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const command = process.argv[2];

if (command === "validate") {
  const r = spawnSync(process.execPath, [path.join(here, "validate-migrations.mjs")], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
if (command !== "migrate" && command !== "status") {
  console.error("usage: db-cli.mjs <migrate|status|validate>");
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set: nothing to do.");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined, connectionTimeoutMillis: 10_000, statement_timeout: 60_000, application_name: "useorigens-cms-migrate" });
const run = async (sql, params) => {
  const r = await client.query(sql, params);
  return { rows: r.rows, rowCount: r.rowCount ?? 0 };
};
const db = {
  query: run,
  async tx(fn) {
    await client.query("begin");
    try {
      const value = await fn({ query: run });
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  },
};
const scrub = (e) => (e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/\S+/g, "postgres://***");
try {
  await client.connect();
  const migrations = loadMigrations(path.join(here, "migrations"));
  if (command === "status") {
    const s = await migrationStatus(db, migrations);
    console.log(`applied: ${s.applied.join(", ") || "(none)"}\npending: ${s.pending.join(", ") || "(none)"}${s.unknown.length ? `\nunknown to this build (applied by a newer version?): ${s.unknown.join(", ")}` : ""}`);
    process.exitCode = s.pending.length === 0 ? 0 : 1;
  } else {
    const done = await migrate(db, migrations, (l) => console.log(l));
    console.log(done.length === 0 ? "nothing to apply: the database is up to date" : `done: ${done.length} migration(s) applied`);
  }
} catch (error) {
  console.error(`database error: ${scrub(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
