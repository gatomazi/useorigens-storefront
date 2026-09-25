import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundleChecksum } from "../site-config/checksum";
import { publish, reconcile, type FileState, type PublishOutcome, type PublishPorts, type ReleaseRecord } from "../site-config/publish-flow";
import { resolveTracking } from "../site-config/resolve";
import { validateBundle, type MediaAssetInfo, type PublishedBundle, type ScopeDoc } from "../site-config/schema";
import { buildSeedBundle } from "../site-config/seed";
import { readJson, withLock, writeJsonAtomic } from "./local-store";
import { collectionProblems, readabilityProblems } from "./validate-draft";
import type { BeginRequest, PublishedFileStore, ReleaseStore, ReleaseView } from "./store/ports";

/**
 * Publishing, the same two-phase protocol everywhere (site-config/publish-flow.ts, covered by fault-injection tests):
 *   begin (release row `pending`) → write published.json atomically → mark live → revalidate.
 * What differs is only WHERE the ports point: the local sandbox uses a JSON ledger + a directory under data/admin-dev; production uses
 * PostgreSQL + the Volume namespace `site-config/`. Nothing here is imported by a public page.
 */
export type MediaResolver = (assetIds: Iterable<string>, purpose?: "publish" | "preview") => Promise<Record<string, MediaAssetInfo>>;
export type PublishDeps = { releases: ReleaseStore; files: PublishedFileStore; media: MediaResolver; actorId: string | null };

const envTracking = () => ({ metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || null, ga4MeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null });
export const seedForEnv = (): PublishedBundle => buildSeedBundle(envTracking());

/**
 * The bundle for the draft: what is live now (or the seed) for every scope except the edited one, plus the media the draft references.
 * Other scopes are carried over from the live head, never regenerated, so editing Sul cannot alter another region's published state.
 */
export async function composeBundle(deps: Pick<PublishDeps, "releases" | "media">, doc: ScopeDoc, releaseId: string): Promise<PublishedBundle> {
  const seed = seedForEnv();
  const head = await deps.releases.head();
  const base = head?.bundle ?? seed;
  const ids = new Set<string>();
  for (const s of doc.home?.sections ?? []) for (const ref of [s.appearance.image?.mobile, s.appearance.image?.desktop]) if (ref) ids.add(ref.assetId);
  return { schemaVersion: 1, releaseId, docs: { ...base.docs, [doc.scope]: doc }, media: { ...seed.media, ...base.media, ...(await deps.media(ids)) } };
}

/** Publish pre-flight: strict bundle validation, every INK collection section still resolves, readable text, tracking unchanged (D5). */
export async function preflight(deps: Pick<PublishDeps, "releases" | "media">, doc: ScopeDoc): Promise<string[]> {
  const bundle = await composeBundle(deps, doc, "preflight");
  const strict = validateBundle(bundle);
  const problems = [...(strict.ok ? [] : strict.errors), ...collectionProblems(doc), ...readabilityProblems(doc)];
  const env = envTracking();
  if (env.metaPixelId || env.ga4MeasurementId) {
    // This round does not change production tracking: a document whose effective IDs differ from the ones the build was made with is refused.
    const effective = resolveTracking(bundle, doc.scope, env);
    if (effective.metaPixelId !== env.metaPixelId) problems.push("O ID do Meta Pixel do documento difere do ID em produção. A troca de IDs não faz parte desta versão.");
    if (effective.ga4MeasurementId !== env.ga4MeasurementId) problems.push("O ID do GA4 do documento difere do ID em produção. A troca de IDs não faz parte desta versão.");
  }
  return problems;
}

export type PublishRequest = { kind: "publish"; doc: ScopeDoc; note?: string } | { kind: "rollback"; toReleaseId: string; note?: string };
export type PublishResult = { ok: true; outcome: PublishOutcome } | { ok: false; errors: string[] };

export async function publishRelease(deps: PublishDeps, request: PublishRequest, revalidate: () => Promise<void>): Promise<PublishResult> {
  let compose: (id: string) => Promise<PublishedBundle>;
  let sections = 0;
  let scopesChanged: string[];
  if (request.kind === "publish") {
    const errors = await preflight(deps, request.doc);
    if (errors.length > 0) return { ok: false, errors };
    compose = (id) => composeBundle(deps, request.doc, id);
    sections = request.doc.home?.sections.filter((s) => s.active).length ?? 0;
    scopesChanged = [request.doc.scope];
  } else {
    const old = await deps.releases.restorable(request.toReleaseId);
    if (!old) return { ok: false, errors: [`a versão ${request.toReleaseId} não existe ou nunca esteve no ar`] };
    const strict = validateBundle(old);
    if (!strict.ok) return { ok: false, errors: strict.errors };
    compose = async (id) => ({ ...old, releaseId: id });
    sections = old.docs.sul.home?.sections.filter((s) => s.active).length ?? 0;
    scopesChanged = ["sul"];
  }
  const begin: BeginRequest = { kind: request.kind, note: request.note ?? null, scopesChanged, sections, actorId: deps.actorId };

  const ports: PublishPorts<PublishedBundle> = {
    db: {
      beginPublish: () => deps.releases.begin(begin, compose),
      markLive: (id) => deps.releases.markLive(id),
      markFailed: (id, reason) => deps.releases.markFailed(id, reason),
      markRevalidated: (id) => deps.releases.markRevalidated(id),
    },
    files: { writeAtomic: (bundle) => deps.files.writeAtomic(bundle), readState: () => deps.files.readState() },
    cache: { revalidate },
  };
  return { ok: true, outcome: await publish(ports) };
}

