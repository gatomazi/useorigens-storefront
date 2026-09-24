import "server-only";
import { randomBytes } from "node:crypto";
import { bundleChecksum } from "../site-config/checksum";
import type { ScopeDoc } from "../site-config/schema";
import { applyOp, type DraftOp } from "./draft-ops";
import { platform } from "./platform";
import { seedForEnv } from "./publishing";
import type { Actor, DraftRecord } from "./store/ports";

/** The one place the screens and actions read and write the working draft of a scope. Sul only in this round. */
export const SCOPE = "sul" as const;

export type Workspace = {
  record: DraftRecord | null;
  /** The document being edited: the saved draft, or (when nothing was saved yet) the published/seed one. */
  doc: ScopeDoc;
  /** What is published for this scope, or the seed when nothing was published. */
  baseDoc: ScopeDoc;
  publishedReleaseId: string | null;
  /** The draft differs from what is published. */
  dirty: boolean;
};

export async function loadWorkspace(): Promise<Workspace> {
  const { drafts, files } = platform();
  const published = await files.read();
  const baseDoc = (published?.docs[SCOPE] ?? seedForEnv().docs[SCOPE]) as ScopeDoc;
  const record = await drafts.load(SCOPE);
  const doc = record?.doc ?? baseDoc;
  return { record, doc, baseDoc, publishedReleaseId: published?.releaseId ?? null, dirty: bundleChecksum(doc) !== bundleChecksum(baseDoc) };
}

export type SaveOutcome = { ok: true; focusId?: string } | { ok: false; errors: string[]; conflict?: boolean };

/** Applies one op to the working draft and saves it with the optimistic lock (`expectedRev` is what the form was rendered with). */
export async function applyAndSave(op: DraftOp, expectedRev: number | null, actor: Actor | null): Promise<SaveOutcome> {
  const ws = await loadWorkspace();
  const conflict = { ok: false as const, conflict: true, errors: ["O rascunho mudou em outra aba. Recarregue a página e tente de novo."] };
  if ((ws.record?.rev ?? null) !== expectedRev) return conflict;
  const result = applyOp(ws.doc, op, { newId: () => randomBytes(4).toString("hex") });
  if (!result.ok) return { ok: false, errors: result.errors };
  const saved = await platform().drafts.save(SCOPE, result.doc, expectedRev, ws.publishedReleaseId, actor?.id ?? null);
  if (!saved.ok) return conflict;
  return { ok: true, focusId: result.focusId };
}

/** Throws the draft away: the editor goes back to what is published (or to the seed). */
export async function discardDraft(): Promise<void> {
  await platform().drafts.discard(SCOPE);
}
