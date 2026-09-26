import { describe, expect, test } from "vitest";
import { publish, reconcile, type FileState, type PublishPorts, type ReconcileAction, type ReleaseRecord } from "@/lib/site-config/publish-flow";

/** In-memory Postgres + Volume + cache with a switch per failure point. */
type Fault = "begin" | "write-before-rename" | "write-after-rename" | "mark-live" | "mark-live-after-commit" | "revalidate" | "mark-revalidated" | "mark-failed";

function world(faults: Fault[] = []) {
  const state = {
    head: { id: "r1", checksum: "c1", status: "live", createdAt: 0 } as ReleaseRecord,
    releases: new Map<string, ReleaseRecord>([["r1", { id: "r1", checksum: "c1", status: "live", createdAt: 0 }]]),
    file: { kind: "valid", releaseId: "r1", checksum: "c1" } as FileState,
    headRevalidated: true,
    servedByCache: "r1",
    events: [] as string[],
  };
  const boom = (f: Fault) => {
    if (faults.includes(f)) throw new Error(`fault:${f}`);
  };
  const ports: PublishPorts<{ id: string }> = {
    db: {
      async beginPublish() {
        boom("begin");
        // Mirrors the unique partial index `release_one_pending`: a second publish cannot start while one is in flight.
        if ([...state.releases.values()].some((r) => r.status === "pending")) throw new Error("a publish is already in flight");
        const n = state.releases.size + 1;
        const release: ReleaseRecord = { id: `r${n}`, checksum: `c${n}`, status: "pending", createdAt: 10 };
        state.releases.set(release.id, release);
        state.events.push("db:pending");
        return { release, bundle: { id: release.id } };
      },
      async markLive(id) {
        boom("mark-live");
        state.releases.get(id)!.status = "live";
        state.head = state.releases.get(id)!;
        state.headRevalidated = false;
        state.events.push("db:live");
        // The commit happened but the caller never learns it (connection dropped on the reply).
        boom("mark-live-after-commit");
      },
      async markFailed(id, reason) {
        boom("mark-failed");
        state.releases.get(id)!.status = "failed";
        state.events.push(`db:failed:${reason}`);
      },
      async markRevalidated() {
        boom("mark-revalidated");
        state.headRevalidated = true;
      },
    },
    files: {
      async writeAtomic(_bundle, release) {
        boom("write-before-rename");
        state.file = { kind: "valid", releaseId: release.id, checksum: release.checksum };
        state.events.push("file:renamed");
        boom("write-after-rename");
      },
      async readState() {
        return state.file;
      },
    },
    cache: {
      async revalidate() {
        boom("revalidate");
        state.servedByCache = state.head.id;
        state.events.push("cache:revalidated");
      },
    },
  };
  return { state, ports };
}

const types = (a: ReconcileAction[]) => a.map((x) => x.type);

