import type { ScopeDoc, Section } from "../site-config/schema";

/** Human-readable differences between the published document and the draft (section level). Pure; used by the publish screen. */
export type Change = { kind: "added" | "removed" | "moved" | "activated" | "deactivated" | "edited"; sectionId: string; text: string };

const label = (s: Section) => s.title ?? s.anchor;
const json = (v: unknown) => JSON.stringify(v ?? null);

const EDITED_FIELDS: [keyof Section, string][] = [
  ["title", "título"], ["subtitle", "subtítulo"], ["cta", "botão/link"], ["source", "fonte"], ["layout", "layout"], ["appearance", "aparência"], ["fallback", "alternativa sem imagem"],
];

export function diffDocs(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const before = published.home?.sections ?? [];
  const after = draft.home?.sections ?? [];
  const changes: Change[] = [];
  const beforeIds = new Set(before.map((s) => s.id));
  const afterIds = new Set(after.map((s) => s.id));
  for (const s of after) if (!beforeIds.has(s.id)) changes.push({ kind: "added", sectionId: s.id, text: `Nova seção "${label(s)}"` });
  for (const s of before) if (!afterIds.has(s.id)) changes.push({ kind: "removed", sectionId: s.id, text: `Seção removida "${label(s)}"` });
  // Order among the sections both sides have.
  const common = (list: Section[], other: Set<string>) => list.filter((s) => other.has(s.id)).map((s) => s.id);
  const orderBefore = common(before, afterIds);
  const orderAfter = common(after, beforeIds);
  for (const [i, id] of orderAfter.entries()) {
    if (orderBefore[i] !== id) {
      const s = after.find((x) => x.id === id)!;
      changes.push({ kind: "moved", sectionId: id, text: `"${label(s)}" mudou de posição (agora ${after.findIndex((x) => x.id === id) + 1}ª)` });
    }
  }
  for (const s of after) {
    const old = before.find((x) => x.id === s.id);
    if (!old) continue;
    if (old.active !== s.active) changes.push({ kind: s.active ? "activated" : "deactivated", sectionId: s.id, text: `"${label(s)}" ${s.active ? "foi ativada" : "foi ocultada"}` });
    const edited = EDITED_FIELDS.filter(([key]) => json(old[key]) !== json(s[key])).map(([, name]) => name);
    if (edited.length > 0) changes.push({ kind: "edited", sectionId: s.id, text: `"${label(s)}": ${edited.join(", ")}` });
  }
  return changes;
}
