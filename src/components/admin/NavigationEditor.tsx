"use client";

import { useMemo, useState } from "react";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import { ChromePreview } from "./ChromePreview";
import {
  assembleNavigation,
  DEFAULT_PRIMARY_BLOCK_LABEL,
  DEFAULT_REGIONS_BLOCK_LABEL,
  defaultStatesBlockLabel,
  MAX_LABEL,
  NAV_DESTINATION_LABEL,
  NAV_DESTINATIONS,
  type NavData,
  type NavDestination,
  type NavigationConfig,
  type ThemeColors,
} from "@/lib/site-config/navigation";

type Row = { label: string; visible: boolean; order: string };
type State = { blocks: Record<"primaryBlock" | "statesBlock" | "regionsBlock", Row>; links: Record<NavDestination, Row> };

const BLOCKS: { key: keyof State["blocks"]; title: string; hint: string }[] = [
  { key: "primaryBlock", title: "Comprar", hint: "Agrupa os links principais abaixo." },
  { key: "statesBlock", title: "Estados da região", hint: "Automático: mostra só os estados que já têm produtos. Aqui você muda o título, a posição e se aparece." },
  { key: "regionsBlock", title: "Outras regiões", hint: "Automático: mostra só as outras regiões já lançadas (nunca a atual). Aqui você muda o título, a posição e se aparece." },
];

const row = (label: string, visible: boolean, order: number): Row => ({ label, visible, order: String(order) });

function initial(region: RegionSlug, config: NavigationConfig | undefined, data: NavData): State {
  const block = (key: keyof State["blocks"], label: string, order: number): Row => (config?.[key] ? row(config[key]!.label, config[key]!.visible, config[key]!.order) : row(label, true, order));
  const link = (destination: NavDestination, index: number): Row => {
    const own = config?.primaryLinks?.find((l) => l.destination === destination);
    const offered = data.primary.find((p) => p.destination === destination);
    return own ? row(own.label, own.visible, own.order) : row(offered?.label ?? NAV_DESTINATION_LABEL[destination], true, (index + 1) * 10);
  };
  return {
    blocks: { primaryBlock: block("primaryBlock", DEFAULT_PRIMARY_BLOCK_LABEL, 10), statesBlock: block("statesBlock", defaultStatesBlockLabel(region), 20), regionsBlock: block("regionsBlock", DEFAULT_REGIONS_BLOCK_LABEL, 30) },
    links: { styles: link("styles", 0), speech: link("speech", 1), states: link("states", 2) },
  };
}

/** The (possibly half-typed) form as a configuration for the live preview: an invalid label or position falls back to the default rather than breaking the preview. */
function toConfig(state: State, region: RegionSlug): NavigationConfig {
  const label = (v: string, fallback: string) => (v.trim().length > 0 ? v.trim().slice(0, MAX_LABEL) : fallback);
  const order = (v: string, fallback: number) => (Number.isInteger(Number(v)) && v !== "" ? Number(v) : fallback);
  const b = state.blocks;
  return {
    primaryBlock: { label: label(b.primaryBlock.label, DEFAULT_PRIMARY_BLOCK_LABEL), visible: b.primaryBlock.visible, order: order(b.primaryBlock.order, 10) },
    statesBlock: { label: label(b.statesBlock.label, defaultStatesBlockLabel(region)), visible: b.statesBlock.visible, order: order(b.statesBlock.order, 20) },
    regionsBlock: { label: label(b.regionsBlock.label, DEFAULT_REGIONS_BLOCK_LABEL), visible: b.regionsBlock.visible, order: order(b.regionsBlock.order, 30) },
    primaryLinks: NAV_DESTINATIONS.map((destination, i) => ({ id: destination, destination, label: label(state.links[destination].label, NAV_DESTINATION_LABEL[destination]), visible: state.links[destination].visible, order: order(state.links[destination].order, (i + 1) * 10) })),
  };
}

