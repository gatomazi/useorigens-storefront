// A real PostgreSQL engine (PGlite) speaking the wire protocol on a local port, migrated with the project's own migrations, for the
// production-mode E2E. In-memory: nothing is written to disk and nothing outside this machine is contacted.
import path from "node:path";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createPgliteDb } from "../../../src/lib/admin/db/pglite-db";
import { loadMigrations, migrate } from "../../../src/lib/admin/db/migrate";

const port = Number(process.env.E2E_DB_PORT ?? 54390);
const db = await createPgliteDb();
await migrate(db, loadMigrations(path.join(process.cwd(), "db", "migrations")));
const server = new PGLiteSocketServer({ db: db.raw, port, host: "127.0.0.1", maxConnections: 8 });
await server.start();
console.log(`[e2e-db] listening on 127.0.0.1:${port}`);
process.on("SIGTERM", async () => { await server.stop(); await db.close(); process.exit(0); });
