import "server-only";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { bundleChecksum } from "../site-config/checksum";
import { publish, reconcile, type FileState, type PublishOutcome, type PublishPorts, type ReleaseRecord } from "../site-config/publish-flow";
import { resolveTracking, type TrackingOrigin } from "../site-config/resolve";
import { mediaRefsOfDoc, validateBundle, type Customizer, type Destination, type MediaAssetInfo, type Page, type PublishedBundle, type Scope, type ScopeDoc, type Section } from "../site-config/schema";
import { REGION_SLUGS } from "../geo/regions";
import { themeProblems } from "../site-config/navigation";
import { pageAsHomeDoc } from "../site-config/pages";
import { buildSeedBundle } from "../site-config/seed";
import { readJson, withLock, writeJsonAtomic } from "./local-store";
import { collectionProblems, customizerProblems, pageGroundProblems, readabilityProblems } from "./validate-draft";
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
/**
 * What a publish publishes. Pages and personalization models live in the region's document but are published on their own:
 *   region     the home, tracking, launch flag and collection settings; pages and models stay exactly as they are PUBLISHED now;
 *   page       ONE page (and the collection settings its sections need); the home, the other pages and the models stay as published;
 *   customizer ONE model; everything else stays as published.
 */
export type PublishTarget = { kind: "region" } | { kind: "page"; id: string } | { kind: "customizer"; id: string };
export const REGION_TARGET: PublishTarget = { kind: "region" };

const without = <T extends object, K extends string>(o: T, ...keys: K[]): Omit<T, K> => {
  const copy = { ...o } as Record<string, unknown>;
  for (const k of keys) delete copy[k];
  return copy as Omit<T, K>;
};
const upsert = <T extends { id: string }>(list: T[] | undefined, item: T): T[] => {
  const rest = list ?? [];
  return rest.some((x) => x.id === item.id) ? rest.map((x) => (x.id === item.id ? item : x)) : [...rest, item];
};

/** The region document a publish of `target` produces: the PUBLISHED document with only the target's part replaced by the draft's. Pure. */
export function composeDoc(published: ScopeDoc, draft: ScopeDoc, target: PublishTarget): ScopeDoc {
  if (target.kind === "region") {
    const rest = without(draft, "pages", "customizers");
    return { ...rest, ...(published.pages ? { pages: published.pages } : {}), ...(published.customizers ? { customizers: published.customizers } : {}) };
  }
  const withCollections = (doc: ScopeDoc): ScopeDoc => (draft.collections ? { ...doc, collections: draft.collections } : doc);
  if (target.kind === "page") {
    const page = draft.pages?.find((p) => p.id === target.id);
    if (!page) throw new Error("a página não existe no rascunho");
    const live = published.pages?.find((p) => p.id === target.id);
    const next: Page = { ...page, version: (live?.version ?? 0) + 1 };
    return withCollections({ ...published, pages: upsert(published.pages, next) });
  }
  const model = draft.customizers?.find((m) => m.id === target.id);
  if (!model) throw new Error("o modelo não existe no rascunho");
  const live = published.customizers?.find((m) => m.id === target.id);
  const next: Customizer = { ...model, version: (live?.version ?? 0) + 1 };
  return withCollections({ ...published, customizers: upsert(published.customizers, next) });
}

/**
 * The bundle for the draft: what is live now (or the seed) for every scope except the edited one, plus the media the draft references.
 * Other scopes are carried over from the live head, never regenerated, so editing Sul cannot alter another region's published state.
 */
