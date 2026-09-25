// The runner itself lives in db/migrate-core.mjs (plain JavaScript, so `npm run db:migrate` works inside the deployed service without tsx).
// This module only re-exports it for the application's tests and scripts.
export { loadMigrations, migrate, migrationStatus } from "../../../../db/migrate-core.mjs";
export type { Migration, MigrationStatus } from "../../../../db/migrate-core.mjs";