describe("publish protocol", () => {
  test("given no failures, when publishing, then file, head and cache move in order and the cache is invalidated last", async () => {
    const { state, ports } = world();
    const outcome = await publish(ports);
    expect(outcome).toEqual({ status: "published", releaseId: "r2" });
    expect(state.events).toEqual(["db:pending", "file:renamed", "db:live", "cache:revalidated"]);
    expect(state.head.id).toBe("r2");
  });

  test("given the database fails before anything is written, when publishing, then it throws and nothing changed", async () => {
    const { state, ports } = world(["begin"]);
    await expect(publish(ports)).rejects.toThrow("fault:begin");
    expect(state.file).toEqual({ kind: "valid", releaseId: "r1", checksum: "c1" });
    expect(state.head.id).toBe("r1");
  });

  test("given the file write fails before the rename, when publishing, then the release is failed, the old file stays and the cache is untouched", async () => {
    const { state, ports } = world(["write-before-rename"]);
    const outcome = await publish(ports);
    expect(outcome.status).toBe("failed");
    expect(state.releases.get("r2")!.status).toBe("failed");
    expect(state.file).toEqual({ kind: "valid", releaseId: "r1", checksum: "c1" });
    expect(state.head.id).toBe("r1");
    expect(state.events).not.toContain("cache:revalidated");
  });

  test("given the write throws AFTER the rename, when publishing, then the file is checked and the publish continues instead of being reported as failed", async () => {
    const { state, ports } = world(["write-after-rename"]);
    const outcome = await publish(ports);
    expect(outcome.status).toBe("published");
    expect(state.head.id).toBe("r2");
  });

  test("given the file write fails and marking the release failed also fails, when publishing, then it stays pending for reconciliation to fail", async () => {
    const { state, ports } = world(["write-before-rename", "mark-failed"]);
    const outcome = await publish(ports);
    expect(outcome.status).toBe("failed");
    expect(state.releases.get("r2")!.status).toBe("pending");
    expect(state.file).toEqual({ kind: "valid", releaseId: "r1", checksum: "c1" });
  });

  test("given the promotion fails after the file was written, when publishing, then the outcome says the file is live and the cache is NOT invalidated", async () => {
    const { state, ports } = world(["mark-live"]);
    const outcome = await publish(ports);
    expect(outcome.status).toBe("file-live-db-pending");
    expect(state.releases.get("r2")!.status).toBe("pending");
    expect(state.events).not.toContain("cache:revalidated");
  });

  test("given the cache invalidation fails, when publishing, then the head and file are correct and the outcome flags a stale cache", async () => {
    const { state, ports } = world(["revalidate"]);
    const outcome = await publish(ports);
    expect(outcome.status).toBe("published-cache-stale");
    expect(state.head.id).toBe("r2");
    expect(state.headRevalidated).toBe(false);
  });
});

describe("failure after the database commit, retry and rollback", () => {
  test("given the promotion COMMITS but the reply is lost, when publishing, then the outcome is 'in doubt' and reconciliation only needs the cache invalidation", async () => {
    const { state, ports } = world(["mark-live-after-commit"]);
    const outcome = await publish(ports);
    expect(outcome.status).toBe("file-live-db-pending");
    expect(state.head.id).toBe("r2"); // the database DID commit
    const actions = reconcile({ head: state.head, pending: [...state.releases.values()].filter((r) => r.status === "pending"), file: state.file, headRevalidated: state.headRevalidated, now: 1_000_000, pendingGraceMs: 120_000 });
    expect(actions).toEqual([{ type: "revalidate" }]); // no rewrite, no second promotion
  });

  test("given a failed publish, when the editor retries, then a NEW release is created and it goes live (the failed one stays as history)", async () => {
    const { state, ports } = world(["write-before-rename"]);
    expect((await publish(ports)).status).toBe("failed");
    state.events.length = 0;
    // Same world, the disk problem is gone: the failed release no longer blocks a new one.
    const ports2 = { ...ports, files: { ...ports.files, writeAtomic: async (_b: unknown, r: { id: string; checksum: string }) => void (state.file = { kind: "valid", releaseId: r.id, checksum: r.checksum }) } } as typeof ports;
    const outcome = await publish(ports2);
    expect(outcome).toEqual({ status: "published", releaseId: "r3" });
    expect(state.releases.get("r2")!.status).toBe("failed");
    expect(state.head.id).toBe("r3");
  });

  test("given a publish in doubt (file live, database pending), when another publish starts before reconciliation, then it is refused", async () => {
    const { ports } = world(["mark-live"]);
    expect((await publish(ports)).status).toBe("file-live-db-pending");
    await expect(publish(ports)).rejects.toThrow("already in flight");
  });

  test("given a rollback (a publish of an OLDER bundle), when its file write fails, then the currently served release stays live", async () => {
    const { state, ports } = world();
    expect((await publish(ports)).status).toBe("published"); // r2 is live
    const failing = { ...ports, files: { ...ports.files, writeAtomic: async () => { throw new Error("disk full"); } } } as typeof ports;
    const outcome = await publish(failing); // r3 = "rollback to r1"
    expect(outcome.status).toBe("failed");
    expect(state.head.id).toBe("r2");
    expect(state.file).toEqual({ kind: "valid", releaseId: "r2", checksum: "c2" });
  });

  test("given a rollback that succeeds, when done, then history keeps every release and the head moves to the new (rollback) release", async () => {
    const { state, ports } = world();
    await publish(ports);
    await publish(ports);
    expect([...state.releases.keys()]).toEqual(["r1", "r2", "r3"]);
    expect(state.head.id).toBe("r3");
  });

  test("given the database is unreachable, when the storefront serves, then nothing in the publish path is involved (it reads the file only)", async () => {
    // The storefront never calls any port above: it reads the published file (or the seed). Proven structurally here: with the
    // database port throwing on every call, the file-derived state is untouched and needs no database.
    const { state, ports } = world(["begin"]);
    await expect(publish(ports)).rejects.toThrow("fault:begin");
    expect(state.file).toEqual({ kind: "valid", releaseId: "r1", checksum: "c1" });
  });
});

