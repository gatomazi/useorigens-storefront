// Validates every migration in db/migrations against a real PostgreSQL engine (PGlite = Postgres compiled to WASM, in-memory, no server):
// up → down → up again, then the constraint/trigger/index behaviour the CMS relies on.   npm run db:validate
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const versions = ["0001_init", "0002_auth_sync"];
const read = (v, kind) => readFileSync(path.join(dir, `${v}.${kind}.sql`), "utf8");
const up = versions.map((v) => read(v, "up")).join("\n");
const down = versions.slice().reverse().map((v) => read(v, "down")).join("\n");

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
await accepts("AVIF upload (0002)", `insert into media_asset (id,sha256,kind,original_key,mime,bytes,width,height) values ('01J00000000000000000000009',$1,'upload','k','image/avif',1000,10,10)`, ["9".repeat(64)]);
await rejects("SVG upload", `insert into media_asset (id,sha256,kind,original_key,mime,bytes,width,height) values ($1,$2,'upload','k','image/svg+xml',1000,10,10)`, [ULID_B, "2".repeat(64)]);
await rejects("upload above 8 MB", `insert into media_asset (id,sha256,kind,original_key,mime,bytes,width,height) values ($1,$2,'upload','k','image/png',9000000,10,10)`, [ULID_B, "3".repeat(64)]);
await rejects("image above 6000 px", `insert into media_asset (id,sha256,kind,original_key,mime,bytes,width,height) values ($1,$2,'upload','k','image/png',1000,7000,10)`, [ULID_B, "4".repeat(64)]);
await rejects("upload without an object key", `insert into media_asset (id,sha256,kind,mime,bytes,width,height) values ($1,$2,'upload','image/png',1000,10,10)`, [ULID_B, "5".repeat(64)]);
await rejects("duplicate content (same sha256)", `insert into media_asset (id,sha256,kind,original_key,mime,bytes,width,height) values ($1,$2,'upload','k','image/png',1000,10,10)`, [ULID_B, H]);

await accepts("audit entry", `insert into audit_log (actor,action,scope,meta) values ($1,'publish','sul','{"release":2}'::jsonb)`, [ULID_A]);
await rejects("unknown audit action", `insert into audit_log (actor,action) values ('system','made-up')`);
await rejects("editing the audit log", `update audit_log set actor='someone-else'`);
await rejects("deleting from the audit log", `delete from audit_log`);

await accepts("google_sub binds an account to a user (0002)", `update admin_user set google_sub='1234567890' where email='owner@example.com'`);
await rejects("the same google account on two users", `update admin_user set google_sub='1234567890' where email='ed@example.com'`);
await accepts("a sync run starts", `insert into sync_run (kind, requested_by) values ('collections','owner')`);
await rejects("a second collections sync at the same time (partial unique index)", `insert into sync_run (kind, requested_by) values ('collections','owner')`);
await accepts("a catalog sync may run in parallel with a collections sync", `insert into sync_run (kind, requested_by) values ('catalog','owner')`);
await rejects("a finished sync without finished_at", `update sync_run set status='succeeded' where kind='catalog'`);
await accepts("a sync finishes", `update sync_run set status='succeeded', finished_at=now() where kind='collections'`);
await accepts("a new collections sync after the previous finished", `insert into sync_run (kind, requested_by) values ('collections','owner')`);
await accepts("audit for the new action", `insert into audit_log (actor,action) values ('system','collections.sync')`);
await db.close();
console.log(failures === 0 ? "\nRESULT: ALL CHECKS PASSED" : `\nRESULT: ${failures} FAILED`);
process.exit(failures === 0 ? 1 - 1 : 1);
