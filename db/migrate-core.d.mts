export type Migration = { version: string; up: string; down: string | null; checksum: string };
export type MigrationStatus = { applied: string[]; pending: string[]; unknown: string[] };
type Row = Record<string, unknown>;
export type DbLike = {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
  tx<T>(fn: (q: { query(sql: string, params?: readonly unknown[]): Promise<{ rows: Row[]; rowCount: number }> }) => Promise<T>): Promise<T>;
};
export function loadMigrations(dir: string): Migration[];
export function migrationStatus(db: DbLike, migrations: Migration[]): Promise<MigrationStatus>;
export function migrate(db: DbLike, migrations: Migration[], log?: (line: string) => void): Promise<string[]>;
