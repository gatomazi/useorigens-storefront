import type { CollectionRecord } from "../catalog/collections";
import { REGIONS, REGION_SLUGS, STATE_NAMES, regionMayUseStore, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { HOME_THEME_LABEL, swapHomeTheme } from "../site-config/home-themes";
import { effectiveMenu, withMenu } from "../site-config/collection-menu";
import { arrangementOf } from "../site-config/collections-enabled";
import { defaultStatesBlockLabel, resolveTheme } from "../site-config/navigation";
import { uniqueSlug } from "../site-config/pages";
import { homeThemeOf, isUmaPencaSource, MAX_CUSTOMIZERS, MAX_PAGES, PAGE_SEGMENT, validateScopeDoc, type HomeThemeName, type CollectionRef, type Customizer, type Destination, type Page, type ScopeDoc, type Section } from "../site-config/schema";

export const COPY_PARTS = {
  home: { label: "Home", path: "/admin/home", description: "Copia a ordem, os textos, as imagens e a configuração das seções. Substitui a home do tema em edição no rascunho desta região." },
  navigation: { label: "Navegação e menus", path: "/admin/navegacao", description: "Copia os rótulos, a ordem e a visibilidade da navegação, junto com o menu de coleções. Substitui esses menus no rascunho." },
  "collection-menu": { label: "Menu de coleções", path: "/admin/colecoes", description: "Copia as coleções do topo, as ocultas e as adicionadas a Categorias. Substitui o menu de coleções no rascunho." },
  theme: { label: "Aparência", path: "/admin/aparencia", description: "Usa as cores efetivas da outra região como paleta própria. Substitui a paleta do tema em edição no rascunho." },
  promotions: { label: "Cupons e promoções", path: "/admin/promocoes", description: "Copia os textos, códigos e períodos como itens desativados para você revisar. Substitui a lista de cupons e promoções do rascunho." },
  page: { label: "Página", path: "/admin/paginas", description: "Cria uma nova página a partir da estrutura de outra região, com endereço próprio. As páginas existentes são mantidas." },
  customizer: { label: "Modelo de personalização", path: "/admin/personalizacao", description: "Cria um novo modelo com os campos, imagens e configurações da origem. A cópia começa desativada." },
} as const;
export type CopyPart = keyof typeof COPY_PARTS;
export type CopyVersion = "working" | "published";
export const isCopyPart = (v: string): v is CopyPart => Object.hasOwn(COPY_PARTS, v);
export type CopyCollection = Pick<CollectionRecord, "id" | "name" | "slug" | "isAvailable" | "matchedCount" | "needsResync"> & { store: CommerceStoreKey };
export type CollectionRequirement = CollectionRef & { products: boolean; publicOnly: boolean };
export const collectionCopyKey = (r: CollectionRef): string => `${r.store}:${r.collectionId}`;

export type CopyItem = { id: string; label: string; detail: string; collections: { key: string; label: string; suggested: string; products: boolean; publicOnly: boolean }[] };
export type CopySource = { scope: RegionSlug; working: CopyItem[]; published: CopyItem[] };
export type CopyRequest = { scope: RegionSlug; fromScope: RegionSlug; sourceVersion: CopyVersion; part: CopyPart; sourceId: string; rev: number | null; mappings: Record<string, string> };
export type CopyReview = { ok: true; checksum: string; request: CopyRequest; summary: string[]; warnings: string[] } | { ok: false; errors: string[] };
export type CopyPlan = { ok: true; doc: ScopeDoc; summary: string[]; warnings: string[]; focusId?: string } | { ok: false; errors: string[] };

/** Only collections actually referenced by the selected structure need an association. Product ids never cross stores. */
export function copyRequirements(doc: ScopeDoc, part: CopyPart, id = ""): CollectionRequirement[] {
  const refs = new Map<string, CollectionRequirement>();
  const add = (ref: CollectionRef, products = false, publicOnly = false) => {
    const key = collectionCopyKey(ref);
    const before = refs.get(key);
    refs.set(key, { store: ref.store, collectionId: ref.collectionId, products: products || !!before?.products, publicOnly: publicOnly || !!before?.publicOnly });
  };
  const destination = (d: Destination | undefined) => {
    if (d?.kind === "ink-collection" || d?.kind === "collection-page") add(d, d.kind === "collection-page", d.kind === "ink-collection");
  };
  if (part === "navigation" || part === "collection-menu") {
    const menu = effectiveMenu(doc).menu;
    for (const ref of [...menu.top, ...menu.hidden, ...menu.added]) add(ref);
  }
  const sections = part === "home" ? doc.home?.sections : part === "page" ? doc.pages?.find((p) => p.id === id)?.sections : undefined;
  for (const section of sections ?? []) {
    if (section.source?.kind === "ink-category") add(section.source, true);
    destination(section.cta?.dest);
    destination(section.nav?.dest);
    for (const tile of section.tiles ?? []) destination(tile.dest);
  }
  const model = part === "customizer" ? doc.customizers?.find((m) => m.id === id) : undefined;
  if (model && !isUmaPencaSource(model.source)) add(model.source);
  return [...refs.values()];
}

const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const fitsCopyRequirement = (c: CopyCollection, ref: CollectionRequirement): boolean => !c.needsResync && (!ref.products || c.matchedCount >= 3) && (!ref.publicOnly || c.isAvailable);

/** A same numeric id in another INK store is never evidence of equivalence. Ambiguous names require the operator's choice. */
export function suggestedCopyCollection(source: CopyCollection | undefined, targets: CopyCollection[], requirement: CollectionRequirement): string {
  if (!source) return "";
  const matches = targets.filter((c) => fitsCopyRequirement(c, requirement) && ((source.slug && normalized(c.slug) === normalized(source.slug)) || normalized(c.name) === normalized(source.name)));
  return matches.length === 1 ? String(matches[0].id) : "";
}

/** Pure, scoped copy. The caller loads authorized workspaces and saves this result with the destination's optimistic lock. */
export function buildRegionCopy(input: { source: ScopeDoc; destination: ScopeDoc; destinationTheme?: HomeThemeName; targetStore?: CommerceStoreKey; global?: ScopeDoc; part: CopyPart; sourceId?: string; mappings: Record<string, string>; collections: CopyCollection[]; newId: () => string }): CopyPlan {
  const { source, part, collections, mappings, newId } = input;
  const themed = part === "home" || part === "theme";
  const destination = themed && input.destinationTheme ? swapHomeTheme(input.destination, input.destinationTheme) : input.destination;
  if (!destination) return { ok: false, errors: ["O tema em edição não está mais disponível. Recarregue a página e revise a cópia."] };
  if (source.scope === "global" || destination.scope === "global" || source.scope === destination.scope) return { ok: false, errors: ["Escolha outra região como origem da cópia."] };
  const from = source.scope;
  const to = destination.scope;
  const store = input.targetStore ?? REGIONS[to].storeKey;
  if (!regionMayUseStore(to, store)) return { ok: false, errors: ["A loja de destino não atende esta região."] };
  const warnings = new Set<string>();
  const summary: string[] = [];
  const errors: string[] = [];
  const required = copyRequirements(source, part, input.sourceId);
  const mapped = new Map<string, CopyCollection>();
  for (const ref of required) {
    const key = collectionCopyKey(ref);
    const origin = collections.find((c) => c.store === ref.store && c.id === ref.collectionId);
    const target = collections.find((c) => c.store === store && String(c.id) === mappings[key]);
    if (!target || !fitsCopyRequirement(target, ref)) errors.push(`Escolha uma coleção válida de ${REGIONS[to].name} para “${origin?.name ?? key}”${ref.products ? " (mínimo de 3 produtos)" : ""}${ref.publicOnly ? "; o link da INK exige uma coleção pública" : ""}.`);
    else mapped.set(key, target);
  }
  if (errors.length) return { ok: false, errors };
  let next = structuredClone(destination);
  const refFor = (ref: CollectionRef): CollectionRef => ({ store, collectionId: mapped.get(collectionCopyKey(ref))!.id });
  const enable = (ref: CollectionRef) => {
    const target = mapped.get(collectionCopyKey(ref))!;
    if (target.isAvailable || next.collections?.enabled.some((r) => r.store === store && r.collectionId === target.id)) return;
    next.collections = { ...next.collections, enabled: [...(next.collections?.enabled ?? []), { store, collectionId: target.id }] };
    warnings.add(`A coleção interna “${target.name}” será habilitada no rascunho de ${REGIONS[to].name} para sustentar a estrutura copiada.`);
  };
  let copiedPage: { source: Page; target: Page } | undefined;
  const root: Destination = { kind: "route", path: `/${to}` };
  const missingLink = (label: string): undefined => {
    warnings.add(`“${label}”: o destino não existe em ${REGIONS[to].name}; o botão será retirado ou o bloco levará à home. Ajuste o link depois da cópia.`);
    return undefined;
  };
  const pageTarget = (kind: Page["kind"], slug: string) => copiedPage?.source.kind === kind && copiedPage.source.slug === slug ? copiedPage.target : next.pages?.find((p) => p.kind === kind && p.slug === slug && !p.archived);
  const adaptDestination = (d: Destination, label: string): Destination | undefined => {
    if (d.kind === "ink-collection" || d.kind === "collection-page") {
      if (d.kind === "collection-page") enable(d);
      return { kind: d.kind, ...refFor(d) };
    }
    if (d.kind === "page") {
      const target = pageTarget(d.pageKind, d.slug);
      return target ? { ...d, slug: target.slug } : missingLink(label);
    }
    if (d.kind === "customizer") {
      const original = source.customizers?.find((m) => m.id === d.customizerId);
      const target = original && next.customizers?.find((m) => m.slug === original.slug && m.active);
      return target ? { kind: "customizer", customizerId: target.id } : missingLink(label);
    }
    if (d.kind === "route") {
      const url = new URL(d.path, "https://copy.invalid");
      const segments = url.pathname.split("/").filter(Boolean);
      if (!(REGION_SLUGS as readonly string[]).includes(segments[0])) return missingLink(label);
      // A state/city of Sul cannot become a fictitious state/city of Norte.
      if (segments[1] && STATE_NAMES[segments[1].toUpperCase()] && !REGIONS[to].ufs.includes(segments[1].toUpperCase())) return missingLink(label);
      const kind = segments[1] === "h" ? "hotpage" : segments[1] === "colecoes" ? "categoryLanding" : null;
      if (kind && segments[2]) {
        const target = pageTarget(kind, segments[2]);
        const automatic = kind === "categoryLanding" ? collections.find((c) => c.store === store && c.slug === segments[2] && c.matchedCount >= 3 && !c.needsResync && (c.isAvailable || next.collections?.enabled.some((r) => r.store === store && r.collectionId === c.id))) : undefined;
        if (!target && !automatic) return missingLink(label);
        if (target) segments[2] = target.slug;
      }
      if (segments[1] === "personalizar" && segments[2] && !next.customizers?.some((m) => m.slug === segments[2] && m.active)) return missingLink(label);
      segments[0] = to;
      return { kind: "route", path: `/${segments.join("/")}${url.search}${url.hash}` };
    }
    if (d.kind === "external") {
      const url = new URL(d.url);
      const regionalHosts = ["www.usesul.com.br", "www.usenorte.com.br", "www.usecentro.com.br"];
      if (regionalHosts.includes(url.hostname)) {
        warnings.add(`“${label}”: o link externo de uma loja regional será trocado pela home de ${REGIONS[to].name}. Escolha o destino específico depois da cópia.`);
        return root;
      }
    }
    return structuredClone(d);
  };
  const adaptSections = (sections: Section[]): Section[] => sections.map((original) => {
    const s = structuredClone(original);
    const fixed = s.template === "hero" || s.template === "footer" || s.template === "page-hero";
    s.id = `${fixed ? "copied" : "custom"}-${newId()}`;
    if (!fixed) delete s.locked;
    if (s.source?.kind === "ink-category") {
      enable(s.source);
      s.source = { kind: "ink-category", ...refFor(s.source), order: "category", limit: s.source.limit, ...(s.source.sort ? { sort: s.source.sort } : {}) };
      warnings.add("A ordem e os produtos ocultos das coleções continuam seguindo a configuração da região de destino; os IDs de produtos da origem não são copiados.");
    } else if (s.source?.kind === "manual") {
      s.source.productIds = [];
      s.active = false;
      warnings.add(`“${s.title ?? s.anchor}” ficará oculta: a curadoria manual de produtos precisa ser refeita nesta região.`);
    }
    if (s.template === "hero") {
      s.featured = structuredClone(destination.home?.sections.find((x) => x.template === "hero")?.featured ?? []);
      warnings.add("Os produtos em destaque do topo são mantidos da região de destino; se ela ainda não tiver uma seleção, o topo ficará sem esses cards.");
    }
    if (s.stateCovers) {
      s.stateCovers = Object.fromEntries(Object.entries(s.stateCovers).filter(([uf]) => REGIONS[to].ufs.includes(uf)));
      if (Object.keys(s.stateCovers).length !== Object.keys(original.stateCovers!).length) warnings.add("As capas de estados da origem serão retiradas. Escolha imagens dos estados da região de destino.");
    }
    if (s.cta) {
      const dest = adaptDestination(s.cta.dest, s.cta.label);
      if (dest) s.cta.dest = dest;
      else delete s.cta;
    }
    if (s.nav?.dest) {
      const dest = adaptDestination(s.nav.dest, s.nav.label);
      if (dest) s.nav.dest = dest;
      else delete s.nav.dest;
    }
    if (s.tiles) s.tiles = s.tiles.map((tile) => ({ ...tile, dest: adaptDestination(tile.dest, tile.label) ?? structuredClone(root) }));
    if (s.customizerCard) {
      const originalModel = source.customizers?.find((m) => m.id === s.customizerCard!.customizerId);
      const target = originalModel && next.customizers?.find((m) => m.slug === originalModel.slug && m.active);
      if (target) s.customizerCard.customizerId = target.id;
      else {
        delete s.customizerCard;
        warnings.add("O card de personalização sem modelo equivalente ativo será retirado. Copie ou configure o modelo nesta região e vincule-o novamente.");
      }
    }
    if (s.live) {
      const originalModel = source.customizers?.find((m) => m.id === s.live!.customizerId);
      const target = originalModel && next.customizers?.find((m) => m.slug === originalModel.slug && m.active);
      if (target) s.live.customizerId = target.id;
      else {
        s.active = false;
        warnings.add("O banner ao vivo sem modelo equivalente ativo fica oculto. Copie ou configure o modelo nesta região e escolha-o no banner.");
      }
    }
    return s;
  });

  if (part === "home") {
    if (!source.home?.sections.length) return { ok: false, errors: ["A região de origem ainda não tem uma home nesta versão."] };
    // Older documents kept curation in home sections. Preserve its effective collection-level value before those sections are replaced.
    const arrangements = [...(next.collections?.arrangements ?? [])];
    const kept = new Set(arrangements.map(collectionCopyKey));
    for (const section of destination.home?.sections ?? []) {
      const ref = section.source;
      if (ref?.kind !== "ink-category" || kept.has(collectionCopyKey(ref))) continue;
      const legacy = arrangementOf(destination, ref.store, ref.collectionId);
      if (!legacy?.productIds?.length && !legacy?.hiddenIds?.length) continue;
      arrangements.push({ store: ref.store, collectionId: ref.collectionId, ...(legacy.productIds ? { productIds: [...legacy.productIds] } : {}), ...(legacy.hiddenIds ? { hiddenIds: [...legacy.hiddenIds] } : {}) });
      kept.add(collectionCopyKey(ref));
    }
    if (arrangements.length) next.collections = { ...next.collections, enabled: next.collections?.enabled ?? [], arrangements };
    next.home = { sections: adaptSections(source.home.sections), ...(source.home.backdrop ? { backdrop: structuredClone(source.home.backdrop) } : {}) };
    summary.push(`Substituir a home de ${REGIONS[to].name} por ${source.home.sections.length} seções de ${REGIONS[from].name}, na mesma ordem.`, ...source.home.sections.map((s) => `${s.title?.replace(/\n/g, " ") ?? s.anchor}${s.active ? "" : " (oculta)"}`));
  } else if (part === "navigation" || part === "collection-menu") {
    if (part === "navigation") {
      if (source.navigation) {
        next.navigation = structuredClone(source.navigation);
        if (next.navigation.statesBlock?.label === defaultStatesBlockLabel(from)) next.navigation.statesBlock.label = defaultStatesBlockLabel(to);
      } else delete next.navigation;
      summary.push("Substituir rótulos, ordem e visibilidade dos blocos e links da navegação. Estados e outras regiões continuam vindo dos dados reais do destino.");
    }
    const menu = effectiveMenu(source).menu;
    const seen = new Set<number>();
    const mapList = (list: CollectionRef[], enableInternal = false) => list.flatMap((ref) => {
      const mappedRef = refFor(ref);
      if (seen.has(mappedRef.collectionId)) return [];
      seen.add(mappedRef.collectionId);
      if (enableInternal) enable(ref);
      return [mappedRef];
    });
    const top = mapList(menu.top, true);
    const hidden = mapList(menu.hidden);
    const added = mapList(menu.added, true);
    next = withMenu(next, { top, hidden, added });
    summary.push(`Substituir o menu de coleções: ${top.length} no topo, ${hidden.length} ocultas e ${added.length} adicionadas a Categorias.`, ...[...mapped.entries()].map(([key, c]) => `${collections.find((x) => `${x.store}:${x.id}` === key)?.name ?? key} → ${c.name}`));
  } else if (part === "theme") {
    next.theme = { mode: "override", colors: resolveTheme(from, source, input.global).effective };
    summary.push(`Substituir a paleta regional pelas 8 cores efetivas de ${REGIONS[from].name}, como paleta própria.`);
  } else if (part === "promotions") {
    if (!source.promotions?.items.length) return { ok: false, errors: ["A região de origem não tem cupons ou promoções nesta versão."] };
    next.promotions = { items: source.promotions.items.map((item) => ({ ...structuredClone(item), id: `promo-${newId()}`, enabled: false })) };
    summary.push(`Substituir a lista por ${next.promotions.items.length} cupom(ns) e promoção(ões), todos desativados.`, ...next.promotions.items.map((p) => p.title));
    warnings.add("Revise códigos, condições e períodos para a loja de destino antes de ativar cada item. Copiar a configuração não cadastra cupons na INK.");
  } else if (part === "page") {
    const page = source.pages?.find((p) => p.id === input.sourceId && !p.archived);
    if (!page) return { ok: false, errors: ["Escolha uma página disponível na região de origem."] };
    if ((next.pages?.length ?? 0) >= MAX_PAGES) return { ok: false, errors: [`Esta região já atingiu o limite de ${MAX_PAGES} páginas.`] };
    const copied: Page = { ...structuredClone(page), id: `page-${newId()}`, slug: uniqueSlug(page.slug, new Set((next.pages ?? []).filter((p) => p.kind === page.kind).map((p) => p.slug))), version: 1, seo: { ...structuredClone(page.seo), indexable: false } };
    delete copied.archived;
    copiedPage = { source: page, target: copied };
    copied.sections = adaptSections(page.sections);
    next.pages = [...(next.pages ?? []), copied];
    summary.push(`Criar “${copied.title}” com ${copied.sections.length} seção(ões) em /${to}/${PAGE_SEGMENT[copied.kind]}/${copied.slug}.`, "A nova página começa apenas no rascunho, com indexação desativada, e precisa ser publicada individualmente.");
  } else if (part === "customizer") {
    const model = source.customizers?.find((m) => m.id === input.sourceId);
    if (!model) return { ok: false, errors: ["Escolha um modelo disponível na região de origem."] };
    if ((next.customizers?.length ?? 0) >= MAX_CUSTOMIZERS) return { ok: false, errors: [`Esta região já atingiu o limite de ${MAX_CUSTOMIZERS} modelos.`] };
    const copied: Customizer = { ...structuredClone(model), id: `cz-${newId()}`, slug: uniqueSlug(model.slug, new Set((next.customizers ?? []).map((m) => m.slug))), active: false, version: 1 };
    if (!isUmaPencaSource(model.source)) {
      enable(model.source);
      copied.source = refFor(model.source);
      delete copied.inkProductId;
      warnings.add("O produto de checkout da INK precisa ser escolhido na loja de destino; o ID de produto da origem não é copiado.");
    }
    next.customizers = [...(next.customizers ?? []), copied];
    summary.push(`Criar o modelo “${copied.name}” com ${copied.fields.length} campo(s)${copied.lineGroup ? " e grupo de linhas" : ""}, no endereço /${to}/personalizar/${copied.slug}.`, "O novo modelo começa desativado no rascunho. Revise e publique o modelo individualmente.");
  }
  if (part === "home" || part === "page" || part === "customizer") warnings.add(`Textos e imagens da origem serão mantidos. Revise menções a ${REGIONS[from].name} e adapte o conteúdo para ${REGIONS[to].name}.`);
  if (themed) {
    summary.push(`Aplicar ao tema ${HOME_THEME_LABEL[homeThemeOf(destination)]} do destino. A seleção do tema em uso é mantida.`);
    next = swapHomeTheme(next, homeThemeOf(input.destination)) ?? next;
  }
  const check = validateScopeDoc(next);
  if (!check.ok) return { ok: false, errors: ["A configuração copiada não passou pela validação. Corrija a origem ou as associações e tente de novo.", ...check.errors] };
  const focusId = part === "page" ? next.pages!.at(-1)!.id : part === "customizer" ? next.customizers!.at(-1)!.id : undefined;
  return { ok: true, doc: next, summary, warnings: [...warnings], ...(focusId ? { focusId } : {}) };
}
