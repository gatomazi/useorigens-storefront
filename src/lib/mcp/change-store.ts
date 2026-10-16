import type { CommerceStoreKey } from "../geo/regions";
import type { ChangePlan } from "./changes";

/**
 * Where a previewed change waits for its confirmation (db/migrations/0007_mcp_changes): only the sha256 of the code is kept, with the plan,
 * the account and client that asked for it, and a 10-minute expiry. `claim` is the single point that turns a code into an execution: it
 * succeeds once, for the same account, before the expiry — two confirmations racing for one code get one winner.
 */
export type ChangeStatus = "pending" | "applying" | "applied" | "partial" | "failed";
export type ChangeRecord = {
  codeHash: string;
  subject: string;
  clientId: string;
  kind: ChangePlan["kind"];
  store: CommerceStoreKey;
  plan: ChangePlan;
  status: ChangeStatus;
  result: Record<string, unknown> | null;
  createdAt: number;
  expiresAt: number;
  appliedAt: number | null;
};

export type ClaimRefusal = "unknown" | "expired" | "used" | "other_account";
export type ClaimResult = { ok: true; record: ChangeRecord } | { ok: false; reason: ClaimRefusal; record: ChangeRecord | null };

export interface ChangeStore {
  create(record: Omit<ChangeRecord, "status" | "result" | "appliedAt">): Promise<void>;
  claim(codeHash: string, subject: string, now: number): Promise<ClaimResult>;
  finish(codeHash: string, status: Exclude<ChangeStatus, "pending" | "applying">, result: Record<string, unknown>, now: number): Promise<void>;
  find(codeHash: string): Promise<ChangeRecord | null>;
  /** Drops pending changes that expired before `before` (applied ones stay: they are the history the status tool reads). */
  purgeExpired(before: number): Promise<number>;
}

/** Why a claim failed, from the record as it is. */
export function refusalOf(record: ChangeRecord | null, subject: string, now: number): ClaimRefusal {
  if (!record) return "unknown";
  if (record.subject !== subject) return "other_account";
  if (record.status !== "pending") return "used";
  return now >= record.expiresAt ? "expired" : "used";
}

/** Development server and tests: kept in memory (lost on restart, like the dev OAuth store). */
export function memoryChangeStore(): ChangeStore {
  const rows = new Map<string, ChangeRecord>();
  return {
    async create(record) {
      rows.set(record.codeHash, { ...record, status: "pending", result: null, appliedAt: null });
    },
    async claim(codeHash, subject, now) {
      const r = rows.get(codeHash) ?? null;
      if (r && r.subject === subject && r.status === "pending" && now < r.expiresAt) {
        r.status = "applying";
        return { ok: true, record: { ...r } };
      }
      return { ok: false, reason: refusalOf(r, subject, now), record: r ? { ...r } : null };
    },
    async finish(codeHash, status, result, now) {
      const r = rows.get(codeHash);
      if (r) Object.assign(r, { status, result, appliedAt: now });
    },
    async find(codeHash) {
      const r = rows.get(codeHash);
      return r ? { ...r } : null;
    },
    async purgeExpired(before) {
      let n = 0;
      for (const [k, r] of rows) if (r.status === "pending" && r.expiresAt < before && rows.delete(k)) n++;
      return n;
    },
  };
}
