import { effectiveMenu, menuPositionOf, type MenuPosition } from "../site-config/collection-menu";
import { NAV_DESTINATION_LABEL, THEME_COLOR_KEYS, THEME_COLOR_LABEL, type NavBlockConfig } from "../site-config/navigation";
import { HEADER_ACTIONS, HEADER_ACTION_LABEL, headerActionsOf } from "../site-config/navigation-schema";
import { podioEnabledIn } from "../site-config/podio-schema";
import { INK_PRESET_LABEL, INK_SURFACE_LABEL, inkIncentiveText, inkThemeOf, INK_THEME_SURFACES, paletteOf } from "../site-config/ink-theme";
import { STATE_PAGE_SECTIONS, STATE_PAGE_SECTION_LABELS, statePageShows } from "../site-config/state-page-schema";
import type { PromotionItem } from "../site-config/promotions-schema";
import type { TopBarMessage } from "../site-config/top-bar-schema";
import { HOME_THEMES, homeThemeOf, type CollectionRef, type ScopeDoc, type Section } from "../site-config/schema";
import { HOME_THEME_LABEL, swapHomeTheme } from "../site-config/home-themes";
import { CARD_BUY_STYLE_NAME } from "../site-config/cards-schema";

/** Human-readable differences between the published document and the draft (section level). Pure; used by the publish screen. */
export type Change = { kind: "added" | "removed" | "moved" | "activated" | "deactivated" | "edited" | "navbar-added" | "navbar-removed" | "navbar-moved" | "navigation" | "theme" | "promotions" | "top-bar" | "podio" | "ink-theme"; sectionId: string; text: string };

const label = (s: Section) => s.title ?? s.anchor;
const json = (v: unknown) => JSON.stringify(v ?? null);

const EDITED_FIELDS: [keyof Section, string][] = [
  ["title", "título"], ["subtitle", "subtítulo"], ["cta", "botão/link"], ["source", "fonte"], ["layout", "layout"], ["appearance", "aparência"], ["featured", "produtos em destaque do hero"], ["featuredRotation", "alternância dos produtos do hero"], ["count", "quantidade de estilos"], ["stateCovers", "banners dos estados"], ["nav", "menu do topo"], ["fallback", "alternativa sem imagem"], ["tiles", "blocos da grade"], ["grid", "layout da grade"], ["variant", "composição"],
];

/** Name of an INK collection for the publish screen (injected: this module stays pure). */
export type CollectionNamer = (ref: CollectionRef) => string | null;
/** Whether an INK collection is public (injected too): it decides where a collection the menu does not mention sits. */
export type CollectionVisibility = (ref: CollectionRef) => boolean;

export function diffDocs(published: ScopeDoc, draft: ScopeDoc, nameOf: CollectionNamer = () => null, isPublic: CollectionVisibility = () => true): Change[] {
  // Sections and colours are compared with the SAME theme as published (switching themes is one line, not every section of both).
  const sameTheme = swapHomeTheme(published, homeThemeOf(draft)) ?? published;
  const before = sameTheme.home?.sections ?? [];
  const after = draft.home?.sections ?? [];
  const changes: Change[] = [];
  // The home's theme first: when it changes, every section below is the other theme's (the previous ones stay kept, not deleted).
  const themeWas = homeThemeOf(published);
  const themeNow = homeThemeOf(draft);
  if (themeWas !== themeNow) changes.push({ kind: "theme", sectionId: "home-theme", text: `Tema da home: ${HOME_THEME_LABEL[themeWas]} → ${HOME_THEME_LABEL[themeNow]} (as seções do ${HOME_THEME_LABEL[themeWas]} ficam guardadas)` });
  // A theme that is not on the store (kept) is published with the region too: say what changed in it, in one line.
  for (const name of HOME_THEMES) {
    if (name === themeNow) continue;
    const was = name === themeWas ? { sections: published.home?.sections ?? [], ...(published.theme ? { theme: published.theme } : {}) } : published.homeThemes?.[name];
    const now = draft.homeThemes?.[name];
    if (!now || json(was) === json(now)) continue;
    const parts = !was ? ["criado"] : [json(was.sections) !== json(now.sections) ? "seções alteradas" : "", json(was.theme) !== json(now.theme) ? "cores alteradas" : ""].filter(Boolean);
    changes.push({ kind: "theme", sectionId: `home-theme:${name}`, text: `Tema ${HOME_THEME_LABEL[name]} (fora da loja): ${parts.join(" e ")}` });
  }
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
  // The collection menu is part of the document but not of any section: without this, changing only the menu would read "nothing to publish".
  changes.push(...menuChanges(published, draft, nameOf, isPublic), ...arrangementChanges(published, draft, nameOf), ...stateRowsChanges(published, draft, nameOf));
  // Same reason for the menu and the palette: they belong to the document, not to a section.
  changes.push(...navigationChanges(published, draft), ...themeChanges(sameTheme, draft), ...promotionChanges(published, draft), ...topBarChanges(published, draft), ...cardsChanges(published, draft), ...carouselEndChanges(published, draft), ...mundoChanges(published, draft), ...podioChanges(published, draft), ...statePageChanges(published, draft), ...inkThemeChanges(published, draft));
  return changes;
}

