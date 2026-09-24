import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "./db";

/**
 * Versioned, idempotent migrations. Run ONLY by `npm run db:migrate` (scripts/db.mts): never from a build, a route or app start.
 *   migrations/<version>.up.sql   applied in version order, each in its own transaction, under an advisory lock (two operators, or a
 *                                 double click, cannot apply the same migration twice)
 *   migrations/<version>.down.sql development / CI only; never run by `migrate`
 */
export type Migration = { version: string; up: string; down: string | null; checksum: string };

const VERSION = /^(\d{4}_[a-z0-9_]+)\.up\.sql$/;

export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .map((name) => VERSION.exec(name)?.[1])
    .filter((v): v is string => Boolean(v))
    .sort()
    .map((version) => {
      const up = readFileSync(path.join(dir, `${version}.up.sql`), "utf8");
      let down: string | null = null;
      try {
        down = readFileSync(path.join(dir, `${version}.down.sql`), "utf8");
      } catch {
        /* a migration may ship without a down script */
      }
      return { version, up, down, checksum: createHash("sha256").update(up).digest("hex") };
    });
}

const LOCK_KEY = 7_412_009; // arbitrary, stable: "use origens cms migrate"

const ENSURE_TABLE = `create table if not exists schema_migration (version text primary key, applied_at timestamptz not null default now())`;

export type MigrationStatus = { applied: string[]; pending: string[]; unknown: string[] };

export async function migrationStatus(db: Db, migrations: Migration[]): Promise<MigrationStatus> {
  const exists = await db.query<{ present: boolean }>(`select to_regclass('public.schema_migration') is not null as present`);
  const applied = exists.rows[0]?.present ? (await db.query<{ version: string }>(`select version from schema_migration order by version`)).rows.map((r) => r.version) : [];
  const known = new Set(migrations.map((m) => m.version));
  return { applied: applied.filter((v) => known.has(v)), pending: migrations.map((m) => m.version).filter((v) => !applied.includes(v)), unknown: applied.filter((v) => !known.has(v)) };
}

/** Applies every pending migration. Returns the versions applied by THIS call (empty = nothing to do; running it twice is harmless). */
export async function migrate(db: Db, migrations: Migration[], log: (line: string) => void = () => undefined): Promise<string[]> {
  await db.query(ENSURE_TABLE);
  const done: string[] = [];
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
