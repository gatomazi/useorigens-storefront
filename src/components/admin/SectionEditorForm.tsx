"use client";

import { REGIONS, REGION_SLUGS } from "@/lib/geo/regions";
import { FOLLOW_SOURCE, REGION_TOKEN } from "@/lib/site-config/follow-schema";
import { useMemo, useState } from "react";
import { CollectionCombobox, type ComboEntry } from "@/components/admin/CollectionCombobox";
import { CollectionOrder, type OrderMember } from "@/components/admin/CollectionOrder";
import { HeroScheduleEditor } from "@/components/admin/HeroScheduleEditor";
import { GridTilesEditor } from "@/components/admin/GridTilesEditor";
import { HeroColorsEditor } from "@/components/admin/HeroColorsEditor";
import { HeroFeaturedProducts, type FeaturedSlotView } from "@/components/admin/HeroFeaturedProducts";
import type { FeaturedCandidate } from "@/lib/hero-featured";
import { heroTextColors, readability } from "@/lib/admin/contrast";
import { suggestedNavLabel } from "@/lib/site-config/nav";
import { PRODUCT_CARD_IMAGE, sectionImageSizes, sizeHintText, STATE_COVER } from "@/lib/admin/image-sizes";
import { DEFAULT_BUY_LABEL, HERO_CARDS, MAX_BUY_LABEL, MAX_CITY_STYLES, MAX_FEATURED, MAX_TAG_TEXT, maxSectionProducts, MIN_SECTION_PRODUCTS, type Appearance, type HomeThemeName, type ProductDisplay, type Section } from "@/lib/site-config/schema";
import { customizerCardFieldDefaults } from "@/lib/admin/section-form";
import { ARTICLE_KIND_LABELS, ARTICLE_KINDS } from "@/lib/umapenca/types";
import { PRODUCT_SORTS, PRODUCT_SORT_LABEL, type ProductSort } from "@/lib/catalog/product-sort";

export type MediaOption = { assetId: string; label: string; src: string; width: number; height: number; kind: "banner" | "upload" };

const MODULES = [
  ["terra", "Da Nossa Terra (curadoria atual)"],
  ["recreations", "Redesenhos (curadoria atual)"],
  ["lenda", "Linha Lenda / Feito Para Você (curadoria atual)"],
  ["dizeres", "Fala daqui (curadoria atual)"],
  ["ddd", "DDD (curadoria atual)"],
] as const;

const PRESETS = [
  ["none", "Nenhuma"],
  ["regional-wash", "Véu claro regional (texto escuro)"],
  ["regional-wash-primary", "Véu verde regional (texto claro)"],
  ["regional-wash-dark", "Véu escuro (texto claro)"],
] as const;

/** The compositions a template offers (`SECTION_VARIANTS`), with the original first ("" = never stored). */
const VARIANT_CHOICES: Partial<Record<Section["template"], readonly (readonly [string, string, string])[]>> = {
  hero: [
    ["", "Três produtos", "O título, a busca e até três produtos em cards pequenos ao lado."],
    ["feature", "Um produto em destaque", "O título (a última linha na cor de destaque), a busca e, na outra metade, um produto grande por vez com nome, preço e “Ver produto →”. Até 8 produtos, cada um com banner próprio, sempre o primeiro, sorteados a cada visita ou passando ao lado (em Produtos em destaque, abaixo). A cor de fundo pinta a metade do produto. No celular, essa metade vem depois da busca."],
  ],
  states: [
    ["", "Cartões com capa", "Um cartão por estado, com a capa, as regiões e a linha do estado."],
    ["strip", "Faixa compacta", "Uma faixa de ponta a ponta: sigla, nome e “Ver 399 cidades →” em cada estado; o estado inteiro é um link. No celular, uma linha por estado."],
  ],
  "city-styles": [
    ["", "Grade", "O título em cima e os estilos em grade (até 4 por linha)."],
    ["split", "Título ao lado", "O título numa coluna e os estilos ao lado, três por linha (combina com 3 estilos). No celular, os cards rolam para o lado."],
    ["list", "Lista com destaque", "O título numa coluna, os nomes dos estilos numa lista e UM card grande ao lado, o do estilo escolhido (clicar num nome, ou parar o mouse sobre ele, troca o card). Mostra todos os modelos (até 8) sem encher a tela. No celular, os nomes viram uma fileira que rola para o lado, com o card embaixo."],
  ],
  campaign: [
    ["", "Bloco escuro", "O texto sobre a foto (com véu) ou sobre a cor, com recortes de camisetas quando não há foto."],
    ["split", "Dividida", "A foto de um lado (ou recortes de camisetas reais) e o texto sobre a cor do outro, de ponta a ponta. A cor do fundo pinta o lado do texto; sem cor, usa a da região."],
  ],
  "image-grid": [
    ["", "Grade", "Blocos com imagem e nome, cada um levando a uma coleção, página ou categoria."],
    ["checkpoints", "Checkpoints semanais", "Uma oferta por semana: cada bloco abre num dia (antes disso, só um cadeado com a data, sem revelar a oferta nem o link) e continua aberto depois. O bloco da semana em curso ganha “Esta semana”; o marcado como destaque vem em amarelo."],
  ],
};

export const previewSrc = (m: MediaOption | undefined) => (m ? (m.kind === "banner" ? m.src.replace(/\.[a-z]+$/i, "-640.webp") : m.src) : undefined);
const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