export function NavigationEditor({ region, config, data, colors, readOnly, action, resetAction, rev }: { region: RegionSlug; config: NavigationConfig | undefined; data: NavData; colors: ThemeColors; readOnly: boolean; action: (fd: FormData) => Promise<void>; resetAction: (fd: FormData) => Promise<void>; rev: string }) {
  const [state, setState] = useState<State>(() => initial(region, config, data));
  const navigation = useMemo(() => assembleNavigation(region, toConfig(state, region), data), [state, region, data]);
  const setBlock = (key: keyof State["blocks"], patch: Partial<Row>) => setState((s) => ({ ...s, blocks: { ...s.blocks, [key]: { ...s.blocks[key], ...patch } } }));
  const setLink = (key: NavDestination, patch: Partial<Row>) => setState((s) => ({ ...s, links: { ...s.links, [key]: { ...s.links[key], ...patch } } }));
  const offered = new Set(data.primary.map((p) => p.destination));

  const fields = (prefix: string, value: Row, onChange: (patch: Partial<Row>) => void, title: string) => (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end">
      <div>
        <label className="a-label" htmlFor={`${prefix}_label`}>Rótulo</label>
        <input id={`${prefix}_label`} name={`${prefix}_label`} className="a-input" value={value.label} maxLength={MAX_LABEL} disabled={readOnly} onChange={(e) => onChange({ label: e.target.value })} data-testid={`${prefix}-label`} />
      </div>
      <div>
        <label className="a-label" htmlFor={`${prefix}_order`}>Posição</label>
        <input id={`${prefix}_order`} name={`${prefix}_order`} className="a-input" inputMode="numeric" value={value.order} disabled={readOnly} onChange={(e) => onChange({ order: e.target.value })} data-testid={`${prefix}-order`} />
      </div>
      <label className="flex min-h-10 items-center gap-2 text-[0.9375rem] font-semibold">
        <input type="checkbox" name={`${prefix}_visible`} checked={value.visible} disabled={readOnly} onChange={(e) => onChange({ visible: e.target.checked })} data-testid={`${prefix}-visible`} />
        <span>Visível<span className="sr-only"> ({title})</span></span>
      </label>
    </div>
  );

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-6" aria-label={`Navegação de ${REGIONS[region].name}`}>
        <input type="hidden" name="scope" value={region} />
        <input type="hidden" name="rev" value={rev} />

        <section className="a-card p-5" aria-labelledby="nav-blocks">
          <h2 id="nav-blocks" className="a-h2">Blocos do menu</h2>
          <p className="a-muted mt-1 max-w-3xl text-[0.9375rem]">Posição menor aparece primeiro. Os estados e as outras regiões não são cadastrados aqui: vêm dos dados que já estão no ar.</p>
          <div className="mt-4 space-y-6">
            {BLOCKS.map((b) => (
              <fieldset key={b.key} className="border-t border-black/15 pt-4 first:border-t-0 first:pt-0">
                <legend className="text-[1rem] font-extrabold">{b.title}</legend>
                <p className="a-muted mb-3 text-[0.8125rem]">{b.hint}</p>
                {fields(b.key, state.blocks[b.key], (p) => setBlock(b.key, p), b.title)}
                {b.key === "statesBlock" && <p className="mt-3 text-[0.875rem]" data-testid="auto-states"><strong>Hoje aparecem:</strong> {data.states.map((s) => s.label).join(", ") || "nenhum estado com produtos"}.</p>}
                {b.key === "regionsBlock" && <p className="mt-3 text-[0.875rem]" data-testid="auto-regions"><strong>Hoje aparecem:</strong> {data.regions.map((s) => s.label).join(", ") || "nenhuma outra região lançada"}.</p>}
              </fieldset>
            ))}
          </div>
        </section>

        <section className="a-card p-5" aria-labelledby="nav-links">
          <h2 id="nav-links" className="a-h2">Links do bloco Comprar</h2>
          <p className="a-muted mt-1 max-w-3xl text-[0.9375rem]">Só destinos conhecidos: cada um leva à seção correspondente da home da região. Se a home não tem a seção, o link não aparece (nunca um link morto).</p>
          <div className="mt-4 space-y-5">
            {NAV_DESTINATIONS.map((d) => (
              <fieldset key={d} className="border-t border-black/15 pt-4 first:border-t-0 first:pt-0">
                <legend className="text-[1rem] font-extrabold">{NAV_DESTINATION_LABEL[d]}{!offered.has(d) && <span className="a-badge ml-2">a home não tem esta seção</span>}</legend>
                {fields(`link_${d}`, state.links[d], (p) => setLink(d, p), NAV_DESTINATION_LABEL[d])}
              </fieldset>
            ))}
          </div>
        </section>

        {readOnly ? <p className="a-muted">Somente leitura para o seu perfil.</p> : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="a-btn" data-testid="save-navigation">Salvar rascunho da navegação</button>
            <button type="submit" formAction={resetAction} formNoValidate className="a-btn ghost" data-testid="reset-navigation">Voltar ao padrão</button>
          </div>
        )}
      </form>

      <section className="a-card p-5" aria-labelledby="nav-preview">
        <h2 id="nav-preview" className="a-h2">Prévia</h2>
        <p className="a-muted mt-1 mb-4 text-[0.9375rem]">Atualiza enquanto você edita, com os estados e regiões reais de hoje. Só vale na loja depois de salvar e publicar.</p>
        <ChromePreview region={region} navigation={navigation} colors={colors} />
      </section>
    </div>
  );
}
