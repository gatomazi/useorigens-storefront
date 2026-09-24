// Explicit database operations for the CMS. Never run by a build, a deploy hook or a public route.
//
//   npm run db:status      which migrations are applied / pending (read-only)
//   npm run db:migrate     apply pending migrations (idempotent; safe to run twice)
//   npm run db:validate    run every migration up/down/up against an in-memory PostgreSQL (PGlite); needs no DATABASE_URL
//
// DATABASE_URL comes from the environment (`railway run npm run db:migrate` supplies it); the URL is never printed.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createPgDb } from "../src/lib/admin/db/pg-db";
import { loadMigrations, migrate, migrationStatus } from "../src/lib/admin/db/migrate";

const command = process.argv[2];
const dir = path.join(process.cwd(), "db", "migrations");

if (command === "validate") {
  const r = spawnSync(process.execPath, [path.join(process.cwd(), "db", "validate-migrations.mjs")], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

if (command !== "migrate" && command !== "status") {
  console.error("usage: db.mts <migrate|status|validate>");
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set: nothing to do.");
  process.exit(2);
}
const db = createPgDb({ connectionString: url, max: 1, ssl: process.env.DATABASE_SSL === "require", statementTimeoutMs: 60_000 });
try {
  const migrations = loadMigrations(dir);
  if (command === "status") {
    const s = await migrationStatus(db, migrations);
    console.log(`applied: ${s.applied.join(", ") || "(none)"}\npending: ${s.pending.join(", ") || "(none)"}${s.unknown.length ? `\nunknown to this build (applied by a newer version?): ${s.unknown.join(", ")}` : ""}`);
    process.exit(s.pending.length === 0 ? 0 : 1);
  }
  const done = await migrate(db, migrations, (l) => console.log(l));
  console.log(done.length === 0 ? "nothing to apply: the database is up to date" : `done: ${done.length} migration(s) applied`);
} catch (error) {
  console.error(`database error: ${error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "postgres://***") : "unknown"}`);
  process.exit(1);
} finally {
  await db.close().catch(() => undefined);
}