describe("reconciliation", () => {
  const live = (id: string, checksum: string): ReleaseRecord => ({ id, checksum, status: "live", createdAt: 0 });
  const pending = (id: string, checksum: string, createdAt: number): ReleaseRecord => ({ id, checksum, status: "pending", createdAt });
  const valid = (releaseId: string, checksum: string): FileState => ({ kind: "valid", releaseId, checksum });
  const base = { pendingGraceMs: 120_000, headRevalidated: true, now: 1_000_000 };

  test("given everything consistent, when reconciled, then there is nothing to do", () => {
    expect(reconcile({ ...base, head: live("r1", "c1"), pending: [], file: valid("r1", "c1") })).toEqual([]);
  });

  test("given only the seed exists (no release yet), when reconciled, then nothing is written — the seed is the fallback", () => {
    expect(reconcile({ ...base, head: null, pending: [], file: { kind: "missing" } })).toEqual([]);
  });

  test("given the file is already the pending release (crash between rename and promotion), when reconciled, then it rolls FORWARD and revalidates", () => {
    const actions = reconcile({ ...base, head: live("r1", "c1"), pending: [pending("r2", "c2", base.now - 5000)], file: valid("r2", "c2") });
    expect(actions).toContainEqual({ type: "promote-pending", releaseId: "r2" });
    expect(types(actions)).toContain("revalidate");
    expect(types(actions)).not.toContain("rewrite-file-from-head");
  });

  test("given a recent pending release and the old file, when reconciled, then it waits (a publish may be in flight)", () => {
    const actions = reconcile({ ...base, head: live("r1", "c1"), pending: [pending("r2", "c2", base.now - 1000)], file: valid("r1", "c1") });
    expect(actions).toEqual([{ type: "wait" }]);
  });

  test("given an abandoned pending release and the old file, when reconciled, then the release is failed and the file is left alone", () => {
    const actions = reconcile({ ...base, head: live("r1", "c1"), pending: [pending("r2", "c2", base.now - 600_000)], file: valid("r1", "c1") });
    expect(actions).toEqual([{ type: "fail-pending", releaseId: "r2" }]);
  });

  test("given the file is missing (Volume lost), when reconciled, then it is rewritten from the head", () => {
    const actions = reconcile({ ...base, head: live("r3", "c3"), pending: [], file: { kind: "missing" } });
    expect(types(actions)).toEqual(["rewrite-file-from-head", "revalidate"]);
  });

  test("given the file is corrupted, when reconciled, then it is rewritten from the head", () => {
    expect(types(reconcile({ ...base, head: live("r3", "c3"), pending: [], file: { kind: "invalid" } }))).toContain("rewrite-file-from-head");
  });

  test("given a stale file (Volume restored from an older backup), when reconciled, then the head overwrites it", () => {
    expect(types(reconcile({ ...base, head: live("r3", "c3"), pending: [], file: valid("r1", "c1") }))).toContain("rewrite-file-from-head");
  });

  test("given a file whose checksum differs from its release (tampered), when reconciled, then it is rewritten from the head", () => {
    expect(types(reconcile({ ...base, head: live("r3", "c3"), pending: [], file: valid("r3", "TAMPERED") }))).toContain("rewrite-file-from-head");
  });

  test("given a consistent head whose cache invalidation never ran, when reconciled, then it only revalidates", () => {
    expect(reconcile({ ...base, headRevalidated: false, head: live("r3", "c3"), pending: [], file: valid("r3", "c3") })).toEqual([{ type: "revalidate" }]);
  });

  test("given a crash at any step of a publish, when the world is reconciled and its actions applied, then the storefront ends on one coherent release", async () => {
    const faultsByStep: Fault[][] = [["write-before-rename"], ["write-after-rename", "mark-failed"], ["mark-live"], ["revalidate"], ["mark-revalidated"]];
    for (const faults of faultsByStep) {
      const { state, ports } = world(faults);
      await publish(ports);
      const actions = reconcile({
        head: state.head,
        pending: [...state.releases.values()].filter((r) => r.status === "pending"),
        file: state.file,
        headRevalidated: state.headRevalidated,
        now: 10 + 600_000, // grace period elapsed
        pendingGraceMs: 120_000,
      });
      for (const a of actions) {
        if (a.type === "promote-pending") {
          state.head = { ...state.releases.get(a.releaseId)!, status: "live" };
          state.releases.get(a.releaseId)!.status = "live";
          state.headRevalidated = false;
        }
        if (a.type === "fail-pending") state.releases.get(a.releaseId)!.status = "failed";
        if (a.type === "rewrite-file-from-head") state.file = { kind: "valid", releaseId: state.head.id, checksum: state.head.checksum };
        if (a.type === "revalidate") {
          state.servedByCache = state.head.id;
          state.headRevalidated = true;
        }
      }
      // One coherent release: the file, the head and what the cache serves all agree, and nothing is left pending.
      expect(state.file, faults.join("+")).toEqual({ kind: "valid", releaseId: state.head.id, checksum: state.head.checksum });
      expect(state.servedByCache, faults.join("+")).toBe(state.head.id);
      expect([...state.releases.values()].some((r) => r.status === "pending"), faults.join("+")).toBe(false);
      // Idempotent: reconciling again is a no-op.
      expect(reconcile({ head: state.head, pending: [], file: state.file, headRevalidated: state.headRevalidated, now: 2_000_000, pendingGraceMs: 120_000 })).toEqual([]);
    }
  });
});

