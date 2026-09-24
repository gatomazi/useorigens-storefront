import { PGlite } from "@electric-sql/pglite";
import type { Db, Queryable, QueryResult } from "./db";

/** A real PostgreSQL engine (PGlite, in-memory or on a directory) behind the same `Db` port. Development, tests and the migration validator only. */
export async function createPgliteDb(dataDir?: string): Promise<Db & { raw: PGlite }> {
  const lite = new PGlite(dataDir);
  await lite.waitReady;
  const wrap = (target: { query: PGlite["query"]; exec: PGlite["exec"] }): Queryable => ({
    async query<T>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>> {
      if (params === undefined || params.length === 0) {
        // No parameters: the simple protocol, which (unlike the extended one) accepts a multi-statement script such as a migration.
        const results = await target.exec(sql);
        const last = results[results.length - 1];
        return { rows: (last?.rows ?? []) as T[], rowCount: last && last.rows.length > 0 ? last.rows.length : (last?.affectedRows ?? 0) };
      }
      const r = await target.query<T>(sql, params as unknown[]);
      // pg semantics: SELECT reports the rows returned; INSERT/UPDATE/DELETE the rows affected.
      return { rows: r.rows, rowCount: r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0) };
    },
  });
  const root = wrap(lite);
  return {
    raw: lite,
    query: root.query,
    tx: (fn) => lite.transaction(async (t) => fn(wrap(t as unknown as { query: PGlite["query"]; exec: PGlite["exec"] }))),
    close: () => lite.close(),
  };
}
