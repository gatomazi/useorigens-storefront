import pg from "pg";
import type { Db, Queryable, QueryResult } from "./db";

/**
 * `pg` pool for the single Railway service. Small on purpose (the admin is a handful of people): at most `max` connections, a bounded
 * wait for a free one, and server-side statement/idle timeouts so a stuck query can neither pin a connection nor hang a request.
 * Nothing here runs at import time or during `next build`: the pool is created by the first admin request that needs it.
 */
export type PgOptions = { connectionString: string; max?: number; ssl?: boolean; statementTimeoutMs?: number; connectionTimeoutMs?: number };

export function createPgDb(options: PgOptions): Db {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
    statement_timeout: options.statementTimeoutMs ?? 15_000,
    idle_in_transaction_session_timeout: 30_000,
    application_name: "useorigens-cms",
    ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
  });
  // An idle client dying (database restart) must never crash the process: the next query simply opens a new one.
  pool.on("error", () => undefined);

  const run = async <T>(target: { query: pg.Pool["query"] }, sql: string, params?: readonly unknown[]): Promise<QueryResult<T>> => {
    const result = await target.query(sql, params as unknown[] | undefined);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  };

  return {
    query: (sql, params) => run(pool, sql, params),
    async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const value = await fn({ query: (sql, params) => run(client, sql, params) });
        await client.query("commit");
        return value;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
