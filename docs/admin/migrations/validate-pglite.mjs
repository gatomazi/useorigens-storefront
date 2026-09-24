// Validates 0001_init.{up,down}.sql against a real PostgreSQL engine (PGlite = Postgres compiled to WASM, in-memory, no server,
// nothing installed in the project). Run it without touching package.json:
//   npm i --prefix /tmp/pg @electric-sql/pglite
//   PGLITE_PATH=/tmp/pg/node_modules/@electric-sql/pglite/dist/index.js node docs/admin/migrations/validate-pglite.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { PGlite } = await import(process.env.PGLITE_PATH ? pathToFileURL(process.env.PGLITE_PATH).href : "@electric-sql/pglite");
const dir = path.dirname(fileURLToPath(import.meta.url));
const up = readFileSync(path.join(dir, "0001_init.up.sql"), "utf8");
const down = readFileSync(path.join(dir, "0001_init.down.sql"), "utf8");

let failures = 0;
const ok = (name) => console.log(`PASS  ${name}`);
const bad = (name, why) => { failures++; console.log(`FAIL  ${name} — ${why}`); };

const db = new PGlite();
await db.exec(up);
ok("up migration applies");
await db.exec(down);
ok("down migration applies");
await db.exec(up);
ok("up migration re-applies after down (repeatable)");

/** The statement must be REJECTED by the database. */
async function rejects(name, sql, params = []) {
  try { await db.query(sql, params); bad(name, "was accepted"); } catch (e) { ok(`${name}\n        ↳ rejected by: ${String(e.message).replace(/\s+/g, " ").slice(0, 110)}`); }
}
async function accepts(name, sql, params = []) {
  try { const r = await db.query(sql, params); ok(name); return r; } catch (e) { bad(name, e.message); }
}

const ULID_A = "01J00000000000000000000001";
const ULID_B = "01J00000000000000000000002";
const H = "a".repeat(64);
const bundle = JSON.stringify({ schemaVersion: 1 });

await accepts("owner with no scopes", `insert into admin_user (id,email,role) values ($1,'owner@example.com','owner')`, [ULID_A]);
await accepts("editor scoped to sul", `insert into admin_user (id,email,role,scopes) values ($1,'ed@example.com','editor','{sul}')`, [ULID_B]);
await rejects("editor without any scope", `insert into admin_user (id,email,role) values ('01J00000000000000000000003','x@example.com','editor')`);
await rejects("editor scoped to 'global' (owner-only, D7)", `insert into admin_user (id,email,role,scopes) values ('01J00000000000000000000004','y@example.com','editor','{global}')`);
await rejects("unknown scope value", `insert into admin_user (id,email,role,scopes) values ('01J00000000000000000000005','z@example.com','editor','{mars}')`);
await rejects("upper-case e-mail (allowlist comparisons stay exact)", `insert into admin_user (id,email,role) values ('01J00000000000000000000006','Mixed@Example.com','owner')`);
await rejects("duplicate e-mail", `insert into admin_user (id,email,role) values ('01J00000000000000000000007','owner@example.com','owner')`);
await rejects("session token stored in clear (not a sha256)", `insert into admin_session (token_hash,user_id,expires_at) values ('plain-token',$1, now() + interval '1 hour')`, [ULID_A]);
await accepts("session with hashed token", `insert into admin_session (token_hash,user_id,expires_at) values ($1,$2, now() + interval '1 hour')`, [H, ULID_A]);

