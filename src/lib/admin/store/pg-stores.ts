import { createHash, randomBytes } from "node:crypto";
import { bundleChecksum } from "../../site-config/checksum";
import type { PublishedBundle, Scope, ScopeDoc } from "../../site-config/schema";
import type { ReleaseRecord } from "../../site-config/publish-flow";
import { sqlState, type Db } from "../db/db";
import { ulid } from "../ids";
import type {
  AuditLog, AuditRow, DraftRecord, DraftRepository, ReleaseStore, ReleaseView, Role, SessionRepository, SyncKind, SyncRunRepository, SyncRunRow, UserRepository, UserRow,
} from "./ports";

/** PostgreSQL implementations of the CMS ports (db/migrations/0001_init + 0002_auth_sync). Every query is parameterised. */

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());

// ── Drafts ───────────────────────────────────────────────────────────────────────────────────────────────────

type DraftRow = { scope: Scope; doc: ScopeDoc; rev: number; base_release_id: string | null; updated_at: unknown };
const toDraft = (r: DraftRow): DraftRecord => ({ scope: r.scope, rev: r.rev, updatedAt: iso(r.updated_at), baseReleaseId: r.base_release_id === null ? null : String(r.base_release_id), doc: r.doc });

export function pgDraftRepository(db: Db): DraftRepository {
  const load = async (scope: Scope): Promise<DraftRecord | null> => {
    const r = await db.query<DraftRow>(`select scope, doc, rev, base_release_id, updated_at from config_draft where scope = $1`, [scope]);
    return r.rows[0] ? toDraft(r.rows[0]) : null;
  };
  return {
    load,
    async save(scope, doc, expectedRev, baseReleaseId, actorId) {
      const json = JSON.stringify(doc);
      const r =
        expectedRev === null
          ? await db.query<DraftRow>(
              `insert into config_draft (scope, doc, rev, base_release_id, updated_by) values ($1, $2::jsonb, 1, $3, $4)
               on conflict (scope) do nothing returning scope, doc, rev, base_release_id, updated_at`,
              [scope, json, baseReleaseId, actorId],
            )
          : await db.query<DraftRow>(
              // Optimistic lock: matches only while the row still has the revision the form was rendered with.
              `update config_draft set doc = $2::jsonb, rev = rev + 1, base_release_id = $3, updated_by = $4, updated_at = now()
               where scope = $1 and rev = $5 returning scope, doc, rev, base_release_id, updated_at`,
              [scope, json, baseReleaseId, actorId, expectedRev],
            );
      return r.rows[0] ? { ok: true, record: toDraft(r.rows[0]) } : { ok: false, conflict: await load(scope) };
    },
    async discard(scope) {
      await db.query(`delete from config_draft where scope = $1`, [scope]);
    },
  };
}

// ── Releases ─────────────────────────────────────────────────────────────────────────────────────────────────

type ReleaseRow = {
  id: string; kind: string; status: "pending" | "live" | "failed"; checksum: string; note: string | null; scopes_changed: string[]; promoted_at: unknown; failed_reason: string | null;
  created_by: string | null; created_ms: number; sections: number | null;
};
const RELEASE_COLUMNS = `id::text as id, kind, status, checksum, note, scopes_changed, promoted_at, failed_reason, created_by, (extract(epoch from created_at) * 1000)::float8 as created_ms,
  (select count(*)::int from jsonb_array_elements(coalesce(bundle #> '{docs,sul,home,sections}', '[]'::jsonb)) s where (s->>'active') = 'true') as sections`;
const toView = (r: ReleaseRow): ReleaseView => ({
  id: r.id, checksum: r.checksum, status: r.status, createdAt: Number(r.created_ms), kind: r.kind as ReleaseView["kind"], note: r.note, scopesChanged: r.scopes_changed ?? [],
  promotedAt: r.promoted_at ? iso(r.promoted_at) : null, failedReason: r.failed_reason, sections: r.sections ?? 0, createdBy: r.created_by,
});
const toRecord = (r: ReleaseRow): ReleaseRecord => ({ id: r.id, checksum: r.checksum, status: r.status, createdAt: Number(r.created_ms) });