function FocalPad({ label, image, x, y, onChange }: { label: string; image?: MediaOption; x: number; y: number; onChange: (x: number, y: number) => void }) {
  return (
    <div>
      <p className="a-label">{label}</p>
      <div className="relative aspect-[4/3] w-full max-w-[16rem] overflow-hidden border border-black/40 bg-neutral-300">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- a dev-only admin thumbnail of a static local file
          <img src={previewSrc(image)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${x}% ${y}%` }} />
        )}
        <span aria-hidden className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/60" style={{ left: `${x}%`, top: `${y}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[0.75rem] font-bold">Horizontal {x}%<input type="range" min={0} max={100} value={x} onChange={(e) => onChange(Number(e.target.value), y)} className="w-full" aria-label={`${label}: posição horizontal`} /></label>
        <label className="text-[0.75rem] font-bold">Vertical {y}%<input type="range" min={0} max={100} value={y} onChange={(e) => onChange(x, Number(e.target.value))} className="w-full" aria-label={`${label}: posição vertical`} /></label>
      </div>
    </div>
  );
}

function PagePicker({ pages, current }: { pages: { value: string; label: string; live: boolean }[]; current: string }) {
  return (
    <div>
      <label className="a-label" htmlFor="cta_page">Página</label>
      <select id="cta_page" name="cta_page" className="a-select" defaultValue={current} required>
        <option value="" disabled>Escolha…</option>
        {pages.map((p) => <option key={p.value} value={p.value}>{p.label}{p.live ? "" : " (ainda não publicada)"}</option>)}
      </select>
      <p className="a-muted mt-1 text-[0.8125rem]">Só é possível publicar este link quando a página escolhida já estiver publicada e ativa.</p>
    </div>
  );
}
function AnchorPicker({ anchors, current }: { anchors: { anchor: string; label: string }[]; current: string }) {
  return (
    <div>
      <label className="a-label" htmlFor="cta_anchor">Seção</label>
      <select id="cta_anchor" name="cta_anchor" className="a-select" defaultValue={current} required>
        <option value="" disabled>Escolha…</option>
        {anchors.map((a) => <option key={a.anchor} value={a.anchor}>{a.label}</option>)}
      </select>
    </div>
  );
}

export function SectionEditorForm({
  section, rev, scope, media, collections, action, notes = [], featured, stateCovers, page, pageKind, pageDefaultSort, pages = [], customizers = [], anchors = [], collectionMembers, collectionArrangement, regional = false, regionalTheme, ground,
}: {
  /** The colour of the ground behind the section (the page's or the home's own "Fundo"; absent = the region's), for the glass's readability. */
  ground?: string;
  /**
   * One of Sul's sections on a region that follows Sul ("Imagens e produtos"): only what the region may have of its own (the picture, the opening's
   * products, the states' covers, the grid's blocks); texts, layout and products' sources stay Sul's.
   */
  regional?: boolean;
  /** In the regional mode, one of Sul's themes other than the one on its store: the pictures and products are saved for that theme. */
  regionalTheme?: HomeThemeName;
  /** Collection carousels: the saved collection's products in INK's order, for the order list (absent when it does not resolve). */
  collectionMembers?: OrderMember[];
  /** How this region arranges the saved collection now (`arrangementOf`): it belongs to the collection, every section built on it shares it. */
  collectionArrangement?: { productIds?: string[]; hiddenIds?: string[] };
  /** The kind of page the section is on (absent: the home). A parent-category landing may hold the paged grid of a collection. */
  pageKind?: "hotpage" | "categoryLanding";
  pageDefaultSort?: ProductSort;
  /** Set when the section belongs to a PAGE (hotpage / landing) instead of the home: the id of the page. */
  page?: string;
  /** Pages of this region a button may lead to: value `hotpage/slug`, with a status the editor should know. */
  pages?: { value: string; label: string; live: boolean }[];
  /** Personalization models of this region (for the reserved first card). */
  customizers?: { id: string; name: string; live: boolean; active: boolean }[];
  /** Anchors of this container's sections (for "an anchor on this page"). */
  anchors?: { anchor: string; label: string }[];
  /** State chooser only: the region's states with the cover the code already has for them (Sul), to explain what an empty choice means. */
  stateCovers?: { uf: string; name: string; legacy: boolean }[];
  /** Hero only: the configured cards as resolved against the region's catalog. */
  featured?: { mode: "edit" | "legacy"; initial: FeaturedSlotView[]; eligible: number; regionName: string; search: (scope: string, query: string) => Promise<{ results: FeaturedCandidate[]; total: number; error?: string }> };
  /** Real-data notes of a structured component (how many styles / states the region's catalog can feed). */
  notes?: string[];
  section: Section;
  rev: number | null;
  scope: string;
  media: MediaOption[];
  collections: ComboEntry[];
  action: (fd: FormData) => Promise<void>;
}) {
  const a: Appearance = section.appearance;
  const isCarousel = section.template === "product-carousel";
  const hasVisual = isCarousel || section.template === "hero" || section.template === "page-hero" || section.template === "campaign" || section.template === "city-styles" || section.template === "states" || section.template === "image-grid" || section.template === "personalization-live";

  const [tone, setTone] = useState<"light" | "dark">(isCarousel ? section.layout?.tone ?? "light" : section.template === "campaign" ? "dark" : section.template === "page-hero" ? section.layout?.tone ?? "dark" : "light");
  const [fillKind, setFillKind] = useState<"none" | "solid" | "gradient">(a.fill.kind);
  // The composition being chosen (the grid shows the checkpoint fields only in "Checkpoints semanais", before it is saved).
  const [variantNow, setVariantNow] = useState<string>(section.variant ?? "");
  const initialChoice = a.fill.kind === "solid" ? (a.fill.color.startsWith("token:") ? a.fill.color : "custom") : "token:ground";
  const [choice, setChoice] = useState<string>(initialChoice);
  const [solid, setSolid] = useState<string>(a.fill.kind === "solid" && !a.fill.color.startsWith("token:") ? a.fill.color : "#4d543d");
  const [gFrom, setGFrom] = useState<string>(a.fill.kind === "gradient" && a.fill.from.startsWith("#") ? a.fill.from : "#4d543d");
  const [gTo, setGTo] = useState<string>(a.fill.kind === "gradient" && a.fill.to.startsWith("#") ? a.fill.to : "#0a0c0a");
  const [gAngle, setGAngle] = useState(a.fill.kind === "gradient" ? a.fill.angle : 180);
  const [imgM, setImgM] = useState(a.image?.mobile?.assetId ?? "");
  const [imgD, setImgD] = useState(a.image?.desktop?.assetId ?? "");
  const [decorative, setDecorative] = useState(a.image?.mobile?.decorative ?? a.image?.desktop?.decorative ?? true);
  const [focM, setFocM] = useState(a.focal.mobile);
  const [focD, setFocD] = useState(a.focal.desktop);
  const [overlayKind, setOverlayKind] = useState<"preset" | "custom">("preset" in a.overlay ? "preset" : "custom");
  const [preset, setPreset] = useState("preset" in a.overlay ? a.overlay.preset : "none");
  const [ovColor, setOvColor] = useState<string>("color" in a.overlay ? a.overlay.color : "#000000");
  const [ovOpacity, setOvOpacity] = useState("color" in a.overlay ? a.overlay.opacity : 0.45);
  const [sourceKind, setSourceKind] = useState<"editorial-module" | "ink-category" | "umapenca">(section.source?.kind === "ink-category" || section.source?.kind === "umapenca" ? section.source.kind : "editorial-module");
  const [automaticSort, setAutomaticSort] = useState<ProductSort | "">(section.source?.sort ?? "");
  const currentRef = section.source?.kind === "ink-category" ? `${section.source.store}:${section.source.collectionId}` : undefined;
  const [srcEntry, setSrcEntry] = useState<ComboEntry | null>(collections.find((e) => e.value === currentRef) ?? null);
  const publicEntries = collections.filter((e) => e.visibility === "public" && e.selectable);
  const internalSource = sourceKind === "ink-category" && srcEntry?.visibility === "internal";
  const [inkLimit, setInkLimit] = useState(String(section.source?.kind === "ink-category" ? section.source.limit : 6));
  const [display, setDisplay] = useState<ProductDisplay>(section.layout?.display ?? "carousel");
  // A grid lays out more cards than a carousel scrolls through (same ceiling as the save: section-form.ts).
  const maxCards = maxSectionProducts(display);
  const [buyOn, setBuyOn] = useState(Boolean(section.layout?.buyLabel));
  const [tagOn, setTagOn] = useState(Boolean(section.layout?.tags?.text));
  const [ctaKind, setCtaKind] = useState<"none" | "collection-page" | "ink-collection" | "external" | "route" | "page" | "anchor" | "customizer">(section.cta?.dest.kind ?? "none");
  // The collections a "Ver todos" may lead to a page of: every one the region can use (public, or internal and enabled), the section's own first.
  const pageEntries = collections.filter((e) => e.selectable);
  const ctaCollection = section.cta && (section.cta.dest.kind === "collection-page" || section.cta.dest.kind === "ink-collection") ? `${section.cta.dest.store}:${section.cta.dest.collectionId}` : srcEntry?.value ?? currentRef ?? "";

  const [navShow, setNavShow] = useState(Boolean(section.nav));
  const [navLabel, setNavLabel] = useState(section.nav?.label ?? suggestedNavLabel(section));
  const [ccShow, setCcShow] = useState(Boolean(section.customizerCard));
  const ccDefaults = customizerCardFieldDefaults(section.customizerCard);
  const byId = useMemo(() => new Map(media.map((m) => [m.assetId, m])), [media]);
  const hasImage = Boolean(imgM || imgD);

  const liveAppearance: Appearance = {
    fill: fillKind === "none" ? { kind: "none" } : fillKind === "solid" ? { kind: "solid", color: (choice.startsWith("token:") ? choice : isHex(solid) ? solid : "#4d543d") as never } : { kind: "gradient", from: (isHex(gFrom) ? gFrom : "#4d543d") as never, to: (isHex(gTo) ? gTo : "#0a0c0a") as never, angle: gAngle },
    focal: { mobile: focM, desktop: focD },
    overlay: overlayKind === "preset" ? { preset: preset as "none" } : { color: ovColor as `#${string}`, opacity: ovOpacity },
  };
  const issues = hasVisual && !(section.template === "campaign" && !hasImage && fillKind === "none") ? readability(liveAppearance, tone, hasImage, heroTextColors(section), section.template === "product-carousel" && section.layout?.glass === true ? (ground ?? "token:ground") : undefined) : [];

  const cur = section.source;
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="rev" value={rev ?? "null"} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="id" value={section.id} />
      {page && <><input type="hidden" name="page" value={page} /><input type="hidden" name="page_scope" value="1" /></>}
      {regional && regionalTheme && <input type="hidden" name="sul_theme" value={regionalTheme} />}
      {regional && <p className="a-muted text-[0.875rem]">Textos, ordem, layout e coleções desta seção vêm da Sul. Aqui ficam só as imagens e os produtos desta região.</p>}

      {!regional && (
      <fieldset className="space-y-4">
        <legend className="a-h2 mb-3">Conteúdo</legend>
        <div>
          <label className="a-label" htmlFor="title">Título</label>
          {section.template === "hero" ? <textarea id="title" name="title" defaultValue={section.title} className="a-textarea" maxLength={120} rows={2} /> : <input id="title" name="title" defaultValue={section.title} className="a-input" maxLength={120} />}
          {section.template === "hero" && <p className="a-muted mt-1 text-[0.8125rem]">Uma quebra de linha vira a quebra do título.</p>}
          {scope === FOLLOW_SOURCE && <p className="a-muted mt-1 text-[0.8125rem]">Use <code>{REGION_TOKEN}</code> onde deve entrar o nome da região (“Sul”, ou “Norte” e “Centro-Oeste” quando seguem a Sul).</p>}
        </div>
        {scope === FOLLOW_SOURCE && section.template !== "hero" && section.template !== "footer" && section.template !== "page-hero" && (
          <fieldset data-testid="section-regions">
            <legend className="a-label">Aparece em</legend>
            <input type="hidden" name="regions_field" value="1" />
            <div className="flex flex-wrap gap-4">
              {REGION_SLUGS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-[0.9375rem]">
                  <input type="checkbox" name={`region_${r}`} defaultChecked={!section.regions || section.regions.includes(r)} />
                  {REGIONS[r].name}
                </label>
              ))}
            </div>
            <p className="a-muted mt-1 text-[0.8125rem]">Vale para as regiões que seguem a Sul. Desmarque uma região para tirar esta seção só de lá; para trocar o conteúdo nela, duplique a seção e deixe cada cópia em uma região.</p>
          </fieldset>
        )}
        <div>
          <label className="a-label" htmlFor="subtitle">Subtítulo</label>
          <textarea id="subtitle" name="subtitle" defaultValue={section.subtitle} className="a-textarea" maxLength={300} />
          {section.template === "city-styles" && <p className="a-muted mt-1 text-[0.8125rem]">Use <code>{"{city}"}</code> onde o nome da cidade de exemplo deve aparecer.</p>}
        </div>
        {VARIANT_CHOICES[section.template] && (
          <fieldset>
            <legend className="a-label">Composição</legend>
            <input type="hidden" name="variant_present" value="1" />
            <div className="flex flex-wrap gap-3">
              {VARIANT_CHOICES[section.template]!.map(([value, label, help]) => (
                <label key={value || "original"} className="flex max-w-xs cursor-pointer gap-2 border border-black/20 p-3 has-[:checked]:border-black has-[:checked]:bg-white">
                  <input type="radio" name="variant" value={value} defaultChecked={(section.variant ?? "") === value} onChange={() => setVariantNow(value)} className="mt-1" data-testid={`variant-${value || "original"}`} />
                  <span><span className="block font-bold">{label}</span><span className="a-muted block text-[0.8125rem]">{help}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {section.template === "personalization-live" && section.live && (
          <fieldset className="space-y-4" data-testid="live-banner">
            <legend className="a-h2 mb-2">Banner ao vivo</legend>
            <div>
              <label className="a-label" htmlFor="live_customizer">Modelo</label>
              <select id="live_customizer" name="live_customizer" className="a-select" defaultValue={section.live.customizerId}>
                {customizers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.live ? "" : " (ainda não publicado)"}{c.active ? "" : " (desativado)"}</option>)}
              </select>
              <p className="a-muted mt-1 text-[0.8125rem]">A camiseta mostra a primeira arte do modelo. Ela só aparece com o modelo publicado e ativo, com editor de arte; sem isso, o banner não aparece.</p>
            </div>
            <div className="max-w-sm">
              <label className="a-label" htmlFor="live_button">Texto do botão</label>
              <input id="live_button" name="live_button" className="a-input" maxLength={32} defaultValue={section.live.button} />
              <p className="a-muted mt-1 text-[0.8125rem]">Leva à página do modelo, já com o que o cliente escreveu.</p>
            </div>
            <div>
              <label className="a-label" htmlFor="live_examples">Exemplos que ele “digita” sozinho (um por linha)</label>
              <textarea id="live_examples" name="live_examples" className="a-textarea" rows={5} defaultValue={section.live.examples.join("\n")} placeholder={"Belém/PA | BEL-1616\nFlorianópolis/SC | FLO-1726"} />
              <p className="a-muted mt-1 text-[0.8125rem]">As respostas na ordem dos campos do modelo, separadas por “ | ”; cidade como Nome/UF. Até 8 linhas. Sem exemplos, ele mostra o exemplo da própria arte. Quem ativou “reduzir movimento” no aparelho vê só o primeiro, parado.</p>
            </div>
          </fieldset>
        )}
        {section.template === "city-styles" && (
          <div className="max-w-[12rem]">
            <label className="a-label" htmlFor="count">Quantos estilos mostrar</label>
            <input id="count" name="count" type="number" min={1} max={MAX_CITY_STYLES} defaultValue={section.count ?? MAX_CITY_STYLES} className="a-input" />
            <p className="a-muted mt-1 text-[0.8125rem]">Até {MAX_CITY_STYLES}. Só aparecem os que existem de verdade para a cidade de exemplo.</p>
          </div>
        )}
        {notes.length > 0 && (
          <div className="a-flash ok text-[0.875rem]" role="status">
            <p className="font-extrabold">Dados reais desta região</p>
            {notes.map((n) => <p key={n} className="mt-1">{n}</p>)}
          </div>
        )}
      </fieldset>
      )}

      {section.template === "states" && stateCovers && (
        <fieldset className="space-y-4">
          <legend className="a-h2 mb-3">Banner de cada estado</legend>
          <input type="hidden" name="state_covers_present" value="1" />
          <p className="a-muted text-[0.875rem]">Uma imagem para cada estado, mostrada no topo do cartão do estado. Escolha entre os banners do projeto e as imagens que você enviou em Mídia. Sem imagem, o cartão fica só com o texto{stateCovers.some((s) => s.legacy) ? " (ou com o banner que o código já tem para o estado)" : ""}.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {stateCovers.map((st) => {
              const current = section.stateCovers?.[st.uf];
              return (
                <div key={st.uf} className="border border-black/15 bg-white p-3">
                  <label className="a-label" htmlFor={`state_cover_${st.uf}`}>{st.name} ({st.uf})</label>
                  <select id={`state_cover_${st.uf}`} name={`state_cover_${st.uf}`} className="a-select" defaultValue={current?.assetId ?? ""}>
                    <option value="">{st.legacy ? "Banner atual do código" : "Sem imagem"}</option>
                    <optgroup label="Banners do projeto">{media.filter((m) => m.kind === "banner").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>
                    {media.some((m) => m.kind === "upload") && <optgroup label="Enviadas">{media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>}
                  </select>
                  <p className="a-muted mt-1 text-[0.8125rem]">{sizeHintText(STATE_COVER)}</p>
                  <label className="a-label mt-2" htmlFor={`state_alt_${st.uf}`}>Descrição da imagem (opcional; vazio = decorativa)</label>
                  <input id={`state_alt_${st.uf}`} name={`state_alt_${st.uf}`} defaultValue={current?.alt ?? ""} className="a-input" maxLength={200} />
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {section.template === "image-grid" && (
        <GridTilesEditor
          scope={scope}
          tiles={section.tiles ?? []}
          layout={section.grid ?? { columns: 4, aspect: "portrait", labels: "below" }}
          media={media}
          thumbOf={(assetId) => previewSrc(byId.get(assetId))}
          collections={pageEntries}
          pages={pages}
          anchors={anchors.filter((x) => x.anchor !== section.anchor)}
          customizers={customizers}
          checkpoints={variantNow === "checkpoints"}
          accumulate={section.accumulate === true}
          seal={section.sealCollections === true}
        />
      )}

      {!regional && section.template === "hero" && section.variant === "feature" && (
        <HeroScheduleEditor scope={scope} entries={section.heroSchedule ?? []} pages={pages} collections={pageEntries} anchors={anchors.filter((x) => x.anchor !== section.anchor)} />
      )}

      {!regional && section.template === "hero" && <HeroColorsEditor colors={section.heroColors} feature={section.variant === "feature"} sectionGround={fillKind === "solid" && choice === "custom" ? solid : undefined} />}

      {section.template === "hero" && featured && (
        <HeroFeaturedProducts
          scope={scope}
          regionName={featured.regionName}
          mode={featured.mode}
          initial={featured.initial}
          eligible={featured.eligible}
          search={featured.search}
          feature={section.variant === "feature"}
          max={section.variant === "feature" ? MAX_FEATURED : HERO_CARDS}
          media={media}
          thumbOf={(assetId) => previewSrc(byId.get(assetId))}
          rotation={section.featuredRotation}
          barHidden={section.hideFeaturedBar === true}
        />
      )}

      {!regional && section.template === "page-hero" && (
        <fieldset className="space-y-3">
          <legend className="a-h2 mb-3">Cor do texto</legend>
          <select name="layout_tone" className="a-select max-w-xs" value={tone} onChange={(e) => setTone(e.target.value as "light" | "dark")} aria-label="Cor do texto">
            <option value="dark">Texto claro (sobre fundo escuro)</option>
            <option value="light">Texto escuro (sobre fundo claro)</option>
          </select>
        </fieldset>
      )}

      {!regional && isCarousel && display !== "paged" && (
        <fieldset className="space-y-4">
          <legend className="a-h2 mb-3">Primeiro card personalizável</legend>
          <input type="hidden" name="cc_present" value="1" />
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="cc_show" checked={ccShow} onChange={(e) => setCcShow(e.target.checked)} /> Destacar um produto personalizável como primeiro card</label>
          <p className="a-muted text-[0.875rem]">O primeiro card fica sempre na posição 1, na mesma família visual dos produtos, e leva à página de personalização desta região (não abre o checkout da INK). A seção continua com o mesmo total de cards: 1 personalizável + os demais produtos.</p>
          {ccShow && (
            <div className="space-y-4">
              <div>
                <label className="a-label" htmlFor="cc_customizer">Modelo de personalização (desta região)</label>
                <select id="cc_customizer" name="cc_customizer" className="a-select" defaultValue={section.customizerCard?.customizerId ?? ""} required>
                  <option value="" disabled>Escolha…</option>
                  {customizers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.live ? "" : " (ainda não publicado)"}{c.active ? "" : " (desativado)"}</option>)}
                </select>
                {customizers.length === 0 && <p className="a-flash err mt-2 text-[0.875rem]">Esta região ainda não tem modelos. Cadastre em Personalização.</p>}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="a-label" htmlFor="cc_title">Título do card</label><input id="cc_title" name="cc_title" defaultValue={ccDefaults.title} className="a-input" maxLength={60} required /></div>
                <div><label className="a-label" htmlFor="cc_button">Texto do botão</label><input id="cc_button" name="cc_button" defaultValue={ccDefaults.button} className="a-input" maxLength={24} required /></div>
              </div>
              <div><label className="a-label" htmlFor="cc_description">Descrição curta (opcional)</label><input id="cc_description" name="cc_description" defaultValue={ccDefaults.description} className="a-input" maxLength={120} /></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="a-label" htmlFor="cc_image">Imagem do card (mockup próprio da estampa)</label>
                  <select id="cc_image" name="cc_image" className="a-select" defaultValue={section.customizerCard?.image?.assetId ?? ""}>
                    <option value="">Usar a imagem do modelo</option>
                    {media.some((m) => m.kind === "upload") && <optgroup label="Enviadas">{media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>}
                    <optgroup label="Banners do projeto">{media.filter((m) => m.kind === "banner").map((m) => <option key={m.assetId} value={m.assetId}>{m.label}</option>)}</optgroup>
                  </select>
                  <p className="a-muted mt-1 text-[0.8125rem]">{sizeHintText(PRODUCT_CARD_IMAGE)}</p>
                </div>
                <div><label className="a-label" htmlFor="cc_alt">Descrição da imagem (acessibilidade)</label><input id="cc_alt" name="cc_alt" defaultValue={section.customizerCard?.image?.alt ?? ""} className="a-input" maxLength={200} /></div>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {!regional && (section.template === "campaign" || section.template === "page-hero" || (section.template === "image-grid" && variantNow === "checkpoints")) && (
        <fieldset className="space-y-4">
          <legend className="a-h2 mb-3">Botão</legend>
          {section.template === "image-grid" && <p className="a-muted text-[0.8125rem]">Ao lado do título da faixa, como o “Ver todos” das vitrines: por exemplo “Ver calendário da Black”, levando para a hotpage do calendário.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="a-label" htmlFor="cta_kind">Destino</label>
              <select id="cta_kind" name="cta_kind" className="a-select" value={ctaKind} onChange={(e) => setCtaKind(e.target.value as typeof ctaKind)}>
                <option value="none">{section.template === "image-grid" ? "Sem botão" : "Busca de cidade (padrão)"}</option>
                <option value="collection-page">Página de uma coleção (no site)</option>
                <option value="route">Página desta região (endereço)</option>
                <option value="page">Hotpage ou categoria-pai publicada</option>
                <option value="anchor">Uma seção desta página</option>
                <option value="customizer">Página de personalização (um modelo, ex.: Localidade)</option>
                <option value="external">URL da loja Use (Sul, Norte ou Centro)</option>
              </select>
            </div>
            {ctaKind !== "none" && <div><label className="a-label" htmlFor="cta_label">Texto do botão</label><input id="cta_label" name="cta_label" defaultValue={section.cta?.label ?? "Ver mais"} className="a-input" maxLength={32} /></div>}
          </div>
          {ctaKind === "customizer" && (
            <div>
              <label className="a-label" htmlFor="cta_customizer">Modelo</label>
              <select id="cta_customizer" name="cta_customizer" className="a-select" defaultValue={section.cta?.dest.kind === "customizer" ? section.cta.dest.customizerId : ""} required>
                <option value="" disabled>Escolha…</option>
                {customizers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.live ? "" : " (ainda não publicado)"}{c.active ? "" : " (desativado)"}</option>)}
              </select>
              {customizers.length === 0 ? (
                <p className="a-flash err mt-2 text-[0.875rem]">Esta região ainda não tem modelos. Cadastre em Personalização.</p>
              ) : (
                section.template === "campaign" && <p className="a-muted mt-1 text-[0.8125rem]">Na composição “Dividida” sem imagem, a foto do modelo entra no lugar da imagem.</p>
              )}
            </div>
          )}
          {ctaKind === "collection-page" && (
            <div>
              <label className="a-label" htmlFor="cta_collection">Coleção</label>
              <select id="cta_collection" name="cta_collection" className="a-select" defaultValue={section.cta?.dest.kind === "collection-page" ? `${section.cta.dest.store}:${section.cta.dest.collectionId}` : ""} required>
                <option value="" disabled>Escolha…</option>
                {pageEntries.map((c) => <option key={c.value} value={c.value}>{c.name} · {c.matchedCount} produtos{c.visibility === "internal" ? " · interna" : ""}</option>)}
              </select>
            </div>
          )}
          {ctaKind === "page" && <PagePicker pages={pages} current={section.cta?.dest.kind === "page" ? `${section.cta.dest.pageKind}/${section.cta.dest.slug}` : ""} />}
          {ctaKind === "anchor" && <AnchorPicker anchors={anchors} current={section.cta?.dest.kind === "anchor" ? section.cta.dest.anchor : ""} />}
          {ctaKind === "route" && <div><label className="a-label" htmlFor="cta_route">Caminho (dentro de /{scope})</label><input id="cta_route" name="cta_route" defaultValue={section.cta?.dest.kind === "route" ? section.cta.dest.path : `/${scope}`} className="a-input" placeholder={`/${scope}/pa`} /><p className="a-muted mt-1 text-[0.8125rem]">Ex.: <code>/{scope}</code> ou a página de um estado. Um caminho de outra região é recusado.</p></div>}
          {ctaKind === "external" && <div><label className="a-label" htmlFor="cta_url">URL (https, hosts Use Sul/Norte/Centro)</label><input id="cta_url" name="cta_url" defaultValue={section.cta?.dest.kind === "external" ? section.cta.dest.url : ""} className="a-input" placeholder="https://www.usenorte.com.br/" /></div>}
        </fieldset>
      )}

      {!regional && isCarousel && (
        <fieldset className="space-y-3" data-testid="period">
          <legend className="a-h2 mb-2">Período da oferta (opcional)</legend>
          <input type="hidden" name="period_present" value="1" />
          <p className="a-muted max-w-3xl text-[0.875rem]">Para o calendário da Black: fora do período, a vitrine fica atrás de um vidro com o cadeado. Antes de abrir, a loja não mostra nenhum produto nem o título (que diz qual é a oferta), só o rótulo abaixo e o período. Depois de encerrar, mostra “Oferta encerrada”. Dias no horário de Brasília, os dois inclusive. Sem datas, a vitrine aparece sempre.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div><label className="a-label" htmlFor="period_from">Abre em</label><input id="period_from" name="period_from" type="date" defaultValue={section.period?.opensAt ?? ""} className="a-input" /></div>
            <div><label className="a-label" htmlFor="period_to">Encerra em (inclusive)</label><input id="period_to" name="period_to" type="date" defaultValue={section.period?.closesAt ?? ""} className="a-input" /></div>
            <div><label className="a-label" htmlFor="period_label">Rótulo enquanto fechada</label><input id="period_label" name="period_label" defaultValue={section.period?.label ?? ""} className="a-input" maxLength={40} placeholder="Semana 2" /></div>
          </div>
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" name="period_seal" defaultChecked={section.sealCollections === true} data-testid="period-seal" />
            Fechar a página da coleção até o dia de abrir
          </label>
          <p className="a-muted -mt-2 text-[0.8125rem]">Ligado: até o “Abre em”, quem abrir o endereço da coleção vê só um cadeado com o dia. A coleção também sai da busca e do mapa do site. Use só em coleção criada para a oferta (Black Week 01…), nunca em coleção do dia a dia, como Seu Lugar ou Natal.</p>
        </fieldset>
      )}

      {!regional && isCarousel && (
        <>
          <fieldset className="space-y-4">
            <legend className="a-h2 mb-3">Produtos</legend>
            <div className="max-w-xl">
              <label className="a-label" htmlFor="source_sort">Ordenação padrão desta seção</label>
              <select id="source_sort" name="source_sort" className="a-select" value={automaticSort} onChange={(e) => setAutomaticSort(e.target.value as ProductSort | "")} aria-describedby="source-sort-help">
                <option value="">{page ? `Usar padrão da página (${PRODUCT_SORT_LABEL[pageDefaultSort ?? "collection"]})` : "Usar ordem original da fonte"}</option>
                {PRODUCT_SORTS.map((sort) => <option key={sort} value={sort}>{PRODUCT_SORT_LABEL[sort]}</option>)}
              </select>
              <p id="source-sort-help" className="a-muted mt-2 text-[0.875rem]">Aplicada antes do limite de cards. A ordem manual da coleção tem prioridade. Novidades usa a data de cadastro; Mais vendidas usa as vendas dos últimos 30 dias quando O Pódio está ligado e apurado; senão, o total acumulado de vendas da INK.</p>
              {sourceKind === "umapenca" && <p className="a-muted mt-2 text-[0.875rem]">O feed da Uma Penca não informa datas de cadastro nem vendas. Nessa fonte, Novidades e Mais vendidas mantêm a ordem do feed.</p>}
            </div>
            <div role="radiogroup" aria-label="Fonte" className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 font-bold"><input type="radio" name="source_kind" value="editorial-module" checked={sourceKind === "editorial-module"} onChange={() => setSourceKind("editorial-module")} /> Curadoria editorial atual</label>
              <label className="flex items-center gap-2 font-bold"><input type="radio" name="source_kind" value="ink-category" checked={sourceKind === "ink-category"} onChange={() => setSourceKind("ink-category")} disabled={collections.length === 0} /> Coleção da INK</label>
              <label className="flex items-center gap-2 font-bold"><input type="radio" name="source_kind" value="umapenca" checked={sourceKind === "umapenca"} onChange={() => setSourceKind("umapenca")} /> Uma Penca (canecas, ecobags)</label>
            </div>
            {sourceKind === "umapenca" ? (
              <div className="grid gap-4 md:grid-cols-[3fr_1fr]">
                <fieldset>
                  <legend className="a-label">Tipos (do feed da Uma Penca, na ordem do feed)</legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {ARTICLE_KINDS.map((k) => (
                      <label key={k} className="flex items-center gap-2 font-bold"><input type="checkbox" name={`source_up_${k}`} defaultChecked={cur?.kind === "umapenca" ? cur.articleKinds.includes(k) : k === "caneca"} /> {ARTICLE_KIND_LABELS[k].plural}</label>
                    ))}
                  </div>
                  <p className="a-muted mt-1 text-[0.8125rem]">Nenhuma coleção da INK: os cards abrem a loja da Uma Penca. Para “Crie a sua”, use “Destacar um produto personalizável” abaixo e escolha um modelo da Uma Penca.</p>
                </fieldset>
                <div>
                  <label className="a-label" htmlFor="source_limit">Cards (até {maxCards})</label>
                  <input id="source_limit" name="source_limit" type="number" min={MIN_SECTION_PRODUCTS} max={maxCards} defaultValue={cur?.kind === "umapenca" ? cur.limit : 8} className="a-input" />
                </div>
              </div>
            ) : sourceKind === "editorial-module" ? (
              <div>
                <label className="a-label" htmlFor="source_module">Módulo</label>
                <select id="source_module" name="source_module" className="a-select" defaultValue={cur?.kind === "editorial-module" ? cur.key : "terra"}>
                  {MODULES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <p className="a-muted mt-1 text-[0.8125rem]">Os produtos escolhidos por regra no código (a curadoria da home atual).</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-[3fr_1fr]">
                <CollectionCombobox name="source_collection" label="Coleção (busque pelo nome, slug ou número)" entries={collections} defaultValue={currentRef} libraryFrom={`/admin/home/${section.id}`} onSelect={setSrcEntry} />
                <div>
                  <label className="a-label" htmlFor="source_limit">{display === "paged" ? `Produtos por página (até ${maxCards})` : `Cards (até ${maxCards})`}</label>
                  <input id="source_limit" name="source_limit" type="number" min={MIN_SECTION_PRODUCTS} max={maxCards} value={inkLimit} onChange={(e) => setInkLimit(e.target.value)} className="a-input" />
                </div>
              </div>
            )}
            {sourceKind === "ink-category" && cur?.kind === "ink-category" && collectionMembers && collectionMembers.length > 0 && (srcEntry?.value ?? currentRef) === currentRef && (
              <CollectionOrder
                collectionRef={currentRef!}
                automaticSort={automaticSort || pageDefaultSort || "collection"}
                members={collectionMembers}
                initial={{ order: collectionArrangement?.productIds?.length ? "manual" : "category", productIds: collectionArrangement?.productIds, hiddenIds: collectionArrangement?.hiddenIds }}
                // Same clamp as the save (3..24, or up to 48 in a grid); the customizer card takes the first place. A paged grid shows them all.
                visible={display === "paged" ? null : Math.min(maxCards, Math.max(MIN_SECTION_PRODUCTS, Math.round(Number(inkLimit)) || 6)) - (ccShow ? 1 : 0)}
                total={srcEntry?.value === currentRef ? srcEntry?.matchedCount : undefined}
              />
            )}
            {sourceKind === "ink-category" && srcEntry && srcEntry.value !== currentRef && <p className="a-muted text-[0.8125rem]">Salve o rascunho para ordenar manualmente ou esconder os produtos desta coleção. A ordenação padrão acima já vale na prévia depois de salvar.</p>}
            {sourceKind === "ink-category" && section.id.startsWith("seed-") && <p className="a-flash err text-[0.875rem]">Atenção: isto substitui a curadoria original desta seção por uma coleção da INK, com a ordenação padrão escolhida acima. Só vale na loja depois de publicar.</p>}
          </fieldset>

          {display === "paged" ? (
            <p className="a-muted text-[0.875rem]">Na grade paginada não há botão “Ver todos”: ela já mostra todos os produtos da coleção.</p>
          ) : (
          <fieldset className="space-y-4">
            <legend className="a-h2 mb-3">Botão “Ver todos”</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="a-label" htmlFor="cta_kind">Destino</label>
                <select id="cta_kind" name="cta_kind" className="a-select" value={ctaKind} onChange={(e) => setCtaKind(e.target.value as typeof ctaKind)}>
                  <option value="none">Sem botão</option>
                  <option value="collection-page">Página da coleção (no site, com todos os produtos)</option>
                  {/* An internal collection has no verified public page on INK: never an invented URL. */}
                  {(!internalSource || ctaKind === "ink-collection") && <option value="ink-collection">Coleção da INK (página na loja da INK)</option>}
                  <option value="external">URL da loja Use (Sul, Norte ou Centro)</option>
                  <option value="route">Página desta loja</option>
                  <option value="page">Hotpage ou categoria-pai publicada</option>
                  <option value="anchor">Uma seção desta página</option>
                </select>
              </div>
              {ctaKind !== "none" && <div><label className="a-label" htmlFor="cta_label">Texto do botão</label><input id="cta_label" name="cta_label" defaultValue={section.cta?.label ?? "Ver todos"} className="a-input" maxLength={32} /></div>}
            </div>
            {ctaKind === "collection-page" && (
              <div>
                <label className="a-label" htmlFor="cta_collection">Coleção</label>
                <select key="page" id="cta_collection" name="cta_collection" className="a-select" defaultValue={pageEntries.some((c) => c.value === ctaCollection) ? ctaCollection : ""} required>
                  <option value="" disabled>Escolha…</option>
                  {pageEntries.map((c) => <option key={c.value} value={c.value}>{c.name} · {c.matchedCount} produtos{c.visibility === "internal" ? " · interna" : ""}</option>)}
                </select>
                <p className="a-muted mt-1 text-[0.8125rem]">A página fica em <code>/{scope}/colecoes/…</code> com todos os produtos da coleção, em páginas, na mesma ordem e sem os produtos escondidos daqui. Ela existe sozinha; para trocar o título, a imagem ou o texto, use “Personalizar página” em Coleções.</p>
              </div>
            )}
            {ctaKind === "ink-collection" && (
              <div>
                <label className="a-label" htmlFor="cta_collection">Coleção</label>
                <select key="ink" id="cta_collection" name="cta_collection" className="a-select" defaultValue={section.cta?.dest.kind === "ink-collection" ? `${section.cta.dest.store}:${section.cta.dest.collectionId}` : ""} required>
                  <option value="" disabled>Escolha…</option>
                  {publicEntries.map((c) => <option key={c.value} value={c.value}>{c.name} · {c.matchedCount} produtos</option>)}
                </select>
              </div>
            )}
            {ctaKind === "external" && <div><label className="a-label" htmlFor="cta_url">URL (https, hosts Use Sul/Norte/Centro)</label><input id="cta_url" name="cta_url" defaultValue={section.cta?.dest.kind === "external" ? section.cta.dest.url : ""} className="a-input" placeholder="https://www.usesul.com.br/usesul/collections/…" /></div>}
            {ctaKind === "page" && <PagePicker pages={pages} current={section.cta?.dest.kind === "page" ? `${section.cta.dest.pageKind}/${section.cta.dest.slug}` : ""} />}
            {ctaKind === "anchor" && <AnchorPicker anchors={anchors} current={section.cta?.dest.kind === "anchor" ? section.cta.dest.anchor : ""} />}
            {ctaKind === "route" && <div><label className="a-label" htmlFor="cta_route">Caminho</label><input id="cta_route" name="cta_route" defaultValue={section.cta?.dest.kind === "route" ? section.cta.dest.path : ""} className="a-input" placeholder="/sul/sc" /></div>}
          </fieldset>
          )}

          <fieldset className="space-y-4">
            <legend className="a-h2 mb-3">Layout</legend>
            <div role="radiogroup" aria-label="Exibição dos produtos" className="grid gap-3 md:grid-cols-2">
              {([
                ["carousel", "Carrossel", "Uma fileira que a pessoa arrasta para o lado. Até 24 cards."],
                ["grid", "Grade", "Todos os produtos na página, como numa categoria: 4 por linha no desktop, 3 no tablet e 2 no celular. Até 48 cards."],
                // Only on a parent-category landing (its address carries the page numbers), only for an INK collection.
                ...(pageKind === "categoryLanding" && sourceKind === "ink-category" ? [["paged", "Grade paginada (página da coleção)", "Todos os produtos da coleção, em páginas: os cards abaixo são os de cada página. Sem botão “Ver todos” nem card personalizável."]] as const : []),
              ] as const).map(([value, label, help]) => (
                <label key={value} className={`flex cursor-pointer gap-3 border p-3 ${display === value ? "border-black bg-white" : "border-black/20"}`}>
                  <input type="radio" name="layout_display" value={value} checked={display === value} onChange={() => setDisplay(value)} className="mt-1" />
                  <span><span className="block font-bold">{label}</span><span className="a-muted block text-[0.8125rem]">{help}</span></span>
                </label>
              ))}
            </div>
            {display === "grid" && <p className="a-muted text-[0.8125rem]">Dica: na grade, um múltiplo de 4 (8, 12, 16…) fecha as linhas no desktop; com o card personalizável ligado, ele conta como um dos cards.</p>}
            <div className="grid gap-4 md:grid-cols-3">
              <div><label className="a-label" htmlFor="layout_variant">Cards</label><select id="layout_variant" name="layout_variant" className="a-select" defaultValue={section.layout?.variant ?? "standard"}><option value="standard">Padrão</option><option value="poster">Pôster (mais editorial)</option></select></div>
              <div><label className="a-label" htmlFor="layout_surface">Superfície</label><select id="layout_surface" name="layout_surface" className="a-select" defaultValue={section.layout?.surface ?? "plain"}><option value="plain">Fundo da página</option><option value="paper">Papel</option><option value="region-primary">Verde regional</option></select></div>
              <div><label className="a-label" htmlFor="layout_tone">Cor do texto</label><select id="layout_tone" name="layout_tone" className="a-select" value={tone} onChange={(e) => setTone(e.target.value as "light" | "dark")}><option value="light">Escuro (para fundos claros)</option><option value="dark">Claro (para fundos escuros)</option></select></div>
            </div>
            <label className="flex items-start gap-2"><input type="checkbox" name="layout_glass" defaultChecked={section.layout?.glass === true} className="mt-1" /><span><span className="block font-bold">Cor de fundo como vidro</span><span className="a-muted block text-[0.8125rem]">A cor de fundo da seção fica translúcida, sobre um desfoque do fundo da página (com o pattern, se houver), em vez de uma faixa sólida. Use com uma cor de fundo definida em Aparência.</span></span></label>
            <div className="space-y-2 border border-black/20 p-3">
              <input type="hidden" name="layout_buy_present" value="1" />
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="layout_buy" checked={buyOn} onChange={(e) => setBuyOn(e.target.checked)} /> Botão de compra em cada card de produto</label>
              <p className="a-muted text-[0.8125rem]">Um botão no pé de cada card, alinhado em todos. Ele faz parte do próprio card: abre a mesma página do produto na loja (onde a pessoa escolhe tamanho e cor) e conta o mesmo clique. O texto sugerido é “{DEFAULT_BUY_LABEL}”; dá para trocar por “Comprar”, por exemplo. No formato “carrinho na imagem”, um botão redondo de carrinho fica no canto da foto e o texto vira o nome dele para leitores de tela. Com o botão embaixo, o card personalizável mostra o texto do botão dele no mesmo formato.</p>
              {buyOn && (
                <div className="max-w-xs">
                  <label className="a-label" htmlFor="layout_buy_label">Texto do botão</label>
                  <input id="layout_buy_label" name="layout_buy_label" defaultValue={section.layout?.buyLabel ?? DEFAULT_BUY_LABEL} className="a-input" maxLength={MAX_BUY_LABEL} placeholder={DEFAULT_BUY_LABEL} />
                  <fieldset className="mt-3">
                    <legend className="a-label">Formato</legend>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2"><input type="radio" name="layout_buy_style" value="button" defaultChecked={!section.layout?.buyStyle || section.layout.buyStyle === "button"} /> Botão embaixo</label>
                      <label className="flex items-center gap-2"><input type="radio" name="layout_buy_style" value="fab" defaultChecked={section.layout?.buyStyle === "fab"} /> Carrinho na imagem</label>
                      <label className="flex items-center gap-2"><input type="radio" name="layout_buy_style" value="link" defaultChecked={section.layout?.buyStyle === "link"} /> Chamada ao lado do preço (“{DEFAULT_BUY_LABEL} →”)</label>
                    </div>
                  </fieldset>
                </div>
              )}
            </div>
            <fieldset className="space-y-2 border border-black/20 p-3">
              <legend className="px-1 font-bold">Etiquetas nas fotos dos produtos</legend>
              <input type="hidden" name="tags_present" value="1" />
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="tags_discount" defaultChecked={Boolean(section.layout?.tags?.discount)} /> Desconto (“18% OFF”) nos produtos em promoção</label>
              <p className="a-muted text-[0.8125rem]">Calculado com os dois preços que a INK (ou a Uma Penca) envia, arredondado como a própria loja mostra. Só aparece nos produtos com promoção valendo, depois de sincronizar o catálogo; sem promoção, nenhuma etiqueta.</p>
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="tags_custom" checked={tagOn} onChange={(e) => setTagOn(e.target.checked)} /> Etiqueta própria nos cards desta seção</label>
              {tagOn && (
                <div className="max-w-xs">
                  <label className="a-label" htmlFor="tags_text">Texto da etiqueta</label>
                  <input id="tags_text" name="tags_text" defaultValue={section.layout?.tags?.text ?? ""} className="a-input" maxLength={MAX_TAG_TEXT} placeholder="Ex.: Black Friday" required />
                  <p className="a-muted mt-1 text-[0.8125rem]">Até {MAX_TAG_TEXT} caracteres, em caixa alta na foto. Com o desconto ligado, as duas aparecem juntas.</p>
                  <label className="mt-2 flex items-center gap-2 font-bold"><input type="checkbox" name="tags_on_sale" defaultChecked={Boolean(section.layout?.tags?.onSale)} /> Só nos produtos em promoção</label>
                  <p className="a-muted text-[0.8125rem]">Desmarcado, aparece em todos os cards. Marcado, só onde a loja mostra o “de/por” (ex.: “Black Friday” nunca fica sobre um preço cheio).</p>
                </div>
              )}
            </fieldset>
          </fieldset>
        </>
      )}

      {hasVisual && (
        <fieldset className="space-y-5">
          <legend className="a-h2 mb-3">{regional ? "Imagem" : "Fundo"}</legend>
          <p className="a-muted text-[0.875rem]">{regional ? "A foto desta seção nesta região. Sem imagem, aparece a cor da seção, a mesma da Sul." : "A imagem é opcional e faz parte da própria seção. Sem imagem, aparece a cor ou o degradê escolhido — nunca uma faixa vazia."}</p>
          {!regional && (<>
          <div role="radiogroup" aria-label="Cor de fundo" className="flex flex-wrap gap-4">
            {([["none", "Sem cor própria"], ["solid", "Cor sólida"], ["gradient", "Degradê"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 font-bold"><input type="radio" name="fill_kind" value={k} checked={fillKind === k} onChange={() => setFillKind(k)} /> {l}</label>
            ))}
          </div>
          {fillKind === "solid" && (
            <div className="grid items-end gap-4 md:grid-cols-[2fr_1fr]">
              <div>
                <label className="a-label" htmlFor="fill_color_choice">Cor</label>
                <select id="fill_color_choice" name="fill_color_choice" className="a-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
                  <option value="token:ground">Fundo da página</option>
                  <option value="token:region-primary">Verde regional</option>
                  <option value="token:near-black">Preto da campanha</option>
                  <option value="custom">Outra cor…</option>
                </select>
              </div>
              {choice === "custom" && <div className="flex items-center gap-2"><input type="color" aria-label="Escolher cor" value={isHex(solid) ? solid : "#4d543d"} onChange={(e) => setSolid(e.target.value)} className="h-10 w-14" /><input name="fill_color" value={solid} onChange={(e) => setSolid(e.target.value)} className="a-input" aria-label="Cor em hexadecimal" maxLength={7} /></div>}
            </div>
          )}
          {fillKind === "gradient" && (
            <div className="grid items-end gap-4 md:grid-cols-3">
              <div><label className="a-label" htmlFor="grad_from">De</label><div className="flex items-center gap-2"><input type="color" aria-label="Cor inicial" value={isHex(gFrom) ? gFrom : "#4d543d"} onChange={(e) => setGFrom(e.target.value)} className="h-10 w-14" /><input id="grad_from" name="grad_from" value={gFrom} onChange={(e) => setGFrom(e.target.value)} className="a-input" maxLength={7} /></div></div>
              <div><label className="a-label" htmlFor="grad_to">Para</label><div className="flex items-center gap-2"><input type="color" aria-label="Cor final" value={isHex(gTo) ? gTo : "#0a0c0a"} onChange={(e) => setGTo(e.target.value)} className="h-10 w-14" /><input id="grad_to" name="grad_to" value={gTo} onChange={(e) => setGTo(e.target.value)} className="a-input" maxLength={7} /></div></div>
              <div><label className="a-label" htmlFor="grad_angle">Ângulo {gAngle}°</label><input id="grad_angle" name="grad_angle" type="range" min={0} max={360} value={gAngle} onChange={(e) => setGAngle(Number(e.target.value))} className="w-full" /></div>
            </div>
          )}
          </>)}

          <div className="grid gap-4 md:grid-cols-2">
            {([["mobile", "Imagem mobile", imgM, setImgM, "img_mobile"], ["desktop", "Imagem desktop", imgD, setImgD, "img_desktop"]] as const).map(([k, label, value, set, name]) => (
              <div key={k}>
                <label className="a-label" htmlFor={name}>{label} (opcional)</label>
                <select id={name} name={name} className="a-select" value={value} onChange={(e) => set(e.target.value)}>
                  <option value="">Sem imagem</option>
                  <optgroup label="Banners do projeto">{media.filter((m) => m.kind === "banner").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>
                  {media.some((m) => m.kind === "upload") && <optgroup label="Enviadas neste computador">{media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>}
                </select>
                <p className="a-muted mt-1 text-[0.8125rem]">{sizeHintText(sectionImageSizes(section.template, section.variant)[k])}</p>
              </div>
            ))}
          </div>
          {hasImage && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="img_decorative" checked={decorative} onChange={(e) => setDecorative(e.target.checked)} /> Imagem decorativa (sem descrição)</label>
                {!decorative && <div><label className="a-label" htmlFor="img_alt">Descrição da imagem (acessibilidade)</label><input id="img_alt" name="img_alt" defaultValue={a.image?.mobile?.alt ?? a.image?.desktop?.alt ?? ""} className="a-input" maxLength={200} required /></div>}
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="reuse_mobile" defaultChecked={a.image?.reuseMobileOnDesktop === true} /> Usar a imagem mobile também no desktop</label>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <FocalPad label="Foco no mobile" image={byId.get(imgM)} x={focM.x} y={focM.y} onChange={(x, y) => setFocM({ x, y })} />
                <FocalPad label="Foco no desktop" image={byId.get(imgD) ?? byId.get(imgM)} x={focD.x} y={focD.y} onChange={(x, y) => setFocD({ x, y })} />
              </div>
              <input type="hidden" name="focal_mx" value={focM.x} /><input type="hidden" name="focal_my" value={focM.y} />
              <input type="hidden" name="focal_dx" value={focD.x} /><input type="hidden" name="focal_dy" value={focD.y} />
            </>
          )}
          {!hasImage && (<><input type="hidden" name="focal_mx" value={focM.x} /><input type="hidden" name="focal_my" value={focM.y} /><input type="hidden" name="focal_dx" value={focD.x} /><input type="hidden" name="focal_dy" value={focD.y} /></>)}
          {!regional && (<>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="a-label" htmlFor="overlay_kind">Sobreposição sobre a imagem</label>
              <select id="overlay_kind" name="overlay_kind" className="a-select" value={overlayKind} onChange={(e) => setOverlayKind(e.target.value as "preset" | "custom")}>
                <option value="preset">Véus da marca</option>
                <option value="custom">Cor e intensidade</option>
              </select>
            </div>
            {overlayKind === "preset" ? (
              <div><label className="a-label" htmlFor="overlay_preset">Véu</label><select id="overlay_preset" name="overlay_preset" className="a-select" value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)}>{PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            ) : (
              <div className="grid grid-cols-[auto_1fr] items-end gap-3">
                <div><label className="a-label" htmlFor="overlay_color">Cor</label><input id="overlay_color" name="overlay_color" type="color" value={ovColor} onChange={(e) => setOvColor(e.target.value)} className="h-10 w-14" /></div>
                <div><label className="a-label" htmlFor="overlay_opacity">Intensidade {ovOpacity.toFixed(2)}</label><input id="overlay_opacity" name="overlay_opacity" type="range" min={0} max={0.85} step={0.05} value={ovOpacity} onChange={(e) => setOvOpacity(Number(e.target.value))} className="w-full" /></div>
              </div>
            )}
          </div>
          {section.template === "campaign" && (
            <div>
              <label className="a-label" htmlFor="fallback">Sem imagem, mostrar</label>
              <select id="fallback" name="fallback" className="a-select" defaultValue={section.fallback ?? "crops"}><option value="crops">Recortes de camisetas (padrão)</option><option value="fill">Só a cor/degradê acima</option></select>
            </div>
          )}
          </>)}
          {/* In the regional mode too: the region's picture goes under Sul's veil and text colour, the place where a title can become unreadable. */}
          {issues.length > 0 && (
            <div className={`a-flash ${issues.some((i) => i.level === "blocking") ? "err" : "ok"}`} role="status">
              <p className="font-extrabold">Legibilidade do texto</p>
              {issues.map((i) => <p key={i.message}>{i.level === "blocking" ? "⛔ " : "⚠️ "}{i.message}</p>)}
            </div>
          )}
        </fieldset>
      )}

      {!regional && section.template !== "hero" && section.template !== "footer" && section.template !== "page-hero" && !page && (
        <fieldset className="space-y-3">
          <legend className="a-h2 mb-3">Menu do topo</legend>
          <input type="hidden" name="nav_present" value="1" />
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="nav_show" checked={navShow} onChange={(e) => setNavShow(e.target.checked)} /> Mostrar esta seção no menu do topo da loja</label>
          {navShow && (
            <div className="max-w-sm">
              <label className="a-label" htmlFor="nav_label">Apelido (o texto que aparece no menu)</label>
              <input id="nav_label" name="nav_label" value={navLabel} onChange={(e) => setNavLabel(e.target.value)} className="a-input" maxLength={24} required />
              <p className="a-muted mt-1 text-[0.8125rem]">Até 24 caracteres. A ordem do menu é a ordem das seções na home.</p>
              <label className="a-label mt-3" htmlFor="nav_dest">Para onde o link leva</label>
              <select id="nav_dest" name="nav_dest" className="a-select" defaultValue={section.nav?.dest?.kind === "page" ? `${section.nav.dest.pageKind}/${section.nav.dest.slug}` : ""}>
                <option value="">Esta seção da home</option>
                {pages.map((p) => <option key={p.value} value={p.value}>{p.label}{p.live ? "" : " (ainda não publicada)"}</option>)}
              </select>
            </div>
          )}
          <p className="a-muted text-[0.8125rem]">Enquanto nenhuma seção for marcada, o menu mostra só as seções históricas (Estilos, Fala daqui, Estados) que esta região realmente tem.</p>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-black/15 pt-5">
        <button type="submit" className="a-btn">Salvar rascunho</button>
        <span className="a-muted text-[0.875rem]">Salvar atualiza a pré-visualização. Nada vai para a loja até publicar.</span>
      </div>
    </form>
  );
}
