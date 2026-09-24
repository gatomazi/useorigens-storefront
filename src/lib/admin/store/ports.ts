import type { Scope, ScopeDoc } from "../../site-config/schema";
import type { FileState, ReleaseRecord } from "../../site-config/publish-flow";
import type { PublishedBundle } from "../../site-config/schema";

/** The person behind a request. `role: owner` may touch every scope and manage people; an editor only the scopes listed. */
export type Role = "owner" | "editor";
export type Actor = { id: string; email: string; name: string | null; role: Role; scopes: Scope[] };

export const canEdit = (actor: Actor, scope: Scope): boolean => actor.role === "owner" || actor.scopes.includes(scope);

// ── Drafts ───────────────────────────────────────────────────────────────────────────────────────────────────

export type DraftRecord = { scope: Scope; rev: number; updatedAt: string; baseReleaseId: string | null; doc: ScopeDoc };
export type SaveResult = { ok: true; record: DraftRecord } | { ok: false; conflict: DraftRecord | null };

/** `expectedRev: null` = "there must be no draft yet". Same contract as `update … where scope = $1 and rev = $2`. */
export interface DraftRepository {
  load(scope: Scope): Promise<DraftRecord | null>;
  save(scope: Scope, doc: ScopeDoc, expectedRev: number | null, baseReleaseId: string | null, actorId: string | null): Promise<SaveResult>;
  discard(scope: Scope): Promise<void>;
}

// ── Releases ─────────────────────────────────────────────────────────────────────────────────────────────────

export type ReleaseKind = "publish" | "rollback";
export type ReleaseView = ReleaseRecord & { kind: ReleaseKind | "seed"; note: string | null; scopesChanged: string[]; promotedAt: string | null; failedReason: string | null; sections: number; createdBy: string | null };
export type BeginRequest = { kind: ReleaseKind; note: string | null; scopesChanged: string[]; sections: number; actorId: string | null };

export interface ReleaseStore {
  /** Records a `pending` release with its composed bundle. Throws when another publish is in flight. */
  begin(request: BeginRequest, compose: (releaseId: string) => Promise<PublishedBundle>): Promise<{ release: ReleaseRecord; bundle: PublishedBundle }>;
  markLive(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  markRevalidated(id: string): Promise<void>;
  /** The bundle of a release that WAS live (a pending or failed one is never restorable), or null. */
  restorable(id: string): Promise<PublishedBundle | null>;
  /** The live head's bundle, or null while only the seed exists. */
  head(): Promise<{ record: ReleaseRecord; bundle: PublishedBundle } | null>;
  list(limit: number): Promise<ReleaseView[]>;
  reconcileState(): Promise<{ head: ReleaseRecord | null; pending: ReleaseRecord[]; headRevalidated: boolean }>;
}

/** The projection the storefront reads (published.json). Written with write-temp + rename, never in place. */
export interface PublishedFileStore {
  writeAtomic(bundle: PublishedBundle): Promise<void>;
  readState(): Promise<FileState>;
  read(): Promise<PublishedBundle | null>;
}

// ── People, sessions, audit ──────────────────────────────────────────────────────────────────────────────────

export type UserRow = Actor & { active: boolean; googleSub: string | null; createdAt: string; lastLoginAt: string | null };

export interface UserRepository {
  findByEmail(email: string): Promise<UserRow | null>;
  findById(id: string): Promise<UserRow | null>;
  list(): Promise<UserRow[]>;
  create(input: { email: string; name: string | null; role: Role; scopes: Scope[] }): Promise<UserRow>;
  update(id: string, patch: { role?: Role; scopes?: Scope[]; active?: boolean; name?: string | null }): Promise<UserRow | null>;
  /** Binds the Google account (`sub`) on first login. Returns false when this user is already bound to a DIFFERENT account. */
  bindGoogleSub(id: string, sub: string): Promise<boolean>;
  touchLogin(id: string): Promise<void>;
}

export type SessionInfo = { user: UserRow; createdAt: number; lastSeenAt: number; expiresAt: number };

export interface SessionRepository {
  /** Stores only sha256(token). The token itself is returned once, to be set as the cookie. */
  create(userId: string, ttlMs: number): Promise<string>;
  lookup(token: string, idleMs: number): Promise<SessionInfo | null>;
  destroy(token: string): Promise<void>;
  destroyAllFor(userId: string): Promise<void>;
  purgeExpired(): Promise<number>;
}

export type AuditAction =
  | "login" | "logout" | "draft.save" | "draft.discard" | "publish" | "rollback" | "publish.failed" | "reconcile"
  | "media.upload" | "media.delete" | "user.create" | "user.update" | "user.deactivate" | "catalog.sync" | "collections.sync" | "access.denied";
export type AuditEntry = { actor: string; action: AuditAction; scope?: string | null; target?: string | null; meta?: Record<string, unknown> | null };
export type AuditRow = AuditEntry & { id: string; at: string };

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
  recent(limit: number): Promise<AuditRow[]>;
}

// ── Sync runs ────────────────────────────────────────────────────────────────────────────────────────────────

export type SyncKind = "catalog" | "collections";
export type SyncRunRow = { id: string; kind: SyncKind; status: "running" | "succeeded" | "failed"; startedAt: string; finishedAt: string | null; requestedBy: string; summary: Record<string, unknown> | null; error: string | null };

export interface SyncRunRepository {
  /** Starts a run, or returns null when one of the same kind is already running (unique partial index in Postgres). */
  start(kind: SyncKind, requestedBy: string): Promise<SyncRunRow | null>;
  finish(id: string, result: { ok: true; summary: Record<string, unknown> } | { ok: false; error: string }): Promise<void>;
  last(kind: SyncKind): Promise<SyncRunRow | null>;
  /** A run that has been "running" for longer than `maxAgeMs` belongs to a process that died: mark it failed so a new one may start. */
  failStale(kind: SyncKind, maxAgeMs: number): Promise<number>;
}
