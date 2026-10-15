import type { Db } from "../../admin/db/db";
import { PURGE_GRACE_MS, type CodeRecord, type OAuthClient, type OAuthStore, type TokenKind, type TokenRecord } from "./store";

/** PostgreSQL implementation of the MCP OAuth store (db/migrations/0006_mcp_oauth). Every query is parameterised. */

const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());
const at = (epochMs: number): string => new Date(epochMs).toISOString();

type ClientRow = { client_id: string; client_name: string | null; redirect_uris: unknown; created_at: unknown };
const toClient = (r: ClientRow): OAuthClient => ({
  clientId: r.client_id,
  clientName: r.client_name,
  redirectUris: Array.isArray(r.redirect_uris) ? r.redirect_uris.filter((u): u is string => typeof u === "string") : [],
  createdAt: new Date(ms(r.created_at)).toISOString(),
});

type CodeRow = { client_id: string; redirect_uri: string; code_challenge: string; scope: string[]; resource: string; subject: string; family_id: string; expires_at: unknown; used_at: unknown };
const toCode = (r: CodeRow): CodeRecord => ({
  clientId: r.client_id,
  redirectUri: r.redirect_uri,
  codeChallenge: r.code_challenge,
  scope: r.scope,
  resource: r.resource,
  subject: r.subject,
  familyId: r.family_id,
  expiresAt: ms(r.expires_at),
  usedAt: r.used_at === null ? null : ms(r.used_at),
});

type TokenRow = { kind: TokenKind; family_id: string; client_id: string; subject: string; scope: string[]; resource: string; expires_at: unknown; revoked_at: unknown };
const toToken = (r: TokenRow): TokenRecord => ({
  kind: r.kind,
  familyId: r.family_id,
  clientId: r.client_id,
  subject: r.subject,
  scope: r.scope,
  resource: r.resource,
  expiresAt: ms(r.expires_at),
  revokedAt: r.revoked_at === null ? null : ms(r.revoked_at),
});

const CODE_COLUMNS = "client_id, redirect_uri, code_challenge, scope, resource, subject, family_id, expires_at, used_at";
const TOKEN_COLUMNS = "kind, family_id, client_id, subject, scope, resource, expires_at, revoked_at";

export function pgOAuthStore(db: Db): OAuthStore {
  return {
    async createClient(input) {
      const r = await db.query<ClientRow>(
        `insert into mcp_oauth_client (client_id, client_name, redirect_uris) values ($1, $2, $3::jsonb) returning client_id, client_name, redirect_uris, created_at`,
        [input.clientId, input.clientName, JSON.stringify(input.redirectUris)],
      );
      return toClient(r.rows[0]);
    },
    async findClient(clientId) {
      const r = await db.query<ClientRow>(`select client_id, client_name, redirect_uris, created_at from mcp_oauth_client where client_id = $1`, [clientId]);
      return r.rows[0] ? toClient(r.rows[0]) : null;
    },
    async touchClient(clientId, now) {
      // At most once a minute per client: a refresh every few minutes must not turn into a write each time.
      await db.query(`update mcp_oauth_client set last_used_at = $2 where client_id = $1 and (last_used_at is null or last_used_at < $2::timestamptz - interval '1 minute')`, [clientId, at(now)]);
    },
    async saveCode(codeHash, record) {
      await db.query(
        `insert into mcp_oauth_code (code_hash, client_id, redirect_uri, code_challenge, scope, resource, subject, family_id, expires_at) values ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9)`,
        [codeHash, record.clientId, record.redirectUri, record.codeChallenge, record.scope, record.resource, record.subject, record.familyId, at(record.expiresAt)],
      );
    },
    async consumeCode(codeHash, now) {
      // The conditional update is the lock: of two concurrent exchanges only one row update succeeds.
      const fresh = await db.query<CodeRow>(`update mcp_oauth_code set used_at = $2 where code_hash = $1 and used_at is null returning ${CODE_COLUMNS}`, [codeHash, at(now)]);
      if (fresh.rows[0]) return { status: "fresh", record: toCode(fresh.rows[0]) };
      const seen = await db.query<CodeRow>(`select ${CODE_COLUMNS} from mcp_oauth_code where code_hash = $1`, [codeHash]);
      return seen.rows[0] ? { status: "reused", record: toCode(seen.rows[0]) } : null;
    },
    async saveToken(tokenHash, record) {
      await db.query(
        `insert into mcp_oauth_token (token_hash, kind, family_id, client_id, subject, scope, resource, expires_at) values ($1, $2, $3, $4, $5, $6::text[], $7, $8)`,
        [tokenHash, record.kind, record.familyId, record.clientId, record.subject, record.scope, record.resource, at(record.expiresAt)],
      );
    },
    async findToken(tokenHash) {
      const r = await db.query<TokenRow>(`select ${TOKEN_COLUMNS} from mcp_oauth_token where token_hash = $1`, [tokenHash]);
      return r.rows[0] ? toToken(r.rows[0]) : null;
    },
    async rotateRefresh(tokenHash, now) {
      const active = await db.query<TokenRow>(`update mcp_oauth_token set revoked_at = $2 where token_hash = $1 and kind = 'refresh' and revoked_at is null returning ${TOKEN_COLUMNS}`, [tokenHash, at(now)]);
      if (active.rows[0]) return { status: "active", record: toToken(active.rows[0]) };
      const seen = await db.query<TokenRow>(`select ${TOKEN_COLUMNS} from mcp_oauth_token where token_hash = $1 and kind = 'refresh'`, [tokenHash]);
      return seen.rows[0] ? { status: "revoked", record: toToken(seen.rows[0]) } : null;
    },
    async revokeFamily(familyId, now) {
      return (await db.query(`update mcp_oauth_token set revoked_at = $2 where family_id = $1 and revoked_at is null`, [familyId, at(now)])).rowCount;
    },
    async purgeExpired(now) {
      const cutoff = at(now - PURGE_GRACE_MS);
      const codes = await db.query(`delete from mcp_oauth_code where expires_at < $1`, [cutoff]);
      const tokens = await db.query(`delete from mcp_oauth_token where expires_at < $1`, [cutoff]);
      return codes.rowCount + tokens.rowCount;
    },
  };
}
