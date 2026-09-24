import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundleChecksum } from "../site-config/checksum";
import { publish, reconcile, type FileState, type PublishOutcome, type PublishPorts, type ReleaseRecord } from "../site-config/publish-flow";
import { validateBundle, type PublishedBundle, type ScopeDoc } from "../site-config/schema";
import { buildSeedBundle } from "../site-config/seed";
import { collectionProblems, readabilityProblems } from "./validate-draft";
import { resolveMedia } from "./media";
import { adminDevDir, readJson, sandboxPublishedDir, withLock, writeJsonAtomic } from "./local-store";

/**
 * SANDBOX publishing for the local CMS: the same two-phase protocol as production (publish-flow.ts, covered by fault-injection tests),
 * with a JSON ledger standing in for Postgres and a directory under data/admin-dev/published standing in for the Volume namespace. The
 * storefront reads it only when the developer starts it with SITE_CONFIG_DIR pointing there. Nothing here is reachable outside the
 * dev-guarded admin, and `adminDevDir()` refuses to live inside the production Volume location.
 */
export type LedgerRelease = ReleaseRecord & { kind: "publish" | "rollback"; note: string | null; scopesChanged: string[]; promotedAt: string | null; failedReason: string | null; sections: number };
export type Ledger = { nextId: number; releases: LedgerRelease[]; headId: string | null; headRevalidated: boolean };

const ledgerFile = () => path.join(adminDevDir(), "ledger.json");
const historyDir = () => path.join(sandboxPublishedDir(), "releases");
const publishedFile = () => path.join(sandboxPublishedDir(), "published.json");

export async function readLedger(): Promise<Ledger> {
  return (await readJson<Ledger>(ledgerFile())) ?? { nextId: 1, releases: [], headId: null, headRevalidated: true };
}
const saveLedger = (l: Ledger) => writeJsonAtomic(ledgerFile(), l);

/** The bundle for the current draft: the seed for every scope except the edited one, plus the media the draft references. */
export async function composeBundle(doc: ScopeDoc, releaseId: string): Promise<PublishedBundle> {
  const seed = buildSeedBundle({ metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || null, ga4MeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null });
  const ids = new Set<string>();
  for (const s of doc.home?.sections ?? []) for (const ref of [s.appearance.image?.mobile, s.appearance.image?.desktop]) if (ref) ids.add(ref.assetId);
  return { schemaVersion: 1, releaseId, docs: { ...seed.docs, [doc.scope]: doc }, media: { ...seed.media, ...(await resolveMedia(ids)) } };
}

export type PublishRequest = { kind: "publish"; doc: ScopeDoc; note?: string } | { kind: "rollback"; toReleaseId: string; note?: string };

export type SandboxPublishResult = { ok: true; outcome: PublishOutcome } | { ok: false; errors: string[] };

/** Pre-flight for a publish: strict bundle validation plus "every active INK collection section still resolves" (no empty carousels). */
export async function preflight(doc: ScopeDoc): Promise<string[]> {
  const bundle = await composeBundle(doc, "preflight");
  const strict = validateBundle(bundle);
  return [...(strict.ok ? [] : strict.errors), ...collectionProblems(doc), ...readabilityProblems(doc)];
}

