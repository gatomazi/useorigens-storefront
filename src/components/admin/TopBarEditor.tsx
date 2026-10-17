"use client";

import { useMemo, useState } from "react";
import type { TopBarRow } from "@/lib/admin/top-bar-form";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import { formatBrasilia, fromBrasiliaInput, promotionStatus, toBrasiliaInput, type PromotionStatus } from "@/lib/site-config/promotions";
import { TopBarMessages } from "@/components/layout/TopBarMessages";
import { contrastRatio, HEX_COLOR } from "@/lib/site-config/color";
import { liveTopBarMessages, MAX_PRODUCTION_DAYS, MAX_TOP_BAR_MESSAGES, TOP_BAR_TEXT_COMFORT, TOP_BAR_TEXT_MAX, topBarText, TOP_BAR_COLOR_PRESETS as PRESETS, type TopBarColors, type TopBarMessage, type TopBarStyle } from "@/lib/site-config/top-bar";

const STATUS: Record<PromotionStatus, { text: string; cls: string }> = {
  live: { text: "No ar ao publicar", cls: "ok" },
  scheduled: { text: "Agendada", cls: "warn" },
  ended: { text: "Encerrada", cls: "bad" },
  disabled: { text: "Desativada", cls: "" },
};

/** White or black, whichever reads better on `background`. */
const readableOn = (background: string): string => (contrastRatio(background, "#ffffff") >= contrastRatio(background, "#111111") ? "#ffffff" : "#111111");

const toRow = (m: TopBarMessage): TopBarRow => ({ id: m.id, enabled: m.enabled, text: m.text, href: m.href ?? "", startsAt: toBrasiliaInput(m.startsAt), endsAt: toBrasiliaInput(m.endsAt) });
const blank = (patch: Partial<TopBarRow> = {}): TopBarRow => ({ id: "", enabled: true, text: "", href: "", startsAt: "", endsAt: "", ...patch });

/** Black Friday: the day after the fourth Thursday of November (in 2026, 27/11), as a `yyyy-mm-dd` day. `plus` days later for the end of the weekend. */
function blackFriday(year: number, plus = 0): string {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const thursday = 1 + ((4 - first + 7) % 7) + 21;
  return new Date(Date.UTC(year, 10, thursday + 1 + plus)).toISOString().slice(0, 10);
}

/** The rows as messages, as far as they are usable (status and preview only; the server re-validates everything on save). */
function asMessage(r: TopBarRow, i: number): TopBarMessage | null {
  const text = r.text.trim();
  if (!text) return null;
  const message: TopBarMessage = { id: r.id || `nova-${i}`, enabled: r.enabled, text: text.slice(0, TOP_BAR_TEXT_MAX), order: i + 1 };
  if (r.href.trim()) message.href = r.href.trim();
  const s = fromBrasiliaInput(r.startsAt);
  const e = fromBrasiliaInput(r.endsAt);
  if (s) message.startsAt = s;
  if (e) message.endsAt = e;
  return message;
}

