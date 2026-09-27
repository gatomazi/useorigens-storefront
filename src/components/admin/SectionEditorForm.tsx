"use client";

import { useMemo, useState } from "react";
import { CollectionCombobox, type ComboEntry } from "@/components/admin/CollectionCombobox";
import { HeroFeaturedProducts, type FeaturedSlotView } from "@/components/admin/HeroFeaturedProducts";
import type { FeaturedCandidate } from "@/lib/hero-featured";
import { readability } from "@/lib/admin/contrast";
import { suggestedNavLabel } from "@/lib/site-config/nav";
import type { Appearance, Section } from "@/lib/site-config/schema";

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

const previewSrc = (m: MediaOption | undefined) => (m ? (m.kind === "banner" ? m.src.replace(/\.[a-z]+$/i, "-640.webp") : m.src) : undefined);
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
  section, rev, scope, media, collections, action, notes = [], featured, stateCovers, page, pages = [], customizers = [], anchors = [],
}: {
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
  const hasVisual = isCarousel || section.template === "hero" || section.template === "page-hero" || section.template === "campaign" || section.template === "city-styles" || section.template === "states";

  const [tone, setTone] = useState<"light" | "dark">(isCarousel ? section.layout?.tone ?? "light" : section.template === "campaign" ? "dark" : section.template === "page-hero" ? section.layout?.tone ?? "dark" : "light");
  const [fillKind, setFillKind] = useState<"none" | "solid" | "gradient">(a.fill.kind);
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
  const [sourceKind, setSourceKind] = useState<"editorial-module" | "ink-category">(section.source?.kind === "ink-category" ? "ink-category" : "editorial-module");
  const currentRef = section.source?.kind === "ink-category" ? `${section.source.store}:${section.source.collectionId}` : undefined;
  const [srcEntry, setSrcEntry] = useState<ComboEntry | null>(collections.find((e) => e.value === currentRef) ?? null);
  const publicEntries = collections.filter((e) => e.visibility === "public" && e.selectable);
  const internalSource = sourceKind === "ink-category" && srcEntry?.visibility === "internal";
  const [ctaKind, setCtaKind] = useState<"none" | "ink-collection" | "external" | "route" | "page" | "anchor">(section.cta?.dest.kind ?? "none");

  const [navShow, setNavShow] = useState(Boolean(section.nav));
  const [navLabel, setNavLabel] = useState(section.nav?.label ?? suggestedNavLabel(section));
  const [ccShow, setCcShow] = useState(Boolean(section.customizerCard));
  const byId = useMemo(() => new Map(media.map((m) => [m.assetId, m])), [media]);
  const hasImage = Boolean(imgM || imgD);

  const liveAppearance: Appearance = {
    fill: fillKind === "none" ? { kind: "none" } : fillKind === "solid" ? { kind: "solid", color: (choice.startsWith("token:") ? choice : isHex(solid) ? solid : "#4d543d") as never } : { kind: "gradient", from: (isHex(gFrom) ? gFrom : "#4d543d") as never, to: (isHex(gTo) ? gTo : "#0a0c0a") as never, angle: gAngle },
    focal: { mobile: focM, desktop: focD },
    overlay: overlayKind === "preset" ? { preset: preset as "none" } : { color: ovColor as `#${string}`, opacity: ovOpacity },
  };
  const issues = hasVisual && !(section.template === "campaign" && !hasImage && fillKind === "none") ? readability(liveAppearance, tone, hasImage) : [];

  const cur = section.source;
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="rev" value={rev ?? "null"} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="id" value={section.id} />
      {page && <><input type="hidden" name="page" value={page} /><input type="hidden" name="page_scope" value="1" /></>}

      <fieldset className="space-y-4">
        <legend className="a-h2 mb-3">Conteúdo</legend>
        <div>
          <label className="a-label" htmlFor="title">Título</label>
          {section.template === "hero" ? <textarea id="title" name="title" defaultValue={section.title} className="a-textarea" maxLength={120} rows={2} /> : <input id="title" name="title" defaultValue={section.title} className="a-input" maxLength={120} />}
          {section.template === "hero" && <p className="a-muted mt-1 text-[0.8125rem]">Uma quebra de linha vira a quebra do título.</p>}
        </div>
        <div>
          <label className="a-label" htmlFor="subtitle">Subtítulo</label>
          <textarea id="subtitle" name="subtitle" defaultValue={section.subtitle} className="a-textarea" maxLength={300} />
          {section.template === "city-styles" && <p className="a-muted mt-1 text-[0.8125rem]">Use <code>{"{city}"}</code> onde o nome da cidade de exemplo deve aparecer.</p>}
        </div>
        {section.template === "city-styles" && (
          <div className="max-w-[12rem]">
            <label className="a-label" htmlFor="count">Quantos estilos mostrar</label>
            <input id="count" name="count" type="number" min={1} max={8} defaultValue={section.count ?? 8} className="a-input" />
            <p className="a-muted mt-1 text-[0.8125rem]">Até 8. Só aparecem os que existem de verdade para a cidade de exemplo.</p>
          </div>
        )}
        {notes.length > 0 && (
          <div className="a-flash ok text-[0.875rem]" role="status">
            <p className="font-extrabold">Dados reais desta região</p>
            {notes.map((n) => <p key={n} className="mt-1">{n}</p>)}
          </div>
        )}
      </fieldset>

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
                  <label className="a-label mt-2" htmlFor={`state_alt_${st.uf}`}>Descrição da imagem (opcional; vazio = decorativa)</label>
                  <input id={`state_alt_${st.uf}`} name={`state_alt_${st.uf}`} defaultValue={current?.alt ?? ""} className="a-input" maxLength={200} />
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {section.template === "hero" && featured && <HeroFeaturedProducts scope={scope} regionName={featured.regionName} mode={featured.mode} initial={featured.initial} eligible={featured.eligible} search={featured.search} />}

      {section.template === "page-hero" && (
        <fieldset className="space-y-3">
          <legend className="a-h2 mb-3">Cor do texto</legend>
          <select name="layout_tone" className="a-select max-w-xs" value={tone} onChange={(e) => setTone(e.target.value as "light" | "dark")} aria-label="Cor do texto">
            <option value="dark">Texto claro (sobre fundo escuro)</option>
            <option value="light">Texto escuro (sobre fundo claro)</option>
          </select>
        </fieldset>
      )}

      {isCarousel && (
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
                <div><label className="a-label" htmlFor="cc_title">Título do card</label><input id="cc_title" name="cc_title" defaultValue={section.customizerCard?.title ?? "Personalize a sua nesse modelo"} className="a-input" maxLength={60} required /></div>
                <div><label className="a-label" htmlFor="cc_button">Texto do botão</label><input id="cc_button" name="cc_button" defaultValue={section.customizerCard?.button ?? "Personalizar"} className="a-input" maxLength={24} required /></div>
              </div>
              <div><label className="a-label" htmlFor="cc_description">Descrição curta (opcional)</label><input id="cc_description" name="cc_description" defaultValue={section.customizerCard?.description ?? "Escolha as palavras que contam sua história"} className="a-input" maxLength={120} /></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="a-label" htmlFor="cc_image">Imagem do card (mockup próprio da estampa)</label>
                  <select id="cc_image" name="cc_image" className="a-select" defaultValue={section.customizerCard?.image?.assetId ?? ""}>
                    <option value="">Usar a imagem do modelo</option>
                    {media.some((m) => m.kind === "upload") && <optgroup label="Enviadas">{media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>}
                    <optgroup label="Banners do projeto">{media.filter((m) => m.kind === "banner").map((m) => <option key={m.assetId} value={m.assetId}>{m.label}</option>)}</optgroup>
                  </select>
                </div>
                <div><label className="a-label" htmlFor="cc_alt">Descrição da imagem (acessibilidade)</label><input id="cc_alt" name="cc_alt" defaultValue={section.customizerCard?.image?.alt ?? ""} className="a-input" maxLength={200} /></div>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {(section.template === "campaign" || section.template === "page-hero") && (
        <fieldset className="space-y-4">
          <legend className="a-h2 mb-3">Botão</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="a-label" htmlFor="cta_kind">Destino</label>
              <select id="cta_kind" name="cta_kind" className="a-select" value={ctaKind} onChange={(e) => setCtaKind(e.target.value as typeof ctaKind)}>
                <option value="none">Busca de cidade (padrão)</option>
                <option value="route">Página desta região (endereço)</option>
                <option value="page">Hotpage ou categoria-pai publicada</option>
                <option value="anchor">Uma seção desta página</option>
                <option value="external">URL da loja Use (Sul, Norte ou Centro)</option>
              </select>
            </div>
            {ctaKind !== "none" && <div><label className="a-label" htmlFor="cta_label">Texto do botão</label><input id="cta_label" name="cta_label" defaultValue={section.cta?.label ?? "Ver mais"} className="a-input" maxLength={32} /></div>}
          </div>
          {ctaKind === "page" && <PagePicker pages={pages} current={section.cta?.dest.kind === "page" ? `${section.cta.dest.pageKind}/${section.cta.dest.slug}` : ""} />}
          {ctaKind === "anchor" && <AnchorPicker anchors={anchors} current={section.cta?.dest.kind === "anchor" ? section.cta.dest.anchor : ""} />}
          {ctaKind === "route" && <div><label className="a-label" htmlFor="cta_route">Caminho (dentro de /{scope})</label><input id="cta_route" name="cta_route" defaultValue={section.cta?.dest.kind === "route" ? section.cta.dest.path : `/${scope}`} className="a-input" placeholder={`/${scope}/pa`} /><p className="a-muted mt-1 text-[0.8125rem]">Ex.: <code>/{scope}</code> ou a página de um estado. Um caminho de outra região é recusado.</p></div>}
          {ctaKind === "external" && <div><label className="a-label" htmlFor="cta_url">URL (https, hosts Use Sul/Norte/Centro)</label><input id="cta_url" name="cta_url" defaultValue={section.cta?.dest.kind === "external" ? section.cta.dest.url : ""} className="a-input" placeholder="https://www.usenorte.com.br/" /></div>}
        </fieldset>
      )}

      {isCarousel && (
        <>
          <fieldset className="space-y-4">
            <legend className="a-h2 mb-3">Produtos</legend>
            <div role="radiogroup" aria-label="Fonte" className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 font-bold"><input type="radio" name="source_kind" value="editorial-module" checked={sourceKind === "editorial-module"} onChange={() => setSourceKind("editorial-module")} /> Curadoria editorial atual</label>
              <label className="flex items-center gap-2 font-bold"><input type="radio" name="source_kind" value="ink-category" checked={sourceKind === "ink-category"} onChange={() => setSourceKind("ink-category")} disabled={collections.length === 0} /> Coleção da INK</label>
            </div>
            {sourceKind === "editorial-module" ? (
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
                  <label className="a-label" htmlFor="source_limit">Cards</label>
                  <input id="source_limit" name="source_limit" type="number" min={3} max={24} defaultValue={cur?.kind === "ink-category" ? cur.limit : 6} className="a-input" />
                </div>
              </div>
            )}
            {sourceKind === "ink-category" && section.id.startsWith("seed-") && <p className="a-flash err text-[0.875rem]">Atenção: isto substitui a curadoria original desta seção por uma coleção da INK (ordem da INK). Só vale depois de publicado.</p>}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="a-h2 mb-3">Botão “Ver todos”</legend>
            {internalSource && (
              <div className="a-flash ok text-[0.875rem]">
                <p className="font-bold">Coleção interna: link “Ver todos” desativado.</p>
                <p>Ela não tem uma página pública verificada na loja da INK, então nenhum botão é criado (nem uma URL inventada).</p>
                <input type="hidden" name="cta_kind" value="none" />
              </div>
            )}
            {!internalSource && <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="a-label" htmlFor="cta_kind">Destino</label>
                <select id="cta_kind" name="cta_kind" className="a-select" value={ctaKind} onChange={(e) => setCtaKind(e.target.value as typeof ctaKind)}>
                  <option value="none">Sem botão</option>
                  <option value="ink-collection">Coleção da INK (página real na loja)</option>
                  <option value="external">URL da loja Use (Sul, Norte ou Centro)</option>
                  <option value="route">Página desta loja</option>
                  <option value="page">Hotpage ou categoria-pai publicada</option>
                  <option value="anchor">Uma seção desta página</option>
                </select>
              </div>
              {ctaKind !== "none" && <div><label className="a-label" htmlFor="cta_label">Texto do botão</label><input id="cta_label" name="cta_label" defaultValue={section.cta?.label ?? "Ver todos"} className="a-input" maxLength={32} /></div>}
            </div>}
            {!internalSource && ctaKind === "ink-collection" && (
              <div>
                <label className="a-label" htmlFor="cta_collection">Coleção</label>
                <select id="cta_collection" name="cta_collection" className="a-select" defaultValue={section.cta?.dest.kind === "ink-collection" ? `${section.cta.dest.store}:${section.cta.dest.collectionId}` : ""} required>
                  <option value="" disabled>Escolha…</option>
                  {publicEntries.map((c) => <option key={c.value} value={c.value}>{c.name} · {c.matchedCount} produtos</option>)}
                </select>
              </div>
            )}
            {!internalSource && ctaKind === "external" && <div><label className="a-label" htmlFor="cta_url">URL (https, hosts Use Sul/Norte/Centro)</label><input id="cta_url" name="cta_url" defaultValue={section.cta?.dest.kind === "external" ? section.cta.dest.url : ""} className="a-input" placeholder="https://www.usesul.com.br/usesul/collections/…" /></div>}
            {!internalSource && ctaKind === "page" && <PagePicker pages={pages} current={section.cta?.dest.kind === "page" ? `${section.cta.dest.pageKind}/${section.cta.dest.slug}` : ""} />}
            {!internalSource && ctaKind === "anchor" && <AnchorPicker anchors={anchors} current={section.cta?.dest.kind === "anchor" ? section.cta.dest.anchor : ""} />}
            {!internalSource && ctaKind === "route" && <div><label className="a-label" htmlFor="cta_route">Caminho</label><input id="cta_route" name="cta_route" defaultValue={section.cta?.dest.kind === "route" ? section.cta.dest.path : ""} className="a-input" placeholder="/sul/sc" /></div>}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="a-h2 mb-3">Layout</legend>
            <div className="grid gap-4 md:grid-cols-3">
              <div><label className="a-label" htmlFor="layout_variant">Cards</label><select id="layout_variant" name="layout_variant" className="a-select" defaultValue={section.layout?.variant ?? "standard"}><option value="standard">Padrão</option><option value="poster">Pôster (mais editorial)</option></select></div>
              <div><label className="a-label" htmlFor="layout_surface">Superfície</label><select id="layout_surface" name="layout_surface" className="a-select" defaultValue={section.layout?.surface ?? "plain"}><option value="plain">Fundo da página</option><option value="paper">Papel</option><option value="region-primary">Verde regional</option></select></div>
              <div><label className="a-label" htmlFor="layout_tone">Cor do texto</label><select id="layout_tone" name="layout_tone" className="a-select" value={tone} onChange={(e) => setTone(e.target.value as "light" | "dark")}><option value="light">Escuro (para fundos claros)</option><option value="dark">Claro (para fundos escuros)</option></select></div>
            </div>
          </fieldset>
        </>
      )}

      {hasVisual && (
        <fieldset className="space-y-5">
          <legend className="a-h2 mb-3">Fundo</legend>
          <p className="a-muted text-[0.875rem]">A imagem é opcional e faz parte da própria seção. Sem imagem, aparece a cor ou o degradê escolhido — nunca uma faixa vazia.</p>
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

          <div className="grid gap-4 md:grid-cols-2">
            {([["mobile", "Imagem mobile", imgM, setImgM, "img_mobile"], ["desktop", "Imagem desktop", imgD, setImgD, "img_desktop"]] as const).map(([k, label, value, set, name]) => (
              <div key={k}>
                <label className="a-label" htmlFor={name}>{label} (opcional)</label>
                <select id={name} name={name} className="a-select" value={value} onChange={(e) => set(e.target.value)}>
                  <option value="">Sem imagem</option>
                  <optgroup label="Banners do projeto">{media.filter((m) => m.kind === "banner").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>
                  {media.some((m) => m.kind === "upload") && <optgroup label="Enviadas neste computador">{media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>}
                </select>
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
          {issues.length > 0 && (
            <div className={`a-flash ${issues.some((i) => i.level === "blocking") ? "err" : "ok"}`} role="status">
              <p className="font-extrabold">Legibilidade do texto</p>
              {issues.map((i) => <p key={i.message}>{i.level === "blocking" ? "⛔ " : "⚠️ "}{i.message}</p>)}
            </div>
          )}
        </fieldset>
      )}

      {section.template !== "hero" && section.template !== "footer" && section.template !== "page-hero" && !page && (
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