export async function composeBundle(deps: Pick<PublishDeps, "releases" | "media">, doc: ScopeDoc, releaseId: string, target: PublishTarget = REGION_TARGET): Promise<PublishedBundle> {
  const seed = seedForEnv();
  const head = await deps.releases.head();
  const base = head?.bundle ?? seed;
  const published = (base.docs[doc.scope] ?? seed.docs[doc.scope]) as ScopeDoc;
  const out = composeDoc(published, doc, target);
  const ids = new Set(mediaRefsOfDoc(out).map((r) => r.assetId));
  return { schemaVersion: 1, releaseId, docs: { ...base.docs, [doc.scope]: out }, media: { ...seed.media, ...base.media, ...(await deps.media(ids)) } };
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

/** Links and cards of these sections must point at things that are LIVE in the composed document (never at a draft, an archived page or a missing model). */
export function linkProblems(composed: ScopeDoc, sections: Section[]): string[] {
  const out: string[] = [];
  for (const s of sections) {
    if (!s.active) continue;
    const name = `"${s.title ?? s.id}"`;
    const links: [string, Destination | undefined][] = [["o botão", s.cta?.dest], ["o botão", s.nav?.dest], ...(s.tiles ?? []).map((t): [string, Destination] => [`o bloco "${t.label}"`, t.dest])];
    for (const [what, dest] of links) {
      if (dest?.kind !== "page") continue;
      const page = composed.pages?.find((p) => p.kind === dest.pageKind && p.slug === dest.slug);
      if (!page) out.push(`${name}: ${what} leva à página "${dest.slug}", que não existe ou ainda não foi publicada. Publique a página antes.`);
      else if (page.archived) out.push(`${name}: ${what} leva à página "${dest.slug}", que está arquivada.`);
    }
    if (s.customizerCard) {
      const model = composed.customizers?.find((m) => m.id === s.customizerCard!.customizerId);
      if (!model) out.push(`${name}: o modelo de personalização do primeiro card ainda não foi publicado. Publique o modelo antes.`);
      else if (!model.active) out.push(`${name}: o modelo "${model.name}" do primeiro card está desativado.`);
      else if (!model.pageMockup) out.push(`${name}: o modelo "${model.name}" não tem a imagem (mockup) da página.`);
    }
  }
  return out;
}

/** A palette whose text is practically unreadable (under 3:1) never ships; under AA it only warns in the editor. For the global scope, every region that inherits it is checked. */
export function themeBlockers(bundle: PublishedBundle, scope: Scope): string[] {
  const doc = bundle.docs[scope];
  if (!doc?.theme) return [];
  const inheriting = REGION_SLUGS.filter((r) => bundle.docs[r]?.theme?.mode === "inherit");
  return themeProblems(scope, doc, bundle.docs.global, inheriting).blocking.map((m) => `Aparência: ${m}`);
}

/** Publish pre-flight: strict bundle validation, every INK collection section still resolves, readable text, live links. (Tracking is confirmed separately.) */
export async function preflight(deps: Pick<PublishDeps, "releases" | "media">, doc: ScopeDoc, target: PublishTarget = REGION_TARGET): Promise<string[]> {
  let bundle: PublishedBundle;
  try {
    bundle = await composeBundle(deps, doc, "preflight", target);
  } catch (error) {
    return [error instanceof Error ? error.message : "não foi possível montar a publicação"];
  }
  const strict = validateBundle(bundle);
  const composed = bundle.docs[doc.scope];
  const problems = strict.ok ? [] : strict.errors;
  if (target.kind === "region") return [...problems, ...collectionProblems(doc), ...readabilityProblems(doc), ...linkProblems(composed, doc.home?.sections ?? []), ...themeBlockers(bundle, doc.scope)];
  if (target.kind === "page") {
    const page = composed.pages!.find((p) => p.id === target.id)!;
    const asHome = pageAsHomeDoc(composed, page);
    return [...problems, ...collectionProblems(asHome), ...readabilityProblems(asHome), ...pageGroundProblems(page), ...linkProblems(composed, page.sections)];
  }
  const model = composed.customizers!.find((m) => m.id === target.id)!;
  return [...problems, ...customizerProblems(composed, model)];
}

/** The tracking lines this draft would change, versus what is live now (or nothing published yet). */
export async function pendingTrackingChanges(deps: Pick<PublishDeps, "releases" | "media">, doc: ScopeDoc, target: PublishTarget = REGION_TARGET): Promise<string[]> {
  const head = await deps.releases.head();
  return trackingChanges(head?.bundle ?? null, await composeBundle(deps, doc, "preflight", target));
}

/** The history marker of a page / model publish (`page:hotpage/dia-dos-pais`, `customizer:pai-paranaense`): what lets the screens list "the versions of THIS page". */
export function targetMarker(doc: ScopeDoc, target: PublishTarget): string[] {
  if (target.kind === "page") {
    const p = doc.pages?.find((x) => x.id === target.id);
    return p ? [`page:${p.kind}/${p.slug}`] : [];
  }
  if (target.kind === "customizer") {
    const m = doc.customizers?.find((x) => x.id === target.id);
    return m ? [`customizer:${m.slug}`] : [];
  }
  return [];
}

/** `confirmTracking`: the person confirmed the effective tracking IDs listed by `pendingTrackingChanges` (required only when there are changes). */
export type PublishRequest = { kind: "publish"; doc: ScopeDoc; note?: string; confirmTracking?: boolean; target?: PublishTarget } | { kind: "rollback"; toReleaseId: string; scope?: Scope; note?: string; confirmTracking?: boolean; target?: PublishTarget };
export type PublishResult = { ok: true; outcome: PublishOutcome } | { ok: false; errors: string[] };

export async function publishRelease(deps: PublishDeps, request: PublishRequest, revalidate: () => Promise<void>): Promise<PublishResult> {
  let compose: (id: string) => Promise<PublishedBundle>;
  let sections = 0;
  let scopesChanged: string[];
  if (request.kind === "publish") {
    const target = request.target ?? REGION_TARGET;
    const errors = await preflight(deps, request.doc, target);
    if (errors.length > 0) return { ok: false, errors };
    const changes = await pendingTrackingChanges(deps, request.doc, target);
    if (changes.length > 0 && !request.confirmTracking) return { ok: false, errors: ["Esta publicação muda o rastreamento efetivo. Confirme os IDs listados na tela Publicar antes de publicar.", ...changes] };
    compose = (id) => composeBundle(deps, request.doc, id, target);
    sections = target.kind === "page" ? (request.doc.pages?.find((p) => p.id === target.id)?.sections.filter((s) => s.active).length ?? 0) : request.doc.home?.sections.filter((s) => s.active).length ?? 0;
    scopesChanged = [request.doc.scope, ...targetMarker(request.doc, target)];
  } else {
    const old = await deps.releases.restorable(request.toReleaseId);
    if (!old) return { ok: false, errors: [`a versão ${request.toReleaseId} não existe ou nunca esteve no ar`] };
    const head = await deps.releases.head();
    const scope = request.scope;
    const target = request.target ?? REGION_TARGET;
    if (scope && target.kind !== "region") {
      const oldDoc = old.docs[scope];
      if (target.kind === "page" && !oldDoc?.pages?.some((p) => p.id === target.id)) return { ok: false, errors: ["essa versão não continha esta página"] };
      if (target.kind === "customizer" && !oldDoc?.customizers?.some((m) => m.id === target.id)) return { ok: false, errors: ["essa versão não continha este modelo"] };
    }
    // Per region: only that region's document (and the media it needs) comes back from the old release; every other region keeps the
    // state it has NOW. Without a scope the whole old bundle is restored (kept for old callers). Within a region the home, each page and each
    // model are restored separately: restoring the home never touches the pages or the models, and restoring a page never touches the home.
    const restored = (id: string): PublishedBundle => {
      if (!scope) return { ...old, releaseId: id };
      const base = head?.bundle ?? seedForEnv();
      const current = base.docs[scope];
      const oldDoc = old.docs[scope];
      let doc: ScopeDoc;
      if (target.kind === "region") doc = composeDoc(current, { ...oldDoc, pages: undefined, customizers: undefined } as ScopeDoc, REGION_TARGET);
      else if (target.kind === "page") doc = { ...current, pages: upsert(current.pages, { ...oldDoc.pages!.find((p) => p.id === target.id)!, version: (current.pages?.find((p) => p.id === target.id)?.version ?? 0) + 1 }) };
      else doc = { ...current, customizers: upsert(current.customizers, { ...oldDoc.customizers!.find((m) => m.id === target.id)!, version: (current.customizers?.find((m) => m.id === target.id)?.version ?? 0) + 1 }) };
      return { ...base, releaseId: id, docs: { ...base.docs, [scope]: doc }, media: { ...base.media, ...old.media } };
    };
    const composed = restored(request.toReleaseId);
    const strict = validateBundle(composed);
    if (!strict.ok) return { ok: false, errors: strict.errors };
    const changes = trackingChanges(head?.bundle ?? null, composed);
    if (changes.length > 0 && !request.confirmTracking) return { ok: false, errors: ["Restaurar esta versão muda o rastreamento efetivo. Confirme os IDs listados antes de restaurar.", ...changes] };
    compose = async (id) => restored(id);
    sections = (scope ? old.docs[scope] : old.docs.sul)?.home?.sections.filter((s) => s.active).length ?? 0;
    scopesChanged = [scope ?? "sul", ...(scope ? targetMarker(old.docs[scope], target) : [])];
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
    async list(limit, offset = 0) {
      return (await read()).releases.slice().reverse().slice(offset, offset + limit).map(view);
    },
    async count() {
      return (await read()).releases.length;
    },
    remove: (id) =>
      withLock(async () => {
        const ledger = await read();
        const release = ledger.releases.find((r) => r.id === id);
        if (!release) return { ok: false as const, error: "versão não encontrada" };
        if (ledger.headId === id) return { ok: false as const, error: "a versão que está no ar não pode ser apagada" };
        if (release.status === "pending") return { ok: false as const, error: "há uma publicação em andamento com esta versão" };
        ledger.releases = ledger.releases.filter((r) => r.id !== id);
        await writeJsonAtomic(ledgerPath, ledger);
        await rm(bundleFile(id), { force: true });
        return { ok: true as const };
      }),
    async reconcileState() {
      const ledger = await read();
      return { head: ledger.releases.find((r) => r.id === ledger.headId) ?? null, pending: ledger.releases.filter((r) => r.status === "pending"), headRevalidated: ledger.headRevalidated };
    },
  };
}
