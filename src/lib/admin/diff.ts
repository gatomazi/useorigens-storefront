import type { CollectionRef, ScopeDoc, Section } from "../site-config/schema";

/** Human-readable differences between the published document and the draft (section level). Pure; used by the publish screen. */
export type Change = { kind: "added" | "removed" | "moved" | "activated" | "deactivated" | "edited" | "navbar-added" | "navbar-removed"; sectionId: string; text: string };

const label = (s: Section) => s.title ?? s.anchor;
const json = (v: unknown) => JSON.stringify(v ?? null);

const EDITED_FIELDS: [keyof Section, string][] = [
  ["title", "título"], ["subtitle", "subtítulo"], ["cta", "botão/link"], ["source", "fonte"], ["layout", "layout"], ["appearance", "aparência"], ["featured", "produtos em destaque do hero"], ["count", "quantidade de estilos"], ["nav", "menu do topo"], ["fallback", "alternativa sem imagem"],
];

/** Name of an INK collection for the publish screen (injected: this module stays pure). */
export type CollectionNamer = (ref: CollectionRef) => string | null;

export function diffDocs(published: ScopeDoc, draft: ScopeDoc, nameOf: CollectionNamer = () => null): Change[] {
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
  // The INK navbar list is part of the document but not of any section: without this, changing only the navbar would read "nothing to publish".
  const key = (r: CollectionRef) => `${r.store}:${r.collectionId}`;
  const navBefore = new Map((published.collections?.navbar ?? []).map((r) => [key(r), r]));
  const navAfter = new Map((draft.collections?.navbar ?? []).map((r) => [key(r), r]));
  const named = (r: CollectionRef) => `"${nameOf(r) ?? `coleção #${r.collectionId}`}"`;
  for (const [k, r] of navAfter) if (!navBefore.has(k)) changes.push({ kind: "navbar-added", sectionId: `navbar:${k}`, text: `${named(r)} passa a aparecer na navbar da INK` });
  for (const [k, r] of navBefore) if (!navAfter.has(k)) changes.push({ kind: "navbar-removed", sectionId: `navbar:${k}`, text: `${named(r)} sai da navbar da INK` });
  return changes;
}