/** The state page's hierarchy changed: its categories (the owner's list, in order, or back to the menu bar) or its subcategories (taken out, brought in). Pure. */
function stateRowsChanges(published: ScopeDoc, draft: ScopeDoc, nameOf: CollectionNamer): Change[] {
  const name = (r: CollectionRef) => nameOf(r) ?? `#${r.collectionId}`;
  const out: Change[] = [];
  const wasCategories = published.collections?.stateCategories;
  const nowCategories = draft.collections?.stateCategories;
  if (json(wasCategories) !== json(nowCategories)) {
    const text = nowCategories ? (nowCategories.length === 0 ? "nenhuma" : nowCategories.map(name).join(", ")) : "volta ao automático (as coleções do topo do menu)";
    out.push({ kind: "edited", sectionId: "state-categories", text: `Página do estado · categorias: ${text}` });
  }
  const key = (r: CollectionRef) => `${r.store}:${r.collectionId}`;
  const was = published.collections?.stateSubcategories ?? { hidden: [], added: [] };
  const now = draft.collections?.stateSubcategories ?? { hidden: [], added: [] };
  const newIn = (a: CollectionRef[], b: CollectionRef[]) => a.filter((r) => !b.some((x) => key(x) === key(r)));
  const lines: [CollectionRef[], string][] = [
    [newIn(now.hidden, was.hidden), "sai das subcategorias"],
    [newIn(was.hidden, now.hidden), "volta às subcategorias"],
    [newIn(now.added, was.added), "entra nas subcategorias (interna)"],
    [newIn(was.added, now.added), "sai das subcategorias (interna)"],
  ];
  for (const [refs, what] of lines) for (const r of refs) out.push({ kind: "edited", sectionId: "state-subcategories", text: `Página do estado: “${name(r)}” ${what}` });
  if (published.collections?.stateRows && !draft.collections?.stateRows) out.push({ kind: "edited", sectionId: "state-rows", text: "Página do estado: a lista antiga de carrosséis dá lugar às subcategorias automáticas" });
  return out;
}

/** A state-page section switched on or off. Pure. */
function statePageChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  return STATE_PAGE_SECTIONS.flatMap((section) => {
    const now = statePageShows(draft, section);
    if (statePageShows(published, section) === now) return [];
    return [{ kind: now ? ("activated" as const) : ("deactivated" as const), sectionId: `state-page-${section}`, text: `Página do estado: "${STATE_PAGE_SECTION_LABELS[section]}" ${now ? "volta a aparecer" : "sai da página"}` }];
  });
}