export function TopBarEditor({ region, style: savedStyle, colors: savedColors, productionDays, messages, now, readOnly, action, rev }: { region: RegionSlug; style?: TopBarStyle; colors?: TopBarColors; productionDays?: number; messages: TopBarMessage[]; now: number; readOnly: boolean; action: (fd: FormData) => Promise<void>; rev: string }) {
  const [style, setStyle] = useState<TopBarStyle>(savedStyle ?? "marquee");
  const [custom, setCustom] = useState(savedColors !== undefined);
  const [background, setBackground] = useState(savedColors?.background ?? "#000000");
  const [fontColor, setFontColor] = useState(savedColors?.text ?? "#ffffff");
  const colorsOk = HEX_COLOR.test(background) && HEX_COLOR.test(fontColor);
  const ratio = colorsOk ? contrastRatio(background, fontColor) : 0;
  const colors: TopBarColors | undefined = custom && colorsOk ? { background, text: fontColor } : undefined;
  const pickPreset = (c: TopBarColors | null) => {
    setCustom(c !== null);
    if (c) { setBackground(c.background); setFontColor(c.text); }
  };
  const [days, setDays] = useState(productionDays === undefined ? "" : String(productionDays));
  const [rows, setRows] = useState<TopBarRow[]>(() => messages.map(toRow));
  const [at, setAt] = useState(() => toBrasiliaInput(new Date(now).toISOString()));
  const set = (i: number, patch: Partial<TopBarRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const j = i + d;
    if (j < 0 || j >= rs.length) return rs;
    const next = [...rs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const add = (patch?: Partial<TopBarRow>) => setRows((rs) => (rs.length >= MAX_TOP_BAR_MESSAGES ? rs : [...rs, blank(patch)]));

  const year = new Date(now).getUTCFullYear();
  const bf = blackFriday(year);
  const production = /^\d+$/.test(days.trim()) && Number(days) >= 1 && Number(days) <= MAX_PRODUCTION_DAYS ? Number(days) : undefined;
  const parsed = useMemo(() => rows.map(asMessage), [rows]);
  const previewAt = fromBrasiliaInput(at) ? Date.parse(fromBrasiliaInput(at) as string) : now;
  const live = useMemo(() => liveTopBarMessages({ messages: parsed.filter((m): m is TopBarMessage => m !== null) }, previewAt), [parsed, previewAt]);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
      <form action={action} className="space-y-5" aria-label={`Faixa do topo de ${REGIONS[region].name}`}>
        <input type="hidden" name="scope" value={region} />
        <input type="hidden" name="rev" value={rev} />
        <input type="hidden" name="messages" value={JSON.stringify(rows)} />

        <input type="hidden" name="style" value={style} />
        <input type="hidden" name="colorBackground" value={custom ? background : ""} />
        <input type="hidden" name="colorText" value={custom ? fontColor : ""} />
        <fieldset className="a-card space-y-3 p-5">
          <legend className="a-label">Cores da faixa</legend>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const on = p.colors === null ? !custom : custom && background === p.colors.background && fontColor === p.colors.text;
              return (
                <button key={p.name} type="button" className={`a-btn sm ${on ? "" : "ghost"}`} disabled={readOnly} onClick={() => pickPreset(p.colors)} aria-pressed={on} data-testid={`top-bar-preset-${p.name}`}>
                  <span aria-hidden="true" className="mr-1 inline-block h-3 w-3 border border-black/30 align-middle" style={{ background: p.colors?.background ?? "#000000" }} />
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([["bg", "Fundo", background, setBackground], ["fg", "Fonte", fontColor, setFontColor]] as const).map(([id, label, value, set]) => (
              <div key={id}>
                <label className="a-label" htmlFor={`tb_color_${id}`}>{label}</label>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label={`${label} (seletor)`} className="h-10 w-12 cursor-pointer border border-black/30" value={HEX_COLOR.test(value) ? value : "#000000"} disabled={readOnly} onChange={(e) => { setCustom(true); set(e.target.value); }} />
                  <input id={`tb_color_${id}`} className="a-input font-mono" value={value} maxLength={7} disabled={readOnly} onChange={(e) => { setCustom(true); set(e.target.value.trim()); }} data-testid={`top-bar-color-${id}`} />
                </div>
              </div>
            ))}
          </div>
          {custom && (
            <p className="text-[0.8125rem]" data-testid="top-bar-contrast">
              {!colorsOk ? <strong>Use cores no formato #rrggbb.</strong>
                : ratio < 3 ? <strong className="text-[#8c1d18]">Contraste {ratio.toFixed(1).replace(".", ",")}:1: quase não se lê. Não dá para salvar assim.</strong>
                : ratio < 4.5 ? <strong className="text-[#6b4a0c]">Contraste {ratio.toFixed(1).replace(".", ",")}:1: lê, mas abaixo do recomendado (4,5:1).</strong>
                : <span className="a-muted">Contraste {ratio.toFixed(1).replace(".", ",")}:1: boa leitura.</span>}
              {colorsOk && fontColor !== readableOn(background) && ratio < 4.5 && !readOnly ? <> <button type="button" className="a-link underline" onClick={() => setFontColor(readableOn(background))}>Usar fonte {readableOn(background) === "#ffffff" ? "branca" : "preta"}</button></> : null}
            </p>
          )}
          <p className="a-muted text-[0.8125rem]">Vale para a faixa inteira, na loja e nas páginas da INK, enquanto houver mensagem no ar. Sem mensagem, a faixa padrão continua preta.</p>
        </fieldset>

        <fieldset className="a-card space-y-2 p-5">
          <legend className="a-label">Como as mensagens aparecem</legend>
          {([["marquee", "Passando (letreiro)", "Todas numa linha só, correndo da direita para a esquerda, separadas por •. Chama atenção e cabe texto longo no celular. Para sob o mouse."],
            ["rotate", "Uma de cada vez", "Uma mensagem centralizada, trocando a cada 5 segundos."]] as const).map(([value, label, hint]) => (
            <label key={value} className="flex items-start gap-2 text-[0.9375rem]">
              <input type="radio" name="style_choice" className="mt-1" checked={style === value} disabled={readOnly} onChange={() => setStyle(value)} data-testid={`top-bar-style-${value}`} />
              <span><strong>{label}</strong><span className="a-muted block text-[0.8125rem]">{hint}</span></span>
            </label>
          ))}
          <p className="a-muted text-[0.8125rem]">Quem desativou animações no sistema vê só a primeira mensagem, parada.</p>
        </fieldset>

        <div className="a-card space-y-2 p-5">
          <label className="a-label" htmlFor="tb_productionDays">Prazo de produção da INK (dias úteis)</label>
          <input id="tb_productionDays" name="productionDays" type="number" inputMode="numeric" min={1} max={MAX_PRODUCTION_DAYS} className="a-input w-32" value={days} disabled={readOnly} onChange={(e) => setDays(e.target.value)} data-testid="top-bar-production" />
          <p className="a-muted text-[0.8125rem]">
            É só o tempo de produção: a entrega depende do CEP e a INK mostra no carrinho. Escreva <code>{"{producao}"}</code> numa mensagem para usar este número
            {production ? <> (vira “{topBarText({ text: "{producao}" }, production, now)}”)</> : null}. Vazio: nenhuma mensagem pode usar <code>{"{producao}"}</code>.
          </p>
        </div>

        {rows.length === 0 && (
          <div className="a-card p-5" data-testid="top-bar-empty">
            <p className="font-semibold">Nenhuma mensagem nesta região.</p>
            <p className="a-muted mt-1 text-[0.9375rem]">Sem mensagem no ar, a loja mostra a faixa padrão e as páginas da INK ficam com a faixa da própria INK.</p>
          </div>
        )}

        {rows.map((r, i) => {
          const message = parsed[i];
          const status = message ? STATUS[promotionStatus(message, now)] : { text: "Incompleta", cls: "warn" };
          const filled = message ? topBarText(message, production, now) : "";
          return (
            <fieldset key={i} className="a-card space-y-4 p-5" data-testid={`top-bar-row-${i}`}>
              <legend className="sr-only">Mensagem {i + 1}</legend>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[1rem] font-extrabold">{i + 1}. Mensagem</span>
                  <span className={`a-badge ${status.cls}`} data-testid={`top-bar-status-${i}`}>{status.text}</span>
                  {message?.startsAt && promotionStatus(message, now) === "scheduled" && <span className="a-muted text-[0.8125rem]">começa {formatBrasilia(message.startsAt)}</span>}
                </div>
                {!readOnly && (
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className="a-btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir a mensagem ${i + 1}`}>↑</button>
                    <button type="button" className="a-btn ghost sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Descer a mensagem ${i + 1}`}>↓</button>
                    <button type="button" className="a-btn danger sm" onClick={() => remove(i)} data-testid={`top-bar-remove-${i}`}>Remover</button>
                  </div>
                )}
              </div>
              <label className="flex min-h-10 items-center gap-2 text-[0.9375rem] font-semibold">
                <input type="checkbox" checked={r.enabled} disabled={readOnly} onChange={(e) => set(i, { enabled: e.target.checked })} data-testid={`top-bar-enabled-${i}`} />
                Habilitada
              </label>
              <div>
                <label className="a-label" htmlFor={`tb${i}_text`}>Texto</label>
                <input id={`tb${i}_text`} className="a-input" value={r.text} maxLength={TOP_BAR_TEXT_MAX} placeholder="Peça até 06/12 e receba a tempo do Natal" disabled={readOnly} onChange={(e) => set(i, { text: e.target.value })} data-testid={`top-bar-text-${i}`} />
                <p className="a-muted mt-1 text-[0.8125rem]">
                  {r.text.length}/{TOP_BAR_TEXT_MAX}. {filled && filled !== r.text.trim() ? <>Hoje fica: “{filled}”. </> : null}
                  {filled.length > TOP_BAR_TEXT_COMFORT ? <strong>Com mais de {TOP_BAR_TEXT_COMFORT} caracteres pode ocupar duas linhas no celular.</strong> : null}
                </p>
              </div>
              <div>
                <label className="a-label" htmlFor={`tb${i}_href`}>Link (opcional)</label>
                <input id={`tb${i}_href`} className="a-input font-mono" value={r.href} placeholder={`/${region}/h/natal`} disabled={readOnly} onChange={(e) => set(i, { href: e.target.value })} data-testid={`top-bar-href-${i}`} />
                <p className="a-muted mt-1 text-[0.8125rem]">Uma página desta região no site, sem o domínio. Nas páginas da INK o link abre a mesma página do site.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="a-label" htmlFor={`tb${i}_startsAt`}>Início (horário de Brasília, opcional)</label>
                  <input id={`tb${i}_startsAt`} type="datetime-local" className="a-input" value={r.startsAt} disabled={readOnly} onChange={(e) => set(i, { startsAt: e.target.value })} data-testid={`top-bar-startsAt-${i}`} />
                </div>
                <div>
                  <label className="a-label" htmlFor={`tb${i}_endsAt`}>Fim (horário de Brasília, opcional)</label>
                  <input id={`tb${i}_endsAt`} type="datetime-local" className="a-input" value={r.endsAt} disabled={readOnly} onChange={(e) => set(i, { endsAt: e.target.value })} data-testid={`top-bar-endsAt-${i}`} />
                </div>
              </div>
            </fieldset>
          );
        })}

        <p className="a-muted text-[0.875rem]">
          Marcadores: <code>{"{producao}"}</code> = o prazo de produção acima; <code>{"{faltam}"}</code> = os dias até o fim da mensagem (“faltam 3 dias”, “falta 1 dia”,
          “último dia”), por isso precisa de data de fim. Emojis funcionam (🎄 🚚 ⭐). As mensagens seguem a ordem da lista.
        </p>

        {readOnly ? <p className="a-muted">Somente leitura para o seu perfil.</p> : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="a-btn ghost" onClick={() => add()} disabled={rows.length >= MAX_TOP_BAR_MESSAGES} data-testid="top-bar-add">+ Mensagem</button>
            <button type="button" className="a-btn ghost" onClick={() => add({ text: "Black Friday: {faltam}", startsAt: `${bf}T00:00`, endsAt: `${blackFriday(year, 4)}T00:00` })} disabled={rows.length >= MAX_TOP_BAR_MESSAGES} data-testid="top-bar-add-bf">+ Modelo Black Friday</button>
            <button type="button" className="a-btn ghost" onClick={() => add({ text: "Peça até 06/12 e receba a tempo do Natal", endsAt: `${year}-12-07T00:00` })} disabled={rows.length >= MAX_TOP_BAR_MESSAGES} data-testid="top-bar-add-natal">+ Modelo prazo de Natal</button>
            <button type="submit" className="a-btn" data-testid="save-top-bar">Salvar rascunho</button>
          </div>
        )}
      </form>

      <section className="a-card p-5 xl:sticky xl:top-6" aria-labelledby="top-bar-preview">
        <h2 id="top-bar-preview" className="a-h2">Prévia</h2>
        <p className="a-muted mt-1 text-[0.9375rem]">O que estaria no ar no momento escolhido, se você publicasse este rascunho. Mude a data para conferir a Black Friday e o Natal.</p>
        <label className="a-label mt-3" htmlFor="tb_previewAt">Ver como fica em (Brasília)</label>
        <input id="tb_previewAt" type="datetime-local" className="a-input" value={at} onChange={(e) => setAt(e.target.value)} data-testid="top-bar-preview-at" />
        <div className="mt-4 space-y-3" data-testid="top-bar-preview-list">
          {live.length === 0 ? (
            <p className="a-muted text-[0.9375rem]" data-testid="top-bar-preview-empty">Nenhuma mensagem: a loja mostra a faixa padrão e a INK, a dela.</p>
          ) : (
            <>
              <p className="a-muted text-[0.75rem]">Celular (390 px), como na loja{live.length > 1 ? ` · ${live.length} mensagens` : ""}</p>
              <div className="on-ink w-full max-w-[390px] overflow-hidden" data-testid="top-bar-preview-item">
                <TopBarMessages key={style} schedule={{ style, colors, productionDays: production, messages: live }} renderedAt={previewAt} fixedNow={previewAt}>{null}</TopBarMessages>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