export function pgReleaseStore(db: Db): ReleaseStore {
  return {
    async begin(request, compose) {
      const id = String((await db.query<{ id: string }>(`select nextval('release_id_seq')::text as id`)).rows[0].id);
      const bundle = await compose(id);
      const checksum = bundleChecksum(bundle);
      try {
        await db.tx(async (q) => {
          const head = await q.query<{ release_id: string }>(`select release_id::text as release_id from release_head for update`);
          await q.query(
            `insert into release (id, parent_id, kind, status, bundle, checksum, scopes_changed, note, created_by)
             values ($1::bigint, $2::bigint, $3, 'pending', $4::jsonb, $5, $6::text[], $7, $8)`,
            [id, head.rows[0]?.release_id ?? null, request.kind, JSON.stringify(bundle), checksum, request.scopesChanged, request.note, request.actorId],
          );
        });
      } catch (error) {
        // release_one_pending: the database, not process memory, guarantees a single publish in flight.
        if (sqlState(error) === "23505") throw new Error("a publish is already in flight");
        throw error;
      }
      return { release: { id, checksum, status: "pending", createdAt: Date.now() }, bundle };
    },

    async markLive(id) {
      await db.tx(async (q) => {
        const moved = await q.query<{ checksum: string }>(`update release set status = 'live', promoted_at = now() where id = $1::bigint and status = 'pending' returning checksum`, [id]);
        const checksum = moved.rows[0]?.checksum ?? (await q.query<{ checksum: string }>(`select checksum from release where id = $1::bigint and status = 'live'`, [id])).rows[0]?.checksum;
        if (!checksum) throw new Error(`release ${id} is not pending`);
        await q.query(
          `insert into release_head (release_id, file_checksum, revalidated) values ($1::bigint, $2, false)
           on conflict (singleton) do update set release_id = excluded.release_id, file_checksum = excluded.file_checksum, revalidated = false, updated_at = now()`,
          [id, checksum],
        );
      });
    },

    async markFailed(id, reason) {
      await db.query(`update release set status = 'failed', failed_reason = $2 where id = $1::bigint and status = 'pending'`, [id, reason.slice(0, 300)]);
    },

    async markRevalidated(id) {
      await db.query(`update release_head set revalidated = true, updated_at = now() where release_id = $1::bigint`, [id]);
    },

    async restorable(id) {
      if (!/^\d{1,18}$/.test(id)) return null;
      const r = await db.query<{ bundle: PublishedBundle }>(`select bundle from release where id = $1::bigint and status = 'live'`, [id]);
      return r.rows[0]?.bundle ?? null;
    },

    async head() {
      const r = await db.query<ReleaseRow & { bundle: PublishedBundle }>(`select ${RELEASE_COLUMNS}, bundle from release where id = (select release_id from release_head)`);
      return r.rows[0] ? { record: toRecord(r.rows[0]), bundle: r.rows[0].bundle } : null;
    },

    async list(limit) {
      const r = await db.query<ReleaseRow>(`select ${RELEASE_COLUMNS} from release order by id desc limit $1`, [Math.max(1, Math.min(200, limit))]);
      return r.rows.map(toView);
    },

    async reconcileState() {
      const head = await db.query<ReleaseRow & { revalidated: boolean }>(
        `select ${RELEASE_COLUMNS}, (select revalidated from release_head) as revalidated from release where id = (select release_id from release_head)`,
      );
      const pending = await db.query<ReleaseRow>(`select ${RELEASE_COLUMNS} from release where status = 'pending' order by id`);
      return { head: head.rows[0] ? toRecord(head.rows[0]) : null, pending: pending.rows.map(toRecord), headRevalidated: head.rows[0]?.revalidated ?? true };
    },
  };
}

// ── People ───────────────────────────────────────────────────────────────────────────────────────────────────