/** The order / hidden products of a collection changed (they belong to the collection, not to a section: every section and its page follow them). Pure. */
function arrangementChanges(published: ScopeDoc, draft: ScopeDoc, nameOf: CollectionNamer): Change[] {
  const key = (r: CollectionRef) => `${r.store}:${r.collectionId}`;
  const was = new Map((published.collections?.arrangements ?? []).map((a) => [key(a), a]));
  const now = new Map((draft.collections?.arrangements ?? []).map((a) => [key(a), a]));
  const out: Change[] = [];
  for (const k of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(k);
    const b = now.get(k);
    if (json(a?.productIds) === json(b?.productIds) && json(a?.hiddenIds) === json(b?.hiddenIds)) continue;
    const ref = (b ?? a)!;
    const hidden = b?.hiddenIds?.length ?? 0;
    const what = b?.productIds?.length ? "ordem própria" : "ordem da INK";
    out.push({ kind: "edited", sectionId: `arrangement:${k}`, text: `Coleção ${nameOf(ref) ?? `#${ref.collectionId}`}: ${what}${hidden > 0 ? `, ${hidden} produto(s) escondido(s)` : ""} (seções e página da coleção)` });
  }
  return out;
}

const MOVED_TO: Record<MenuPosition, string> = { top: "vai para o topo do menu", more: "fica em Categorias", none: "sai do menu" };

/**
 * What changed in the collection menu between two documents: a collection changing place, the order of the bar, and the INK navbar starting to follow the
 * menu (a document from before it kept its own INK lists). Pure.
 */
function menuChanges(published: ScopeDoc, draft: ScopeDoc, nameOf: CollectionNamer, isPublic: CollectionVisibility): Change[] {
  const before = effectiveMenu(published);
  const after = effectiveMenu(draft);
  const key = (r: CollectionRef) => `${r.store}:${r.collectionId}`;
  const named = (r: CollectionRef) => `"${nameOf(r) ?? `coleção #${r.collectionId}`}"`;
  const mentioned = new Map<string, CollectionRef>();
  for (const m of [before.menu, after.menu]) for (const r of [...m.top, ...m.hidden, ...m.added]) mentioned.set(key(r), r);
  const out: Change[] = [];
  if (!before.own && after.own) out.push({ kind: "navbar-moved", sectionId: "navbar:adopt", text: "A navbar da INK passa a seguir o menu de coleções do site (Topo e Categorias)" });
  for (const [k, ref] of mentioned) {
    const was = menuPositionOf(before.menu, ref, isPublic(ref));
    const now = menuPositionOf(after.menu, ref, isPublic(ref));
    if (was === now) continue;
    const kind = now === "none" ? "navbar-removed" : was === "none" ? "navbar-added" : "navbar-moved";
    out.push({ kind, sectionId: `navbar:${k}`, text: `${named(ref)} ${MOVED_TO[now]}` });
  }
  // Order of the bar, among the collections that stay on it.
  const stay = (a: CollectionRef[], b: CollectionRef[]) => a.filter((r) => b.some((o) => key(o) === key(r))).map(key);
  if (stay(before.menu.top, after.menu.top).join() !== stay(after.menu.top, before.menu.top).join()) out.push({ kind: "navbar-moved", sectionId: "navbar:order:top", text: "A ordem do topo do menu mudou" });
  // The short descriptions under the collections' names in the open menus.
  const notes = (doc: ScopeDoc) => new Map((doc.collections?.descriptions ?? []).map((d) => [key(d), d]));
  const was = notes(published);
  const now = notes(draft);
  for (const k of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(k)?.text;
    const b = now.get(k)?.text;
    if (a === b) continue;
    const ref = (now.get(k) ?? was.get(k))!;
    out.push({ kind: "navbar-moved", sectionId: `navbar:note:${k}`, text: b ? `${named(ref)}: descrição no menu “${b}”` : `${named(ref)}: sem descrição no menu` });
  }
  return out;
}

const BLOCK_NAME = { primaryBlock: "Comprar", categoriesBlock: "Categorias", statesBlock: "Estados da região", regionsBlock: "Outras regiões" } as const;
const blockText = (b: NavBlockConfig | undefined) => (b ? `"${b.label}", posição ${b.order}, ${b.visible ? "visível" : "oculto"}` : "padrão");

/** What changed in the region's menu configuration (blocks and known links). Pure. */
function navigationChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const before = published.navigation;
  const after = draft.navigation;
  if (json(before) === json(after)) return [];
  const out: Change[] = [];
  for (const key of ["primaryBlock", "categoriesBlock", "statesBlock", "regionsBlock"] as const) {
    if (json(before?.[key]) !== json(after?.[key])) out.push({ kind: "navigation", sectionId: `navigation:${key}`, text: `Navegação, bloco ${BLOCK_NAME[key]}: ${blockText(before?.[key])} → ${blockText(after?.[key])}` });
  }
  for (const destination of ["styles", "speech", "states"] as const) {
    const was = before?.primaryLinks?.find((l) => l.destination === destination);
    const now = after?.primaryLinks?.find((l) => l.destination === destination);
    if (json(was) !== json(now)) out.push({ kind: "navigation", sectionId: `navigation:link:${destination}`, text: `Navegação, link ${NAV_DESTINATION_LABEL[destination]}: ${blockText(was)} → ${blockText(now)}` });
  }
  const [wasActions, nowActions] = [headerActionsOf(before), headerActionsOf(after)];
  for (const action of HEADER_ACTIONS) {
    if (wasActions[action] !== nowActions[action]) out.push({ kind: "navigation", sectionId: `navigation:header:${action}`, text: `Topo do site, ${HEADER_ACTION_LABEL[action]}: ${nowActions[action] === "label" ? "ícone e texto" : "só o ícone"}` });
  }
  return out;
}

/** The store-wide buy button of the product cards (global scope). Pure. */
function cardsChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const was = published.cards;
  const now = draft.cards;
  if (was?.buyLabel === now?.buyLabel && was?.buyStyle === now?.buyStyle) return [];
  const text = (cards: typeof was) => (cards ? `${CARD_BUY_STYLE_NAME[cards.buyStyle ?? "button"]} “${cards.buyLabel}” em todos os cards` : "cada seção decide");
  return [{ kind: "theme", sectionId: "cards:buy", text: `Botão nos cards de produto: ${text(was)} → ${text(now)}` }];
}

