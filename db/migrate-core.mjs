// The migration runner, in plain JavaScript on purpose: `npm run db:migrate` must work inside the deployed service (`railway ssh`), where
// only `node` and the runtime dependencies (`pg`) exist: no tsx, no TypeScript. The application's tests import this same file (through
// src/lib/admin/db/migrate.ts), so the code that runs in production is the code that is tested (on a real PostgreSQL engine, PGlite).
//
// Versioned and idempotent. Run ONLY by `npm run db:migrate`: never from a build, a route or app start.
//   migrations/<version>.up.sql    applied in version order, each in its own transaction, under an advisory lock (two operators, or a
//                                  double click, cannot apply the same migration twice)
//   migrations/<version>.down.sql  development / CI only; never run by `migrate`
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const VERSION = /^(\d{4}_[a-z0-9_]+)\.up\.sql$/;
const LOCK_KEY = 7_412_009; // arbitrary, stable: "use origens cms migrate"
const ENSURE_TABLE = `create table if not exists schema_migration (version text primary key, applied_at timestamptz not null default now())`;

export function loadMigrations(dir) {
  return readdirSync(dir)
    .map((name) => VERSION.exec(name)?.[1])
    .filter(Boolean)
    .sort()
    .map((version) => {
      const up = readFileSync(path.join(dir, `${version}.up.sql`), "utf8");
      let down = null;
      try {
        down = readFileSync(path.join(dir, `${version}.down.sql`), "utf8");
      } catch {
        /* a migration may ship without a down script */
      }
      return { version, up, down, checksum: createHash("sha256").update(up).digest("hex") };
    });
}

/** @param db `{ query(sql, params?) -> {rows, rowCount}, tx(fn(q)) }` */
export async function migrationStatus(db, migrations) {
  const exists = await db.query(`select to_regclass('public.schema_migration') is not null as present`);
  const applied = exists.rows[0]?.present ? (await db.query(`select version from schema_migration order by version`)).rows.map((r) => r.version) : [];
  const known = new Set(migrations.map((m) => m.version));
  return { applied: applied.filter((v) => known.has(v)), pending: migrations.map((m) => m.version).filter((v) => !applied.includes(v)), unknown: applied.filter((v) => !known.has(v)) };
}

/** Applies every pending migration. Returns the versions applied by THIS call (empty = nothing to do; running it twice is harmless). */
export async function migrate(db, migrations, log = () => undefined) {
  await db.query(ENSURE_TABLE);
  const done = [];
  for (const m of migrations) {
    const applied = await db.tx(async (q) => {
      await q.query(`select pg_advisory_xact_lock(${LOCK_KEY})`);
      const seen = await q.query(`select 1 from schema_migration where version = $1`, [m.version]);
      if (seen.rowCount > 0) return false;
      await q.query(m.up);
      await q.query(`insert into schema_migration (version) values ($1) on conflict do nothing`, [m.version]);
      return true;
    });
    if (applied) {
      done.push(m.version);
      log(`applied ${m.version}`);
    }
  }
  return done;
}
