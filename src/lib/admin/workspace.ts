import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { bundleChecksum } from "../site-config/checksum";
import { hasHomeTheme, swapHomeTheme } from "../site-config/home-themes";
import { HOME_THEMES, homeThemeOf, type HomeThemeName, type Scope, type ScopeDoc } from "../site-config/schema";
import { applyOp, type DraftOp } from "./draft-ops";
import { platform } from "./platform";
import { seedForEnv } from "./publishing";
import type { Actor, DraftRecord } from "./store/ports";

/** The one place the screens and actions read and write the working draft of a scope (a region, or "global" for tracking). */

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

export async function loadWorkspace(scope: Scope): Promise<Workspace> {
  const { drafts, files } = platform();
  const published = await files.read();
  const baseDoc = (published?.docs[scope] ?? seedForEnv().docs[scope]) as ScopeDoc;
  const record = await drafts.load(scope);
  const doc = record?.doc ?? baseDoc;
  return { record, doc, baseDoc, publishedReleaseId: published?.releaseId ?? null, dirty: bundleChecksum(doc) !== bundleChecksum(baseDoc) };
}

export type SaveOutcome = { ok: true; focusId?: string } | { ok: false; errors: string[]; conflict?: boolean };

/** Applies one op to the working draft and saves it with the optimistic lock (`expectedRev` is what the form was rendered with). */
export async function applyAndSave(scope: Scope, op: DraftOp, expectedRev: number | null, actor: Actor | null): Promise<SaveOutcome> {
  const ws = await loadWorkspace(scope);
  const conflict = { ok: false as const, conflict: true, errors: ["O rascunho mudou em outra aba. Recarregue a página e tente de novo."] };
  if ((ws.record?.rev ?? null) !== expectedRev) return conflict;
  // Everything the panel edits goes to the home theme being edited (its sections and its palette); choosing or creating a theme is about the region itself.
  const editing = scope === "global" || op.type === "set-home-theme" || op.type === "create-home-theme" || op.type === "in-home-theme" ? null : await editingHomeTheme(ws.doc);
  const applied: DraftOp = editing && editing !== homeThemeOf(ws.doc) ? { type: "in-home-theme", theme: editing, op } : op;
  const result = applyOp(ws.doc, applied, { newId: () => randomBytes(4).toString("hex") });
  if (!result.ok) return { ok: false, errors: result.errors };
  const saved = await platform().drafts.save(scope, result.doc, expectedRev, ws.publishedReleaseId, actor?.id ?? null);
  if (!saved.ok) return conflict;
  return { ok: true, focusId: result.focusId };
}

/** The cookie that remembers which home theme the panel is editing (the region's own theme in use when absent or not set up). */
export const EDIT_THEME_COOKIE = "uo_admin_home_theme";

/** The home theme the panel is editing in this region: the one chosen in the panel, when the region has it; otherwise the one in use. */
export async function editingHomeTheme(doc: ScopeDoc): Promise<HomeThemeName> {
  let chosen: string | undefined;
  try {
    chosen = (await cookies()).get(EDIT_THEME_COOKIE)?.value;
  } catch {
    chosen = undefined; // outside a request (scripts): the theme in use
  }
  return (HOME_THEMES as readonly string[]).includes(chosen ?? "") && hasHomeTheme(doc, chosen as HomeThemeName) ? (chosen as HomeThemeName) : homeThemeOf(doc);
}

/**
 * The workspace as the home and appearance screens see it: the document with the theme being edited in use (its sections in `home`, its palette in
 * `theme`), the published one likewise. `activeTheme` is the theme in use in the draft (the one the store gets when the region is published).
 */
export async function loadEditorWorkspace(scope: Scope): Promise<Workspace & { editingTheme: HomeThemeName; activeTheme: HomeThemeName; liveTheme: HomeThemeName }> {
  const ws = await loadWorkspace(scope);
  const activeTheme = homeThemeOf(ws.doc);
  const liveTheme = homeThemeOf(ws.baseDoc);
  if (scope === "global") return { ...ws, editingTheme: activeTheme, activeTheme, liveTheme };
  const editingTheme = await editingHomeTheme(ws.doc);
  const doc = swapHomeTheme(ws.doc, editingTheme) ?? ws.doc;
  const baseDoc = swapHomeTheme(ws.baseDoc, editingTheme) ?? ws.baseDoc;
  return { ...ws, doc, baseDoc, editingTheme, activeTheme, liveTheme };
}

/** Throws the draft away: the editor goes back to what is published (or to the seed). */
export async function discardDraft(scope: Scope): Promise<void> {
  await platform().drafts.discard(scope);
}
