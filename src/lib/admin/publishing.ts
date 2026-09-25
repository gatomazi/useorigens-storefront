import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundleChecksum } from "../site-config/checksum";
import { publish, reconcile, type FileState, type PublishOutcome, type PublishPorts, type ReleaseRecord } from "../site-config/publish-flow";
import { resolveTracking, type TrackingOrigin } from "../site-config/resolve";
import { validateBundle, type MediaAssetInfo, type PublishedBundle, type Scope, type ScopeDoc } from "../site-config/schema";
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

const TOOL_LABEL = { meta: "Meta Pixel", ga4: "GA4" } as const;
const ORIGIN_LABEL: Record<TrackingOrigin, string> = { own: "próprio", global: "global", legacy: "legado (variável do build)", disabled: "desligado", "inherit-inactive": "herda um global inativo", unconfigured: "sem configuração" };
const REGION_LABEL = { sul: "Sul", norte: "Norte", "centro-oeste": "Centro-Oeste" } as const;

/** The effective ID of every region and tool, with its origin, from a bundle (or from nothing published yet). */
export function effectiveTable(bundle: PublishedBundle | null): { scope: keyof typeof REGION_LABEL; tool: "meta" | "ga4"; id: string | null; origin: TrackingOrigin }[] {
  const legacy = { metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || null, ga4MeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null };
  return (Object.keys(REGION_LABEL) as (keyof typeof REGION_LABEL)[]).flatMap((scope) => {
    const t = resolveTracking(bundle, scope, legacy);
    return [
      { scope, tool: "meta" as const, id: t.metaPixelId, origin: t.origin.meta },
      { scope, tool: "ga4" as const, id: t.ga4MeasurementId, origin: t.origin.ga4 },
    ];
  });
}

const describeEffective = (id: string | null, origin: TrackingOrigin) => (id ? `${id} (${ORIGIN_LABEL[origin]})` : `nenhum (${ORIGIN_LABEL[origin]})`);

/**
 * What a publish would change in the EFFECTIVE tracking of any region (lines for the owner to confirm). Empty when no region's effective
 * ID changes: an ordinary content publish never asks. Changing the global ID, or a region's choice, lists every region
 * it touches, because inheritance moves several regions at once.
 */
export function trackingChanges(before: PublishedBundle | null, after: PublishedBundle): string[] {
  const was = effectiveTable(before);
  return effectiveTable(after).flatMap((row, i) => {
    const prev = was[i];
    if (prev.id === row.id) return []; // only a different ID matters to production traffic; a change of origin alone (e.g. legacy → own with the same ID) is not a change
    return [`${REGION_LABEL[row.scope]} · ${TOOL_LABEL[row.tool]}: ${describeEffective(prev.id, prev.origin)} → ${describeEffective(row.id, row.origin)}`];
  });
}

/** Publish pre-flight: strict bundle validation, every INK collection section still resolves, readable text. (Tracking is confirmed separately.) */
export async function preflight(deps: Pick<PublishDeps, "releases" | "media">, doc: ScopeDoc): Promise<string[]> {
  const bundle = await composeBundle(deps, doc, "preflight");
  const strict = validateBundle(bundle);
  return [...(strict.ok ? [] : strict.errors), ...collectionProblems(doc), ...readabilityProblems(doc)];
}

/** The tracking lines this draft would change, versus what is live now (or nothing published yet). */
export async function pendingTrackingChanges(deps: Pick<PublishDeps, "releases" | "media">, doc: ScopeDoc): Promise<string[]> {
  const head = await deps.releases.head();
  return trackingChanges(head?.bundle ?? null, await composeBundle(deps, doc, "preflight"));
}

/** `confirmTracking`: the person confirmed the effective tracking IDs listed by `pendingTrackingChanges` (required only when there are changes). */
export type PublishRequest = { kind: "publish"; doc: ScopeDoc; note?: string; confirmTracking?: boolean } | { kind: "rollback"; toReleaseId: string; scope?: Scope; note?: string; confirmTracking?: boolean };
export type PublishResult = { ok: true; outcome: PublishOutcome } | { ok: false; errors: string[] };

export async function publishRelease(deps: PublishDeps, request: PublishRequest, revalidate: () => Promise<void>): Promise<PublishResult> {
  let compose: (id: string) => Promise<PublishedBundle>;
  let sections = 0;
  let scopesChanged: string[];
  if (request.kind === "publish") {
    const errors = await preflight(deps, request.doc);
    if (errors.length > 0) return { ok: false, errors };
    const changes = await pendingTrackingChanges(deps, request.doc);
    if (changes.length > 0 && !request.confirmTracking) return { ok: false, errors: ["Esta publicação muda o rastreamento efetivo. Confirme os IDs listados na tela Publicar antes de publicar.", ...changes] };
    compose = (id) => composeBundle(deps, request.doc, id);
    sections = request.doc.home?.sections.filter((s) => s.active).length ?? 0;
    scopesChanged = [request.doc.scope];
  } else {
    const old = await deps.releases.restorable(request.toReleaseId);
    if (!old) return { ok: false, errors: [`a versão ${request.toReleaseId} não existe ou nunca esteve no ar`] };
    const head = await deps.releases.head();
    const scope = request.scope;
    // Per region: only that region's document (and the media it needs) comes back from the old release; every other region keeps the
    // state it has NOW. Without a scope the whole old bundle is restored (kept for old callers).
    const restored = (id: string): PublishedBundle => {
      if (!scope) return { ...old, releaseId: id };
      const base = head?.bundle ?? seedForEnv();
      return { ...base, releaseId: id, docs: { ...base.docs, [scope]: old.docs[scope] }, media: { ...base.media, ...old.media } };
    };
    const composed = restored(request.toReleaseId);
    const strict = validateBundle(composed);
    if (!strict.ok) return { ok: false, errors: strict.errors };
    const changes = trackingChanges(head?.bundle ?? null, composed);
    if (changes.length > 0 && !request.confirmTracking) return { ok: false, errors: ["Restaurar esta versão muda o rastreamento efetivo. Confirme os IDs listados antes de restaurar.", ...changes] };
    compose = async (id) => restored(id);
    sections = (scope ? old.docs[scope] : old.docs.sul)?.home?.sections.filter((s) => s.active).length ?? 0;
    scopesChanged = [scope ?? "sul"];
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
