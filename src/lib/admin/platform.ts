import "server-only";
import path from "node:path";
import { siteConfigDir } from "../site-config/published";
import { adminConfig } from "./config";
import { createPgDb } from "./db/pg-db";
import type { Db } from "./db/db";
import { adminDevDir, fileDraftRepository, sandboxPublishedDir } from "./local-store";
import { devMediaStore } from "./media/dev-store";
import { bucketMediaStore } from "./media/bucket-store";
import { bucketFromEnv } from "./media/bucket-env";
import type { MediaStore } from "./media/types";
import { fileReleaseStore, filePublishedStore } from "./publishing";
import { pgAuditLog, pgDraftRepository, pgReleaseStore, pgSessionRepository, pgSyncRunRepository, pgUserRepository } from "./store/pg-stores";
import type { AuditEntry, AuditLog, AuditRow, DraftRepository, PublishedFileStore, ReleaseStore, SessionRepository, SyncRunRepository, SyncRunRow, UserRepository } from "./store/ports";

/**
 * Where the admin's data lives, chosen once per process from `adminConfig()`:
 *   dev  → JSON files under data/admin-dev (no database, no login, loopback-only; see dev-guard.ts)
 *   prod → PostgreSQL (drafts, releases, people, sessions, audit, sync runs), a Railway Storage Bucket (uploads), the Volume namespace `site-config/` (published.json)
 * Nothing here is imported by a public page, and nothing here runs at import time or during `next build`: the first admin request builds it.
 */
export type Platform = {
  mode: "dev" | "prod";
  drafts: DraftRepository;
  releases: ReleaseStore;
  files: PublishedFileStore;
  media: MediaStore;
  audit: AuditLog;
  syncs: SyncRunRepository;
  /** Production only. */
  users: UserRepository | null;
  sessions: SessionRepository | null;
  db: Db | null;
};

const g = globalThis as unknown as { __uoPlatform?: Platform; __uoPlatformKey?: string };

function memoryAudit(): AuditLog {
  const rows: AuditRow[] = [];
  return {
    async record(entry: AuditEntry) {
      rows.unshift({ ...entry, id: String(rows.length + 1), at: new Date().toISOString() });
      rows.length = Math.min(rows.length, 200);
    },
    async recent(limit) {
      return rows.slice(0, limit);
    },
  };
}

function memorySyncs(): SyncRunRepository {
  const runs: SyncRunRow[] = [];
  return {
    async start(kind, requestedBy) {
      if (runs.some((r) => r.kind === kind && r.status === "running")) return null;
      const run: SyncRunRow = { id: String(runs.length + 1), kind, status: "running", startedAt: new Date().toISOString(), finishedAt: null, requestedBy, summary: null, error: null };
      runs.push(run);
      return run;
    },
    async finish(id, result) {
      const run = runs.find((r) => r.id === id);
      if (!run) return;
      run.status = result.ok ? "succeeded" : "failed";
      run.finishedAt = new Date().toISOString();
      run.summary = result.ok ? result.summary : null;
      run.error = result.ok ? null : result.error;
    },
    async last(kind) {
      return [...runs].reverse().find((r) => r.kind === kind) ?? null;
    },
    async failStale(kind, maxAgeMs) {
      let n = 0;
      for (const r of runs) if (r.kind === kind && r.status === "running" && Date.now() - new Date(r.startedAt).getTime() > maxAgeMs) { r.status = "failed"; r.error = "abandoned"; r.finishedAt = new Date().toISOString(); n++; }
      return n;
    },
  };
}

export function platform(): Platform {
  const config = adminConfig();
  if (config.mode === "off") throw new Error("the admin is not enabled in this process");
  const key = config.mode === "dev" ? `dev:${adminDevDir()}` : `prod:${config.databaseUrl.length}`;
  if (g.__uoPlatform && g.__uoPlatformKey === key) return g.__uoPlatform;

  let built: Platform;
  if (config.mode === "dev") {
    const published = sandboxPublishedDir();
    built = {
      mode: "dev",
      drafts: fileDraftRepository(),
      releases: fileReleaseStore(path.join(adminDevDir(), "ledger.json"), path.join(published, "releases")),
      files: filePublishedStore(published),
      media: devMediaStore(),
      audit: memoryAudit(),
      syncs: memorySyncs(),
      users: null,
      sessions: null,
      db: null,
    };
  } else {
    const db = createPgDb({ connectionString: config.databaseUrl, max: Number(process.env.DATABASE_POOL_MAX) || 4, ssl: process.env.DATABASE_SSL === "require" });
    const objects = bucketFromEnv();
    built = {
      mode: "prod",
      drafts: pgDraftRepository(db),
      releases: pgReleaseStore(db),
      files: filePublishedStore(siteConfigDir()),
      media: bucketMediaStore({ db, objects }),
      audit: pgAuditLog(db),
      syncs: pgSyncRunRepository(db),
      users: pgUserRepository(db),
      sessions: pgSessionRepository(db),
      db,
    };
  }
  g.__uoPlatform = built;
  g.__uoPlatformKey = key;
  return built;
}