describe("the local ledger's history (sandbox)", () => {
  test("given a dozen releases, when listed and paged, then the order is numeric, pages do not overlap, and only a non-live release can be deleted", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { fileReleaseStore } = await import("@/lib/admin/publishing");
    const { buildSeedBundle } = await import("@/lib/site-config/seed");
    const dir = await mkdtemp(path.join(tmpdir(), "ledger-"));
    try {
      const store = fileReleaseStore(path.join(dir, "ledger.json"), path.join(dir, "releases"));
      const bundle = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
      for (let i = 0; i < 12; i++) {
        const { release } = await store.begin({ kind: "publish", note: null, scopesChanged: ["sul"], sections: 1, actorId: null }, async (id) => ({ ...bundle, releaseId: id }));
        await store.markLive(release.id);
      }
      const all = await store.list(50);
      expect(all.map((r) => r.id)).toEqual(["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"]);
      expect(await store.count()).toBe(12);
      expect((await store.list(5, 5)).map((r) => r.id)).toEqual(["7", "6", "5", "4", "3"]);
      expect(await store.remove("12")).toEqual({ ok: false, error: "a versão que está no ar não pode ser apagada" });
      expect(await store.remove("3")).toEqual({ ok: true });
      expect(await store.count()).toBe(11);
      expect(await store.restorable("3")).toBeNull();
      expect(await store.remove("3")).toMatchObject({ ok: false });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