type UserDbRow = { id: string; email: string; name: string | null; role: Role; scopes: Scope[]; active: boolean; provider_sub: string | null; created_at: unknown; last_login_at: unknown };
const USER_COLUMNS = `id, email, name, role, scopes, active, provider_sub, created_at, last_login_at`;
const toUser = (r: UserDbRow): UserRow => ({
  id: r.id, email: r.email, name: r.name, role: r.role, scopes: r.scopes ?? [], active: r.active, providerSub: r.provider_sub, createdAt: iso(r.created_at), lastLoginAt: r.last_login_at ? iso(r.last_login_at) : null,
});

export function pgUserRepository(db: Db): UserRepository {
  const one = async (sql: string, params: unknown[]): Promise<UserRow | null> => {
    const r = await db.query<UserDbRow>(sql, params);
    return r.rows[0] ? toUser(r.rows[0]) : null;
  };
  return {
    findByEmail: (email) => one(`select ${USER_COLUMNS} from admin_user where email = $1`, [email.trim().toLowerCase()]),
    findById: (id) => one(`select ${USER_COLUMNS} from admin_user where id = $1`, [id]),
    findByProviderSub: (sub) => one(`select ${USER_COLUMNS} from admin_user where provider_sub = $1`, [sub]),
    async list() {
      return (await db.query<UserDbRow>(`select ${USER_COLUMNS} from admin_user order by role, email`)).rows.map(toUser);
    },
    async create(input) {
      const created = await one(
        `insert into admin_user (id, email, name, role, scopes) values ($1, $2, $3, $4, $5::text[]) returning ${USER_COLUMNS}`,
        [ulid(), input.email.trim().toLowerCase(), input.name, input.role, input.role === "owner" ? [] : input.scopes],
      );
      if (!created) throw new Error("user was not created");
      return created;
    },
    async update(id, patch) {
      const current = await one(`select ${USER_COLUMNS} from admin_user where id = $1`, [id]);
      if (!current) return null;
      const role = patch.role ?? current.role;
      const scopes = role === "owner" ? [] : (patch.scopes ?? current.scopes);
      return one(`update admin_user set role = $2, scopes = $3::text[], active = $4, name = $5 where id = $1 returning ${USER_COLUMNS}`, [
        id, role, scopes, patch.active ?? current.active, patch.name === undefined ? current.name : patch.name,
      ]);
    },
    async bindProviderSub(id, sub) {
      const r = await db.query(`update admin_user set provider_sub = $2 where id = $1 and (provider_sub is null or provider_sub = $2)`, [id, sub]);
      return r.rowCount > 0;
    },
    async touchLogin(id) {
      await db.query(`update admin_user set last_login_at = now() where id = $1`, [id]);
    },
  };
}

// ── Sessions ─────────────────────────────────────────────────────────────────────────────────────────────────

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export function pgSessionRepository(db: Db): SessionRepository {
  return {
    async create(userId, ttlMs) {
      const token = randomBytes(32).toString("base64url");
      await db.query(`insert into admin_session (token_hash, user_id, expires_at) values ($1, $2, now() + ($3::bigint * interval '1 millisecond'))`, [hashToken(token), userId, ttlMs]);
      return token;
    },
    async lookup(token, idleMs) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const r = await db.query<UserDbRow & { s_created: unknown; s_seen: unknown; s_expires: unknown }>(
        `select u.id, u.email, u.name, u.role, u.scopes, u.active, u.provider_sub, u.created_at, u.last_login_at, s.created_at as s_created, s.last_seen_at as s_seen, s.expires_at as s_expires
         from admin_session s join admin_user u on u.id = s.user_id
         where s.token_hash = $1 and s.expires_at > now() and s.last_seen_at > now() - ($2::bigint * interval '1 millisecond') and u.active`,
        [hashToken(token), idleMs],
      );
      const row = r.rows[0];
      if (!row) return null;
      // Sliding "last seen", written at most once a minute so a busy page does not turn every request into a write.
      if (Date.now() - ms(row.s_seen) > 60_000) await db.query(`update admin_session set last_seen_at = now() where token_hash = $1`, [hashToken(token)]);
      return { user: toUser(row), createdAt: ms(row.s_created), lastSeenAt: ms(row.s_seen), expiresAt: ms(row.s_expires) };
    },
    async destroy(token) {
      await db.query(`delete from admin_session where token_hash = $1`, [hashToken(token)]);
    },
    async destroyAllFor(userId) {
      await db.query(`delete from admin_session where user_id = $1`, [userId]);
    },
    async purgeExpired() {
      return (await db.query(`delete from admin_session where expires_at < now()`)).rowCount;
    },
  };
}

