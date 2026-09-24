import "server-only";
import { bundleChecksum } from "../site-config/checksum";
import type { ScopeDoc } from "../site-config/schema";
import { buildSeedBundle } from "../site-config/seed";
import { applyOp, type DraftOp } from "./draft-ops";
import { fileDraftRepository, type DraftRecord } from "./local-store";
import { currentPublished } from "./sandbox-publish";
import { randomBytes } from "node:crypto";

/** The one place the screens and actions read and write the working draft of a scope. Sul only in this round. */
const repo = () => fileDraftRepository();
export const SCOPE = "sul" as const;

export type Workspace = {
  record: DraftRecord | null;
  /** The document being edited: the saved draft, or (when nothing was saved yet) the published/seed one. */
  doc: ScopeDoc;
  /** What the sandbox has published for this scope, or the seed when nothing was published. */
  baseDoc: ScopeDoc;
  publishedReleaseId: string | null;
  /** The draft differs from what is published. */
  dirty: boolean;
};

export async function loadWorkspace(): Promise<Workspace> {
  const published = await currentPublished();
  const seed = buildSeedBundle({ metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || null, ga4MeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || null });
  const baseDoc = (published?.docs[SCOPE] ?? seed.docs[SCOPE]) as ScopeDoc;
  const record = await repo().load(SCOPE);
  const doc = record?.doc ?? baseDoc;
  return { record, doc, baseDoc, publishedReleaseId: published?.releaseId ?? null, dirty: bundleChecksum(doc) !== bundleChecksum(baseDoc) };
}

export type SaveOutcome = { ok: true; focusId?: string } | { ok: false; errors: string[]; conflict?: boolean };

/** Applies one op to the working draft and saves it with the optimistic lock (`expectedRev` is what the form was rendered with). */
export async function applyAndSave(op: DraftOp, expectedRev: number | null): Promise<SaveOutcome> {
  const ws = await loadWorkspace();
  if ((ws.record?.rev ?? null) !== expectedRev) return { ok: false, conflict: true, errors: ["O rascunho mudou em outra aba. Recarregue a página e tente de novo."] };
  const result = applyOp(ws.doc, op, { newId: () => randomBytes(4).toString("hex") });
  if (!result.ok) return { ok: false, errors: result.errors };
  const saved = await repo().save(SCOPE, result.doc, expectedRev, ws.publishedReleaseId);
  if (!saved.ok) return { ok: false, conflict: true, errors: ["O rascunho mudou em outra aba. Recarregue a página e tente de novo."] };
  return { ok: true, focusId: result.focusId };
}

/** Throws the draft away: the editor goes back to what is published (or to the seed). */
export async function discardDraft(): Promise<void> {
  await repo().discard(SCOPE);
}
