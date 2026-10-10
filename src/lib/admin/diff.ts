import { effectiveNavbarGroups } from "../site-config/navbar-groups";
import { NAV_DESTINATION_LABEL, THEME_COLOR_KEYS, THEME_COLOR_LABEL, type NavBlockConfig } from "../site-config/navigation";
import type { PromotionItem } from "../site-config/promotions-schema";
import type { CollectionRef, ScopeDoc, Section } from "../site-config/schema";

/** Human-readable differences between the published document and the draft (section level). Pure; used by the publish screen. */
export type Change = { kind: "added" | "removed" | "moved" | "activated" | "deactivated" | "edited" | "navbar-added" | "navbar-removed" | "navbar-moved" | "navigation" | "theme" | "promotions"; sectionId: string; text: string };

const label = (s: Section) => s.title ?? s.anchor;
const json = (v: unknown) => JSON.stringify(v ?? null);

const EDITED_FIELDS: [keyof Section, string][] = [
  ["title", "título"], ["subtitle", "subtítulo"], ["cta", "botão/link"], ["source", "fonte"], ["layout", "layout"], ["appearance", "aparência"], ["featured", "produtos em destaque do hero"], ["count", "quantidade de estilos"], ["stateCovers", "banners dos estados"], ["nav", "menu do topo"], ["fallback", "alternativa sem imagem"], ["tiles", "blocos da grade"], ["grid", "layout da grade"],
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
  // Same reason for the menu and the palette: they belong to the document, not to a section.
  changes.push(...navigationChanges(published, draft), ...themeChanges(published, draft), ...promotionChanges(published, draft));
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

const BLOCK_NAME = { primaryBlock: "Comprar", statesBlock: "Estados da região", regionsBlock: "Outras regiões" } as const;
const blockText = (b: NavBlockConfig | undefined) => (b ? `"${b.label}", posição ${b.order}, ${b.visible ? "visível" : "oculto"}` : "padrão");

/** What changed in the region's menu configuration (blocks and known links). Pure. */
function navigationChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const before = published.navigation;
  const after = draft.navigation;
  if (json(before) === json(after)) return [];
  const out: Change[] = [];
  for (const key of ["primaryBlock", "statesBlock", "regionsBlock"] as const) {
    if (json(before?.[key]) !== json(after?.[key])) out.push({ kind: "navigation", sectionId: `navigation:${key}`, text: `Navegação, bloco ${BLOCK_NAME[key]}: ${blockText(before?.[key])} → ${blockText(after?.[key])}` });
  }
  for (const destination of ["styles", "speech", "states"] as const) {
    const was = before?.primaryLinks?.find((l) => l.destination === destination);
    const now = after?.primaryLinks?.find((l) => l.destination === destination);
    if (json(was) !== json(now)) out.push({ kind: "navigation", sectionId: `navigation:link:${destination}`, text: `Navegação, link ${NAV_DESTINATION_LABEL[destination]}: ${blockText(was)} → ${blockText(now)}` });
  }
  return out;
}

const modeText = (doc: ScopeDoc): string => (doc.theme ? (doc.theme.mode === "inherit" ? "herda a paleta da Use Origens" : "paleta própria") : "visual atual (sem configuração)");

/** What changed in the palette: the mode, and each colour that was set, changed or cleared. Pure. */
function themeChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  if (json(published.theme) === json(draft.theme)) return [];
  const who = draft.scope === "global" ? "Aparência global (Use Origens)" : "Aparência";
  const out: Change[] = [];
  if (draft.scope !== "global" && published.theme?.mode !== draft.theme?.mode) out.push({ kind: "theme", sectionId: "theme:mode", text: `${who}: ${modeText(published)} → ${modeText(draft)}` });
  for (const key of THEME_COLOR_KEYS) {
    const was = published.theme?.colors[key];
    const now = draft.theme?.colors[key];
    if (was !== now) out.push({ kind: "theme", sectionId: `theme:${key}`, text: `${who}, ${THEME_COLOR_LABEL[key].toLowerCase()}: ${was ?? "padrão"} → ${now ?? "padrão"}` });
  }
  return out;
}

const promoName = (p: PromotionItem) => `${p.type === "coupon" ? "cupom" : "promoção"} "${p.title}"`;

/** What changed in "Cupons e promoções": items added, removed, switched on/off, edited, and a new order. Pure. */
function promotionChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const before = published.promotions?.items ?? [];
  const after = draft.promotions?.items ?? [];
  if (json(before) === json(after)) return [];
  const out: Change[] = [];
  const was = new Map(before.map((p) => [p.id, p]));
  const now = new Map(after.map((p) => [p.id, p]));
  for (const p of after) {
    const old = was.get(p.id);
    const id = `promotions:${p.id}`;
    if (!old) out.push({ kind: "promotions", sectionId: id, text: `Cupons e promoções: ${promoName(p)} adicionado${p.enabled ? "" : " (desativado)"}` });
    else {
      if (old.enabled !== p.enabled) out.push({ kind: "promotions", sectionId: id, text: `Cupons e promoções: ${promoName(p)} ${p.enabled ? "ativado" : "desativado"}` });
      const { enabled: _a, order: _b, ...restOld } = old;
      const { enabled: _c, order: _d, ...restNew } = p;
      void _a; void _b; void _c; void _d;
      if (json(restOld) !== json(restNew)) out.push({ kind: "promotions", sectionId: id, text: `Cupons e promoções: ${promoName(p)} editado` });
    }
  }
  for (const p of before) if (!now.has(p.id)) out.push({ kind: "promotions", sectionId: `promotions:${p.id}`, text: `Cupons e promoções: ${promoName(p)} removido` });
  const order = (list: PromotionItem[]) => json([...list].sort((a, b) => a.order - b.order).map((p) => p.id).filter((id) => was.has(id) && now.has(id)));
  if (order(before) !== order(after)) out.push({ kind: "promotions", sectionId: "promotions:order", text: "Cupons e promoções: nova ordem" });
  return out;
}