await accepts("seed release goes live", `insert into release (kind,status,bundle,checksum,promoted_at) values ('seed','live',$1::jsonb,$2,now())`, [bundle, H]);
await accepts("head points to the live seed release", `insert into release_head (release_id) select id from release where kind='seed'`);
await accepts("a publish becomes pending", `insert into release (parent_id,kind,bundle,checksum,scopes_changed) select id,'publish',$1::jsonb,$2,'{sul}' from release where kind='seed'`, [bundle, "b".repeat(64)]);
await rejects("a second publish in flight (partial unique index)", `insert into release (kind,bundle,checksum) values ('publish',$1::jsonb,$2)`, [bundle, "c".repeat(64)]);
await rejects("head pointing to a pending release", `update release_head set release_id = (select id from release where status='pending')`);
await rejects("editing a release's bundle", `update release set bundle = '{"x":1}'::jsonb where status='pending'`);
await rejects("editing a release's checksum", `update release set checksum = repeat('d',64) where status='pending'`);
await rejects("promotion without promoted_at", `update release set status='live' where status='pending'`);
await accepts("promotion of the pending release", `update release set status='live', promoted_at=now() where status='pending'`);
await accepts("head moves to the promoted release", `update release_head set release_id=(select max(id) from release), revalidated=false, updated_at=now()`);
await rejects("changing the status of a live release", `update release set status='failed', failed_reason='x' where kind='publish'`);
await rejects("deleting a release", `delete from release where kind='publish'`);
await accepts("a new pending publish is possible after promotion", `insert into release (parent_id,kind,bundle,checksum) select max(id),'publish',$1::jsonb,$2 from release`, [bundle, "e".repeat(64)]);
await accepts("abandoned pending release is failed with a reason", `update release set status='failed', failed_reason='abandoned' where status='pending'`);
await rejects("failed release without a reason", `insert into release (kind,status,bundle,checksum) values ('publish','failed',$1::jsonb,$2)`, [bundle, "f".repeat(64)]);

await accepts("draft for sul", `insert into config_draft (scope,doc) values ('sul','{}'::jsonb)`);
await rejects("draft for an unknown scope", `insert into config_draft (scope,doc) values ('lua','{}'::jsonb)`);
const fresh = await db.query(`update config_draft set doc='{"a":1}'::jsonb, rev=rev+1 where scope='sul' and rev=1 returning rev`);
fresh.rows.length === 1 && fresh.rows[0].rev === 2 ? ok("optimistic lock: save with the current rev succeeds") : bad("optimistic lock", "no row updated");
const stale = await db.query(`update config_draft set doc='{"a":2}'::jsonb, rev=rev+1 where scope='sul' and rev=1 returning rev`);
stale.rows.length === 0 ? ok("optimistic lock: save with a stale rev updates 0 rows (the app answers 409)") : bad("optimistic lock", "stale write applied");

await accepts("legacy media asset", `insert into media_asset (id,sha256,kind,public_path,mime,bytes,width,height,status) values ($1,$2,'legacy-public','/banners/sul/hero-mobile.png','image/png',1000,1122,1402,'ready')`, [ULID_A, H]);
await rejects("media path traversal", `insert into media_asset (id,sha256,kind,public_path,mime,bytes,width,height) values ($1,$2,'legacy-public','/banners/../etc/passwd','image/png',1000,10,10)`, [ULID_B, "1".repeat(64)]);
await rejects("SVG upload", `insert into media_asset (id,sha256,kind,original_key,mime,bytes,width,height) values ($1,$2,'upload','k','image/svg+xml',1000,10,10)`, [ULID_B, "2".repeat(64)]);
await rejects("upload above 8 MB", `insert into media_asset (id,sha256,kind,original_key,mime,bytes,width,height) values ($1,$2,'upload','k','image/png',9000000,10,10)`, [ULID_B, "3".repeat(64)]);
await rejects("image above 6000 px", `insert into media_asset (id,sha256,kind,original_key,mime,bytes,width,height) values ($1,$2,'upload','k','image/png',1000,7000,10)`, [ULID_B, "4".repeat(64)]);
await rejects("upload without an object key", `insert into media_asset (id,sha256,kind,mime,bytes,width,height) values ($1,$2,'upload','image/png',1000,10,10)`, [ULID_B, "5".repeat(64)]);
await rejects("duplicate content (same sha256)", `insert into media_asset (id,sha256,kind,original_key,mime,bytes,width,height) values ($1,$2,'upload','k','image/png',1000,10,10)`, [ULID_B, H]);

await accepts("audit entry", `insert into audit_log (actor,action,scope,meta) values ($1,'publish','sul','{"release":2}'::jsonb)`, [ULID_A]);
await rejects("unknown audit action", `insert into audit_log (actor,action) values ('system','made-up')`);
await rejects("editing the audit log", `update audit_log set actor='someone-else'`);
await rejects("deleting from the audit log", `delete from audit_log`);

await db.close();
console.log(failures === 0 ? "\nRESULT: ALL CHECKS PASSED" : `\nRESULT: ${failures} FAILED`);
process.exit(failures === 0 ? 1 - 1 : 1);
