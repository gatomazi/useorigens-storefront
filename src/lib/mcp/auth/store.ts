import { createHash } from "node:crypto";

/**
 * Storage port of the MCP authorization server (docs/mcp/README.md). Codes and tokens are addressed by sha256 of their value only: a
 * dump of the store never contains anything that authenticates. Time is always passed in by the caller (epoch ms), so expiry rules are
 * decided in one place (oauth.ts) and tested with a fixed clock.
 *
 * Two implementations: PostgreSQL in production (`pg-store.ts`, db/migrations/0006_mcp_oauth) and the in-memory one below for the
 * loopback development server (where the admin has no database) and the unit tests.
 */
export type OAuthClient = { clientId: string; clientName: string | null; redirectUris: string[]; createdAt: string };

export type CodeRecord = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string[];
  resource: string;
  subject: string;
  /** The token family every token issued from this code belongs to (code reuse revokes it whole). */
  familyId: string;
  expiresAt: number;
  usedAt: number | null;
};

export type TokenKind = "access" | "refresh";
export type TokenRecord = {
  kind: TokenKind;
  familyId: string;
  clientId: string;
  subject: string;
  scope: string[];
  resource: string;
  expiresAt: number;
  revokedAt: number | null;
};

export type ConsumeResult = { status: "fresh"; record: CodeRecord } | { status: "reused"; record: CodeRecord } | null;
export type RotateResult = { status: "active"; record: TokenRecord } | { status: "revoked"; record: TokenRecord } | null;

export interface OAuthStore {
  createClient(input: { clientId: string; clientName: string | null; redirectUris: string[] }): Promise<OAuthClient>;
  findClient(clientId: string): Promise<OAuthClient | null>;
  touchClient(clientId: string, now: number): Promise<void>;
  saveCode(codeHash: string, record: Omit<CodeRecord, "usedAt">): Promise<void>;
  /** Marks the code used, atomically: of two concurrent exchanges exactly one sees `fresh`. A known code used before is `reused`. */
  consumeCode(codeHash: string, now: number): Promise<ConsumeResult>;
  saveToken(tokenHash: string, record: Omit<TokenRecord, "revokedAt">): Promise<void>;
  findToken(tokenHash: string): Promise<TokenRecord | null>;
  /** Revokes a refresh token so it can be exchanged exactly once: `active` = this call revoked it; `revoked` = it already was (reuse). */
  rotateRefresh(tokenHash: string, now: number): Promise<RotateResult>;
  /** Revokes every token of one authorization. Returns how many were still active. */
  revokeFamily(familyId: string, now: number): Promise<number>;
  /** Removes codes and tokens expired before `now` minus a grace period (revoked refresh tokens are kept until expiry for reuse detection). */
  purgeExpired(now: number): Promise<number>;
}

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/** In-memory store: the development server (kept on globalThis so hot reload keeps connections) and the unit tests. */
export function memoryOAuthStore(): OAuthStore {
  const clients = new Map<string, OAuthClient>();
  const codes = new Map<string, CodeRecord>();
  const tokens = new Map<string, TokenRecord>();
  return {
    async createClient(input) {
      const client = { ...input, redirectUris: [...input.redirectUris], createdAt: new Date().toISOString() };
      clients.set(input.clientId, client);
      return { ...client, redirectUris: [...client.redirectUris] };
    },
    async findClient(clientId) {
      const c = clients.get(clientId);
      return c ? { ...c, redirectUris: [...c.redirectUris] } : null;
    },
    async touchClient() {},
    async saveCode(codeHash, record) {
      codes.set(codeHash, { ...record, usedAt: null });
    },
    async consumeCode(codeHash, now) {
      const r = codes.get(codeHash);
      if (!r) return null;
      if (r.usedAt !== null) return { status: "reused", record: { ...r } };
      r.usedAt = now;
      return { status: "fresh", record: { ...r } };
    },
    async saveToken(tokenHash, record) {
      tokens.set(tokenHash, { ...record, revokedAt: null });
    },
    async findToken(tokenHash) {
      const t = tokens.get(tokenHash);
      return t ? { ...t } : null;
    },
    async rotateRefresh(tokenHash, now) {
      const t = tokens.get(tokenHash);
      if (!t || t.kind !== "refresh") return null;
      if (t.revokedAt !== null) return { status: "revoked", record: { ...t } };
      t.revokedAt = now;
      return { status: "active", record: { ...t } };
    },
    async revokeFamily(familyId, now) {
      let n = 0;
      for (const t of tokens.values()) if (t.familyId === familyId && t.revokedAt === null) { t.revokedAt = now; n++; }
      return n;
    },
    async purgeExpired(now) {
      let n = 0;
      for (const [k, c] of codes) if (c.expiresAt < now - PURGE_GRACE_MS) { codes.delete(k); n++; }
      for (const [k, t] of tokens) if (t.expiresAt < now - PURGE_GRACE_MS) { tokens.delete(k); n++; }
      return n;
    },
  };
}

/** Expired rows are kept a day longer, so a late reuse of an expired code still finds (and revokes) its family. */
export const PURGE_GRACE_MS = 24 * 60 * 60_000;
