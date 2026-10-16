import type { Db } from "../admin/db/db";
import { refusalOf, type ChangeRecord, type ChangeStore } from "./change-store";

/** PostgreSQL implementation of the confirmed-changes store (db/migrations/0007_mcp_changes). Every query is parameterised. */

const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());
const at = (epochMs: number): string => new Date(epochMs).toISOString();

type Row = { code_hash: string; subject: string; client_id: string; kind: ChangeRecord["kind"]; store: ChangeRecord["store"]; plan: ChangeRecord["plan"]; status: ChangeRecord["status"]; result: ChangeRecord["result"]; created_at: unknown; expires_at: unknown; applied_at: unknown };
const toRecord = (r: Row): ChangeRecord => ({
  codeHash: r.code_hash,
  subject: r.subject,
  clientId: r.client_id,
  kind: r.kind,
  store: r.store,
  plan: r.plan,
  status: r.status,
  result: r.result,
  createdAt: ms(r.created_at),
  expiresAt: ms(r.expires_at),
  appliedAt: r.applied_at === null ? null : ms(r.applied_at),
});
const COLUMNS = "code_hash, subject, client_id, kind, store, plan, status, result, created_at, expires_at, applied_at";

export function pgChangeStore(db: Db): ChangeStore {
  const find = async (codeHash: string) => {
    const r = await db.query<Row>(`select ${COLUMNS} from mcp_change where code_hash = $1`, [codeHash]);
    return r.rows[0] ? toRecord(r.rows[0]) : null;
  };
  return {
    async create(record) {
      await db.query(`insert into mcp_change (code_hash, subject, client_id, kind, store, plan, created_at, expires_at) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`, [
        record.codeHash,
        record.subject,
        record.clientId,
        record.kind,
        record.store,
        JSON.stringify(record.plan),
        at(record.createdAt),
        at(record.expiresAt),
      ]);
    },
    // One statement decides: only a pending, unexpired change of this account moves to `applying`, so two confirmations get one winner.
    async claim(codeHash, subject, now) {
      const r = await db.query<Row>(`update mcp_change set status = 'applying' where code_hash = $1 and subject = $2 and status = 'pending' and expires_at > $3 returning ${COLUMNS}`, [codeHash, subject, at(now)]);
      if (r.rows[0]) return { ok: true, record: toRecord(r.rows[0]) };
      const record = await find(codeHash);
      return { ok: false, reason: refusalOf(record, subject, now), record };
    },
    async finish(codeHash, status, result, now) {
      await db.query(`update mcp_change set status = $2, result = $3::jsonb, applied_at = $4 where code_hash = $1 and status = 'applying'`, [codeHash, status, JSON.stringify(result), at(now)]);
    },
    find,
    async purgeExpired(before) {
      return (await db.query(`delete from mcp_change where status = 'pending' and expires_at < $1`, [at(before)])).rowCount;
    },
  };
}