const PENDING_GRACE_MS = 30_000;

/** Repairs an interrupted publish exactly as the pure `reconcile` prescribes. Returns the actions it took. */
export async function reconcileReleases(deps: Pick<PublishDeps, "releases" | "files">, revalidate: () => Promise<void>): Promise<string[]> {
  const state = await deps.releases.reconcileState();
  const actions = reconcile({ head: state.head, pending: state.pending, file: await deps.files.readState(), headRevalidated: state.headRevalidated, now: Date.now(), pendingGraceMs: PENDING_GRACE_MS });
  const done: string[] = [];
  for (const a of actions) {
    if (a.type === "promote-pending") await deps.releases.markLive(a.releaseId);
    if (a.type === "fail-pending") await deps.releases.markFailed(a.releaseId, "abandoned");
    if (a.type === "rewrite-file-from-head") {
      const head = await deps.releases.head();
      if (head) await deps.files.writeAtomic(head.bundle);
    }
    if (a.type === "revalidate") {
      await revalidate();
      const head = await deps.releases.head();
      if (head) await deps.releases.markRevalidated(head.record.id);
    }
    done.push(a.type);
  }
  return done;
}

/** Dry run of the reconciler: what it WOULD do (empty = release store, file and cache agree). */
export async function inspectReleases(deps: Pick<PublishDeps, "releases" | "files">): Promise<string[]> {
  const state = await deps.releases.reconcileState();
  return reconcile({ head: state.head, pending: state.pending, file: await deps.files.readState(), headRevalidated: state.headRevalidated, now: Date.now(), pendingGraceMs: PENDING_GRACE_MS }).map((a) => a.type);
}

// ── File-backed adapters (local sandbox ledger; also the published.json projection in production) ─────────────

export async function readFileStateAt(file: string): Promise<FileState> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
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

/** `published.json` in a directory: temp file + rename (a reader never sees a half-written file). */
export function filePublishedStore(dir: string): PublishedFileStore {
  const file = path.join(dir, "published.json");
  return {
    writeAtomic: (bundle) => writeJsonAtomic(file, bundle),
    readState: () => readFileStateAt(file),
    read: () => readJson<PublishedBundle>(file),
  };
}

export type LedgerRelease = ReleaseRecord & { kind: "publish" | "rollback"; note: string | null; scopesChanged: string[]; promotedAt: string | null; failedReason: string | null; sections: number; createdBy?: string | null };
type Ledger = { nextId: number; releases: LedgerRelease[]; headId: string | null; headRevalidated: boolean };

/** The local sandbox ledger (data/admin-dev/ledger.json + releases/<id>.json): the stand-in for the Postgres release tables. */
export function fileReleaseStore(ledgerPath: string, historyDir: string): ReleaseStore {
  const read = async (): Promise<Ledger> => (await readJson<Ledger>(ledgerPath)) ?? { nextId: 1, releases: [], headId: null, headRevalidated: true };
  const update = (id: string, fn: (r: LedgerRelease, l: Ledger) => void) =>
    withLock(async () => {
      const ledger = await read();
      const release = ledger.releases.find((r) => r.id === id);
      if (!release) throw new Error(`release ${id} not in the ledger`);
      fn(release, ledger);
      await writeJsonAtomic(ledgerPath, ledger);
    });
  const bundleFile = (id: string) => path.join(historyDir, `${id}.json`);
  const view = (r: LedgerRelease): ReleaseView => ({ ...r, createdBy: r.createdBy ?? null });
  return {
    begin: (request, compose) =>
      withLock(async () => {
        const ledger = await read();
        // Mirrors the unique partial index of the Postgres design: one publish in flight at a time.
        if (ledger.releases.some((r) => r.status === "pending")) throw new Error("a publish is already in flight");
        const id = String(ledger.nextId);
        const bundle = await compose(id);
        const release: LedgerRelease = { id, checksum: bundleChecksum(bundle), status: "pending", createdAt: Date.now(), kind: request.kind, note: request.note, scopesChanged: request.scopesChanged, promotedAt: null, failedReason: null, sections: request.sections, createdBy: request.actorId };
        ledger.nextId += 1;
        ledger.releases.push(release);
        await writeJsonAtomic(bundleFile(id), bundle);
        await writeJsonAtomic(ledgerPath, ledger);
        return { release, bundle };
      }),
    markLive: (id) => update(id, (r, l) => { r.status = "live"; r.promotedAt = new Date().toISOString(); l.headId = id; l.headRevalidated = false; }),
    markFailed: (id, reason) => update(id, (r) => { r.status = "failed"; r.failedReason = reason; }),
    markRevalidated: (id) => update(id, (_r, l) => { if (l.headId === id) l.headRevalidated = true; }),
    async restorable(id) {
      const release = (await read()).releases.find((r) => r.id === id);
      return release && release.status === "live" ? readJson<PublishedBundle>(bundleFile(id)) : null;
    },
    async head() {
      const ledger = await read();
      const record = ledger.releases.find((r) => r.id === ledger.headId);
      const bundle = record ? await readJson<PublishedBundle>(bundleFile(record.id)) : null;
      return record && bundle ? { record, bundle } : null;
    },
    async list(limit) {
      return (await read()).releases.slice().reverse().slice(0, limit).map(view);
    },
    async reconcileState() {
      const ledger = await read();
      return { head: ledger.releases.find((r) => r.id === ledger.headId) ?? null, pending: ledger.releases.filter((r) => r.status === "pending"), headRevalidated: ledger.headRevalidated };
    },
  };
}