/** The last card of the product carousels (global scope). Pure. */
function carouselEndChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const was = published.carouselEnd?.label;
  const now = draft.carouselEnd?.label;
  if (was === now) return [];
  const text = (label: typeof was) => (label ? `“${label}”` : "desligado");
  return [{ kind: "theme", sectionId: "carousel-end", text: `Card no fim dos carrosséis: ${text(was)} → ${text(now)}` }];
}

const MUNDO_TEXTO = { on: "página e entradas na loja", pagina: "só a página, sem entradas", off: "desligado" } as const;

/** "Meu Pequeno Mundo" opened or closed by the panel (global scope); absent = follows the server's MEU_PEQUENO_MUNDO. Pure. */
function mundoChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const was = published.mundo?.modo;
  const now = draft.mundo?.modo;
  if (was === now) return [];
  const text = (m: typeof was) => (m ? MUNDO_TEXTO[m] : "segue o servidor");
  return [{ kind: "theme", sectionId: "mundo", text: `Meu Pequeno Mundo: ${text(was)} → ${text(now)}` }];
}

const barName = (m: TopBarMessage) => `mensagem "${m.text}"`;
const daysName = (days: number | undefined) => (days === undefined ? "sem prazo" : `${days} ${days === 1 ? "dia útil" : "dias úteis"}`);

