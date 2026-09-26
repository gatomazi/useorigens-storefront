import { effectiveNavbarGroups } from "../site-config/navbar-groups";
import type { CollectionRef, ScopeDoc, Section } from "../site-config/schema";

/** Human-readable differences between the published document and the draft (section level). Pure; used by the publish screen. */
export type Change = { kind: "added" | "removed" | "moved" | "activated" | "deactivated" | "edited" | "navbar-added" | "navbar-removed" | "navbar-moved"; sectionId: string; text: string };

const label = (s: Section) => s.title ?? s.anchor;
const json = (v: unknown) => JSON.stringify(v ?? null);

const EDITED_FIELDS: [keyof Section, string][] = [
  ["title", "título"], ["subtitle", "subtítulo"], ["cta", "botão/link"], ["source", "fonte"], ["layout", "layout"], ["appearance", "aparência"], ["featured", "produtos em destaque do hero"], ["count", "quantidade de estilos"], ["fallback", "alternativa sem imagem"],
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
  // The INK navbar groups are part of the document but not of any section: without this, changing only the navbar would read "nothing to publish".
  changes.push(...navbarChanges(published, draft, nameOf));
  return changes;
}

const GROUP_LABEL = { top: "no topo da navbar da INK", more: "em Demais categorias da navbar da INK" } as const;

/** What changed in the navbar groups between two documents: entering, leaving, changing group, and changing order inside a group. Pure. */
function navbarChanges(published: ScopeDoc, draft: ScopeDoc, nameOf: CollectionNamer): Change[] {
  const before = effectiveNavbarGroups(published).groups;
  const after = effectiveNavbarGroups(draft).groups;
  const key = (r: CollectionRef) => `${r.store}:${r.collectionId}`;
  const where = (g: typeof before) => new Map<string, { ref: CollectionRef; group: "top" | "more"; index: number }>([...g.top.map((ref, index) => [key(ref), { ref, group: "top" as const, index }] as const), ...g.more.map((ref, index) => [key(ref), { ref, group: "more" as const, index }] as const)]);
  const was = where(before);
  const now = where(after);
  const named = (r: CollectionRef) => `"${nameOf(r) ?? `coleção #${r.collectionId}`}"`;
  const out: Change[] = [];
  for (const [k, n] of now) {
    const w = was.get(k);
    if (!w) out.push({ kind: "navbar-added", sectionId: `navbar:${k}`, text: `${named(n.ref)} passa a aparecer ${GROUP_LABEL[n.group]}` });
    else if (w.group !== n.group) out.push({ kind: "navbar-moved", sectionId: `navbar:${k}`, text: `${named(n.ref)} muda para ${GROUP_LABEL[n.group]}` });
  }
  for (const [k, w] of was) if (!now.has(k)) out.push({ kind: "navbar-removed", sectionId: `navbar:${k}`, text: `${named(w.ref)} sai da navbar da INK` });
  // Order inside a group, among the collections that stay in it.
  for (const group of ["top", "more"] as const) {
    const stay = (g: typeof before, other: typeof before) => g[group].filter((r) => other[group].some((o) => key(o) === key(r))).map(key);
    const a = stay(before, after);
    const b = stay(after, before);
    if (a.join() !== b.join()) out.push({ kind: "navbar-moved", sectionId: `navbar:order:${group}`, text: `A ordem ${GROUP_LABEL[group]} mudou` });
  }
  return out;
}
