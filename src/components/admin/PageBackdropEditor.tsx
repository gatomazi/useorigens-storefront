"use client";

import { useState } from "react";
import { previewSrc, type MediaOption } from "@/components/admin/SectionEditorForm";
import { groundReadability, toneFor } from "@/lib/admin/contrast";
import { PAGE_BACKDROP_SUGGESTION } from "@/lib/admin/page-form";
import { PATTERN_OPACITY, PATTERN_SIZE, type PageBackdrop } from "@/lib/site-config/schema";

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * "Fundo da página" of a hotpage or landing (a themed page: Black Friday, Natal…): a colour, the text tone it calls for and, optionally, a picture
 * repeated as a pattern. The preview on the right is drawn with the same rules as the store (colour, then the pattern at its size and intensity, then
 * the text); the readability check is the one the publish applies. Saving writes the draft only.
 */
export function PageBackdropEditor({ backdrop, media, hidden, action }: { backdrop?: PageBackdrop; media: MediaOption[]; hidden: React.ReactNode; action: (fd: FormData) => Promise<void> }) {
  const [on, setOn] = useState(Boolean(backdrop));
  const [color, setColor] = useState<string>(backdrop?.color ?? PAGE_BACKDROP_SUGGESTION.color);
  const [tone, setTone] = useState<"light" | "dark">(backdrop?.tone ?? PAGE_BACKDROP_SUGGESTION.tone);
  const [pattern, setPattern] = useState(backdrop?.pattern?.image.assetId ?? "");
  const [size, setSize] = useState<number>(backdrop?.pattern?.size ?? PAGE_BACKDROP_SUGGESTION.size);
  const [opacity, setOpacity] = useState<number>(backdrop?.pattern?.opacity ?? PAGE_BACKDROP_SUGGESTION.opacity);
  const picked = media.find((m) => m.assetId === pattern);
  const safeColor = isHex(color) ? color : PAGE_BACKDROP_SUGGESTION.color;
  const issues = on ? groundReadability({ color: safeColor as `#${string}`, tone, ...(pattern ? { pattern: { image: { assetId: pattern, alt: "", decorative: true }, size, opacity } } : {}) }) : [];
  // A new colour suggests the text that reads best on it (the person can still change it).
  const pickColor = (next: string) => {
    setColor(next);
    if (isHex(next)) setTone(toneFor(next));
  };
  const textColor = tone === "dark" ? "#ffffff" : "#000000";

  return (
    <form action={action} className="mt-3 space-y-4">
      {hidden}
      <label className="flex items-center gap-2 font-bold">
        <input type="checkbox" name="backdrop_on" checked={on} onChange={(e) => setOn(e.target.checked)} /> Usar um fundo próprio nesta página
      </label>
      {!on && <p className="a-muted text-[0.875rem]">Desligado: a página usa o fundo normal da loja desta região.</p>}
      {on && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <label className="a-label" htmlFor="backdrop_color">Cor do fundo</label>
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Escolher a cor do fundo" value={safeColor} onChange={(e) => pickColor(e.target.value)} className="h-10 w-14" />
                <input id="backdrop_color" name="backdrop_color" value={color} onChange={(e) => pickColor(e.target.value)} className="a-input max-w-[9rem]" maxLength={7} required pattern="#[0-9a-fA-F]{6}" />
              </div>
            </div>
            <fieldset>
              <legend className="a-label">Cor do texto</legend>
              <div className="mt-1 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 font-bold"><input type="radio" name="backdrop_tone" value="dark" checked={tone === "dark"} onChange={() => setTone("dark")} /> Texto claro (fundo escuro)</label>
                <label className="flex items-center gap-2 font-bold"><input type="radio" name="backdrop_tone" value="light" checked={tone === "light"} onChange={() => setTone("light")} /> Texto escuro (fundo claro)</label>
              </div>
              <p className="a-muted mt-1 text-[0.8125rem]">Títulos, nomes e preços das seções sem fundo próprio seguem esta cor. Seções com fundo próprio (foto, cor, papel) continuam com o delas.</p>
            </fieldset>
            <div>
              <label className="a-label" htmlFor="backdrop_pattern">Imagem de pattern (opcional)</label>
              <select id="backdrop_pattern" name="backdrop_pattern" className="a-select" value={pattern} onChange={(e) => setPattern(e.target.value)}>
                <option value="">Sem pattern (só a cor)</option>
                {media.some((m) => m.kind === "upload") && <optgroup label="Enviadas">{media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>}
                <optgroup label="Banners do projeto">{media.filter((m) => m.kind === "banner").map((m) => <option key={m.assetId} value={m.assetId}>{m.label}</option>)}</optgroup>
              </select>
              <p className="a-muted mt-1 text-[0.8125rem]">A imagem se repete lado a lado por toda a página. Funciona melhor um PNG/WebP com fundo transparente ou um desenho que encaixe nas bordas. Envie em Mídia.</p>
            </div>
            {pattern && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="a-label" htmlFor="backdrop_size">Tamanho de cada repetição: {size}px</label>
                  <input id="backdrop_size" name="backdrop_size" type="range" min={PATTERN_SIZE.min} max={PATTERN_SIZE.max} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="a-label" htmlFor="backdrop_opacity">Intensidade: {Math.round(opacity * 100)}%</label>
                  <input id="backdrop_opacity" name="backdrop_opacity" type="range" min={PATTERN_OPACITY.min} max={PATTERN_OPACITY.max} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full" />
                </div>
              </div>
            )}
          </div>
          <div>
            <p className="a-label">Prévia</p>
            <div className="relative isolate overflow-hidden border border-black/40 p-5" style={{ backgroundColor: safeColor, color: textColor }}>
              {picked && <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ backgroundImage: `url("${previewSrc(picked)}")`, backgroundSize: `${size}px auto`, backgroundRepeat: "repeat", opacity }} />}
              <p className="text-[1.5rem] font-extrabold leading-tight">Título de uma seção</p>
              <p className="mt-1 text-[0.875rem] opacity-85">Subtítulo e textos de apoio</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i}>
                    <div className="aspect-[800/820] bg-[#e5e5e5]" />
                    <p className="mt-1.5 text-[0.8125rem] font-bold">Produto</p>
                    <p className="text-[0.75rem]">R$ 109,90</p>
                  </div>
                ))}
              </div>
            </div>
            {issues.length > 0 && (
              <div className={`a-flash mt-3 ${issues.some((i) => i.level === "blocking") ? "err" : "ok"}`} role="status">
                <p className="font-extrabold">Legibilidade do texto</p>
                {issues.map((i) => <p key={i.message}>{i.level === "blocking" ? "⛔ " : "⚠️ "}{i.message}</p>)}
              </div>
            )}
          </div>
        </div>
      )}
      {(on || backdrop) && <button type="submit" className="a-btn">{on ? "Salvar fundo" : "Voltar ao fundo da região"}</button>}
    </form>
  );
}