// ── Audit ────────────────────────────────────────────────────────────────────────────────────────────────────

export function pgAuditLog(db: Db): AuditLog {
  return {
    async record(entry) {
      await db.query(`insert into audit_log (actor, action, scope, target, meta) values ($1, $2, $3, $4, $5::jsonb)`, [entry.actor, entry.action, entry.scope ?? null, entry.target ?? null, entry.meta ? JSON.stringify(entry.meta) : null]);
    },
    async recent(limit) {
      const r = await db.query<{ id: string; at: unknown; actor: string; action: AuditRow["action"]; scope: string | null; target: string | null; meta: Record<string, unknown> | null }>(
        `select id::text as id, at, actor, action, scope, target, meta from audit_log order by id desc limit $1`, [Math.max(1, Math.min(200, limit))],
      );
      return r.rows.map((x) => ({ id: x.id, at: iso(x.at), actor: x.actor, action: x.action, scope: x.scope, target: x.target, meta: x.meta }));
    },
  };
}

// ── Sync runs ────────────────────────────────────────────────────────────────────────────────────────────────

type SyncDbRow = { id: string; kind: SyncKind; status: SyncRunRow["status"]; started_at: unknown; finished_at: unknown; requested_by: string; summary: Record<string, unknown> | null; error: string | null };
const SYNC_COLUMNS = `id::text as id, kind, status, started_at, finished_at, requested_by, summary, error`;
const toSync = (r: SyncDbRow): SyncRunRow => ({ id: r.id, kind: r.kind, status: r.status, startedAt: iso(r.started_at), finishedAt: r.finished_at ? iso(r.finished_at) : null, requestedBy: r.requested_by, summary: r.summary, error: r.error });

export function pgSyncRunRepository(db: Db): SyncRunRepository {
  return {
    async start(kind, requestedBy) {
      try {
        const r = await db.query<SyncDbRow>(`insert into sync_run (kind, requested_by) values ($1, $2) returning ${SYNC_COLUMNS}`, [kind, requestedBy]);
        return r.rows[0] ? toSync(r.rows[0]) : null;
      } catch (error) {
        if (sqlState(error) === "23505") return null; // sync_run_one_running
        throw error;
      }
    },
    async finish(id, result) {
      await db.query(
        `update sync_run set status = $2, finished_at = now(), summary = $3::jsonb, error = $4 where id = $1::bigint and status = 'running'`,
        [id, result.ok ? "succeeded" : "failed", result.ok ? JSON.stringify(result.summary) : null, result.ok ? null : result.error.slice(0, 400)],
      );
    },
    async last(kind) {
      const r = await db.query<SyncDbRow>(`select ${SYNC_COLUMNS} from sync_run where kind = $1 order by id desc limit 1`, [kind]);
      return r.rows[0] ? toSync(r.rows[0]) : null;
    },
    async failStale(kind, maxAgeMs) {
      const r = await db.query(
        `update sync_run set status = 'failed', finished_at = now(), error = 'abandoned (the process that started it is gone)'
         where kind = $1 and status = 'running' and started_at < now() - ($2::bigint * interval '1 millisecond')`,
        [kind, maxAgeMs],
      );
      return r.rowCount;
    },
  };
}