/** "Faixa do topo": messages added, removed, switched, edited or reordered, and the production time. Pure. */
function topBarChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const before = published.topBar?.messages ?? [];
  const after = draft.topBar?.messages ?? [];
  const out: Change[] = [];
  const was = published.topBar?.productionDays;
  const now = draft.topBar?.productionDays;
  const colorsName = (doc: ScopeDoc) => (doc.topBar?.colors ? `fundo ${doc.topBar.colors.background}, fonte ${doc.topBar.colors.text}` : "preta (padrão)");
  if (colorsName(published) !== colorsName(draft)) out.push({ kind: "top-bar", sectionId: "top-bar:colors", text: `Faixa do topo, cores: ${colorsName(published)} → ${colorsName(draft)}` });
  const styleName = (doc: ScopeDoc) => (doc.topBar?.style === "rotate" ? "uma de cada vez" : "passando (letreiro)");
  if (styleName(published) !== styleName(draft)) out.push({ kind: "top-bar", sectionId: "top-bar:style", text: `Faixa do topo, como as mensagens aparecem: ${styleName(published)} → ${styleName(draft)}` });
  if (was !== now) out.push({ kind: "top-bar", sectionId: "top-bar:production", text: `Faixa do topo, prazo de produção da INK: ${daysName(was)} → ${daysName(now)}` });
  const old = new Map(before.map((m) => [m.id, m]));
  for (const m of after) {
    const id = `top-bar:${m.id}`;
    const prev = old.get(m.id);
    if (!prev) out.push({ kind: "top-bar", sectionId: id, text: `Faixa do topo: ${barName(m)} adicionada${m.enabled ? "" : " (desativada)"}` });
    else {
      if (prev.enabled !== m.enabled) out.push({ kind: "top-bar", sectionId: id, text: `Faixa do topo: ${barName(m)} ${m.enabled ? "ativada" : "desativada"}` });
      const { enabled: _a, order: _b, ...restOld } = prev;
      const { enabled: _c, order: _d, ...restNew } = m;
      if (json(restOld) !== json(restNew)) out.push({ kind: "top-bar", sectionId: id, text: `Faixa do topo: ${barName(m)} editada` });
    }
  }
  const ids = new Set(after.map((m) => m.id));
  for (const m of before) if (!ids.has(m.id)) out.push({ kind: "top-bar", sectionId: `top-bar:${m.id}`, text: `Faixa do topo: ${barName(m)} removida` });
  const order = (list: TopBarMessage[]) => list.filter((m) => ids.has(m.id) && old.has(m.id)).map((m) => m.id).join(",");
  if (order(before) !== order(after)) out.push({ kind: "top-bar", sectionId: "top-bar:order", text: "Faixa do topo: nova ordem das mensagens" });
  return out;
}

/** "O Pódio" switched on or off in the region (it belongs to the document, not to a section). Pure. */
function podioChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const was = podioEnabledIn(published);
  const now = podioEnabledIn(draft);
  if (was === now) return [];
  return [{ kind: "podio", sectionId: "podio", text: now ? "O Pódio volta para a home e as páginas de estado, e o cálculo diário desta região volta a rodar" : "O Pódio sai da home e das páginas de estado, e o cálculo diário desta região para" }];
}

/** "Tema da INK": each surface switched on/off and each preset changed. Pure. */
function inkThemeChanges(published: ScopeDoc, draft: ScopeDoc): Change[] {
  const was = inkThemeOf(published);
  const now = inkThemeOf(draft);
  const out: Change[] = [];
  for (const s of INK_THEME_SURFACES) {
    if (was.surfaces[s] !== now.surfaces[s]) out.push({ kind: "ink-theme", sectionId: `ink-theme:${s}`, text: `Tema da INK, ${INK_SURFACE_LABEL[s].toLowerCase()}: ${now.surfaces[s] ? "ligado" : "desligado (volta ao visual da INK)"}` });
  }
  for (const k of ["action", "ground", "corners", "font"] as const) {
    if (was[k] !== now[k]) out.push({ kind: "ink-theme", sectionId: `ink-theme:${k}`, text: `Tema da INK: ${(INK_PRESET_LABEL[k] as Record<string, string>)[was[k]]} → ${(INK_PRESET_LABEL[k] as Record<string, string>)[now[k]]}` });
  }
  if (paletteOf(was) !== paletteOf(now)) out.push({ kind: "ink-theme", sectionId: "ink-theme:palette", text: `Tema da INK, cores do carrinho e do checkout: ${INK_PRESET_LABEL.palette[paletteOf(was)]} → ${INK_PRESET_LABEL.palette[paletteOf(now)]}` });
  if (json(was.incentive) !== json(now.incentive)) out.push({ kind: "ink-theme", sectionId: "ink-theme:incentive", text: `Tema da INK, incentivo de frete no carrinho: ${inkIncentiveText(now.incentive)}` });
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
