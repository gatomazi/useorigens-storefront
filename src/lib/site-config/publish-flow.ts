/**
 * Publish orchestration and Postgres ↔ Volume reconciliation (docs/admin/cms-v1-round2.md §5), as pure logic over injected
 * ports so every crash window can be tested with fault injection — no database or filesystem is touched here.
 *
 * Postgres and a file on the Volume cannot share a transaction, so a publish is a two-phase protocol:
 *
 *   1. `beginPublish`  (Postgres TX1): lock the head, compose the bundle, insert a `pending` release.
 *   2. `writeAtomic`   (Volume): write the bundle to a temp file, then rename it over `published.json`.
 *   3. `markLive`      (Postgres TX2): the release becomes `live` and the head moves to it.
 *   4. `revalidate`    (Next): only now is the ISR cache invalidated.
 *
 * Content authority: Postgres. The file is a projection the storefront reads. The single exception is the in-flight window
 * between steps 2 and 3, where the file is what visitors already see: reconciliation then rolls FORWARD (records the release
 * as live) instead of rewriting the older bundle under their feet. In every other disagreement the file is rewritten from the
 * head. The storefront itself never depends on any of this: it validates the file and falls back to the last valid bundle
 * in memory, then to the seed.
 */

export type ReleaseStatus = "pending" | "live" | "failed";
export type ReleaseRecord = { id: string; checksum: string; status: ReleaseStatus; createdAt: number };
export type FileState = { kind: "missing" } | { kind: "invalid" } | { kind: "valid"; releaseId: string; checksum: string };

export type ReconcileInput = {
  /** The live release the head points to, or `null` while only the seed exists. */
  head: ReleaseRecord | null;
  pending: ReleaseRecord[];
  file: FileState;
  /** Whether the ISR cache was invalidated after the head was last moved. */
  headRevalidated: boolean;
  now: number;
  /** How long a `pending` release may legitimately stay in flight before it is considered abandoned. */
  pendingGraceMs: number;
};

export type ReconcileAction =
  | { type: "promote-pending"; releaseId: string }
  | { type: "fail-pending"; releaseId: string }
  | { type: "wait" }
  | { type: "rewrite-file-from-head" }
  | { type: "revalidate" };

const matches = (file: FileState, r: ReleaseRecord): boolean => file.kind === "valid" && file.releaseId === r.id && file.checksum === r.checksum;

/** Decides what to repair. Idempotent: applying the actions and calling it again yields no actions. */
export function reconcile(input: ReconcileInput): ReconcileAction[] {
  const actions: ReconcileAction[] = [];
  let head = input.head;
  let headRevalidated = input.headRevalidated;

  const inFlight = [...input.pending].sort((a, b) => b.createdAt - a.createdAt);
  const served = inFlight.find((r) => matches(input.file, r));
  if (served) {
    // Crash between steps 2 and 3: visitors already see this release. Record it instead of reverting it.
    actions.push({ type: "promote-pending", releaseId: served.id });
    head = { ...served, status: "live" };
    headRevalidated = false;
  }
  for (const r of inFlight) {
    if (r === served) continue;
    if (input.now - r.createdAt >= input.pendingGraceMs) actions.push({ type: "fail-pending", releaseId: r.id });
    else actions.push({ type: "wait" });
  }

  if (head) {
    // Missing, corrupted, stale (Volume restored from a backup) or tampered file: the head is the authority.
    const fileOk = served ? true : matches(input.file, head);
    if (!fileOk) actions.push({ type: "rewrite-file-from-head" });
    // Crash between steps 3 and 4 (or a failed revalidation): the cache still serves the previous release.
    if (!headRevalidated || !fileOk) actions.push({ type: "revalidate" });
  }
  return actions;
}

// ── Publish protocol ─────────────────────────────────────────────────────────────────────────────────────────

export type PublishPorts<Bundle> = {
  db: {
    beginPublish(): Promise<{ release: ReleaseRecord; bundle: Bundle }>;
    markLive(releaseId: string): Promise<void>;
    markFailed(releaseId: string, reason: string): Promise<void>;
    markRevalidated(releaseId: string): Promise<void>;
  };
  files: {
    writeAtomic(bundle: Bundle, release: ReleaseRecord): Promise<void>;
    readState(): Promise<FileState>;
  };
  cache: { revalidate(): Promise<void> };
};

export type PublishOutcome =
  /** Everything done: file, head and cache. */
  | { status: "published"; releaseId: string }
  /** Visitors see the new release; Postgres still says `pending`. Reconciliation completes it. */
  | { status: "file-live-db-pending"; releaseId: string; error: unknown }
  /** Head moved and file written, but the cache was not invalidated. Reconciliation retries; ISR expires on its own within an hour. */
  | { status: "published-cache-stale"; releaseId: string; error: unknown }
  /** Nothing changed for visitors; the release is recorded as failed. */
  | { status: "failed"; releaseId: string; stage: "write-file"; error: unknown };

export async function publish<Bundle>(ports: PublishPorts<Bundle>): Promise<PublishOutcome> {
  const { release, bundle } = await ports.db.beginPublish(); // failure here throws: nothing was written anywhere

  try {
    await ports.files.writeAtomic(bundle, release);
  } catch (error) {
    // The rename may have happened even though something after it threw: look at the file before declaring failure.
    const after = await ports.files.readState().catch((): FileState => ({ kind: "invalid" }));
    if (!(after.kind === "valid" && after.releaseId === release.id && after.checksum === release.checksum)) {
      await ports.db.markFailed(release.id, "write-file").catch(() => undefined); // still pending → reconciliation fails it after the grace period
      return { status: "failed", releaseId: release.id, stage: "write-file", error };
    }
  }

  try {
    await ports.db.markLive(release.id);
  } catch (error) {
    return { status: "file-live-db-pending", releaseId: release.id, error };
  }

  try {
    await ports.cache.revalidate(); // only after a successful promotion
    await ports.db.markRevalidated(release.id);
  } catch (error) {
    return { status: "published-cache-stale", releaseId: release.id, error };
  }
  return { status: "published", releaseId: release.id };
}
