/**
 * The narrow database port the CMS repositories are written against. Production uses `pg` (pg-db.ts); tests and the migration
 * validator use PGlite (a real PostgreSQL engine in WASM) through the same interface, so the repository SQL is exercised against
 * genuine Postgres semantics (constraints, triggers, partial unique indexes, jsonb) without a server.
 * Deliberately NOT `server-only`: the migration script imports it too.
 */
export type QueryResult<T> = { rows: T[]; rowCount: number };

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
}

export interface Db extends Queryable {
  /** Runs `fn` in one transaction: COMMIT when it resolves, ROLLBACK when it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** SQLSTATE of a database error, when there is one (23505 = unique violation, 23514 = check violation, P0001 = raise exception). */
export function sqlState(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}