export async function publishToSandbox(request: PublishRequest, revalidate: () => Promise<void>): Promise<SandboxPublishResult> {
  let bundleForRequest: (id: string) => Promise<PublishedBundle>;
  let sectionCount = 0;
  if (request.kind === "publish") {
    const errors = await preflight(request.doc);
    if (errors.length > 0) return { ok: false, errors };
    bundleForRequest = (id) => composeBundle(request.doc, id);
    sectionCount = request.doc.home?.sections.filter((s) => s.active).length ?? 0;
  } else {
    const old = await readJson<PublishedBundle>(path.join(historyDir(), `${request.toReleaseId}.json`));
    if (!old) return { ok: false, errors: [`release ${request.toReleaseId} not found in the sandbox history`] };
    const strict = validateBundle(old);
    if (!strict.ok) return { ok: false, errors: strict.errors };
    bundleForRequest = async (id) => ({ ...old, releaseId: id });
    sectionCount = old.docs.sul.home?.sections.filter((s) => s.active).length ?? 0;
  }

  const ports: PublishPorts<PublishedBundle> = {
    db: {
      async beginPublish() {
        return withLock(async () => {
          const ledger = await readLedger();
          // Mirrors the unique partial index of the Postgres design: one publish in flight at a time.
          if (ledger.releases.some((r) => r.status === "pending")) throw new Error("a publish is already in flight");
          const id = String(ledger.nextId);
          const bundle = await bundleForRequest(id);
          const release: LedgerRelease = {
            id, checksum: bundleChecksum(bundle), status: "pending", createdAt: Date.now(), kind: request.kind, note: request.note ?? null,
            scopesChanged: ["sul"], promotedAt: null, failedReason: null, sections: sectionCount,
          };
          ledger.nextId += 1;
          ledger.releases.push(release);
          await saveLedger(ledger);
          return { release, bundle };
        });
      },
      markLive: (id) => update(id, (r, l) => { r.status = "live"; r.promotedAt = new Date().toISOString(); l.headId = id; l.headRevalidated = false; }),
      markFailed: (id, reason) => update(id, (r) => { r.status = "failed"; r.failedReason = reason; }),
      markRevalidated: (id) => update(id, (_r, l) => { if (l.headId === id) l.headRevalidated = true; }),
    },
    files: {
      async writeAtomic(bundle) {
        await writeJsonAtomic(path.join(historyDir(), `${bundle.releaseId}.json`), bundle);
        await writeJsonAtomic(publishedFile(), bundle);
      },
      readState: readFileState,
    },
    cache: { revalidate },
  };
  return { ok: true, outcome: await publish(ports) };
}

function update(id: string, fn: (r: LedgerRelease, l: Ledger) => void): Promise<void> {
  return withLock(async () => {
    const ledger = await readLedger();
    const release = ledger.releases.find((r) => r.id === id);
    if (!release) throw new Error(`release ${id} not in the ledger`);
    fn(release, ledger);
    await saveLedger(ledger);
  });
}

export async function readFileState(): Promise<FileState> {
  let text: string;
  try {
    text = await readFile(publishedFile(), "utf8");
  } catch {
    return { kind: "missing" };
  }
  try {
    const raw = JSON.parse(text) as PublishedBundle;
    return typeof raw.releaseId === "string" ? { kind: "valid", releaseId: raw.releaseId, checksum: bundleChecksum(raw) } : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

/** Repairs an interrupted publish exactly as the production reconciler would (same pure `reconcile`). Returns what it did. */
export async function reconcileSandbox(revalidate: () => Promise<void>): Promise<string[]> {
  const ledger = await readLedger();
  const head = ledger.releases.find((r) => r.id === ledger.headId) ?? null;
  const actions = reconcile({ head, pending: ledger.releases.filter((r) => r.status === "pending"), file: await readFileState(), headRevalidated: ledger.headRevalidated, now: Date.now(), pendingGraceMs: 30_000 });
  const done: string[] = [];
  for (const a of actions) {
    if (a.type === "promote-pending") await update(a.releaseId, (r, l) => { r.status = "live"; r.promotedAt = new Date().toISOString(); l.headId = r.id; l.headRevalidated = false; });
    if (a.type === "fail-pending") await update(a.releaseId, (r) => { r.status = "failed"; r.failedReason = "abandoned"; });
    if (a.type === "rewrite-file-from-head" && head) {
      const bundle = await readJson<PublishedBundle>(path.join(historyDir(), `${head.id}.json`));
      if (bundle) await writeJsonAtomic(publishedFile(), bundle);
    }
    if (a.type === "revalidate") {
      await revalidate();
      await update(ledger.headId ?? "", (_r, l) => { l.headRevalidated = true; }).catch(() => undefined);
    }
    done.push(a.type);
  }
  return done;
}

export async function listHistory(): Promise<LedgerRelease[]> {
  return (await readLedger()).releases.slice().reverse();
}

export async function currentPublished(): Promise<PublishedBundle | null> {
  return readJson<PublishedBundle>(publishedFile());
}


/** Dry run of the reconciler: what it WOULD do (empty = ledger, file and cache agree). */
export async function inspectSandbox(): Promise<string[]> {
  const ledger = await readLedger();
  const head = ledger.releases.find((r) => r.id === ledger.headId) ?? null;
  return reconcile({ head, pending: ledger.releases.filter((r) => r.status === "pending"), file: await readFileState(), headRevalidated: ledger.headRevalidated, now: Date.now(), pendingGraceMs: 30_000 }).map((a) => a.type);
}
