"use client";

import { useState } from "react";
import { contrastRatio, HEX_COLOR } from "@/lib/site-config/color";
import type { Color, HeroColorKey, HeroColors } from "@/lib/site-config/schema";

/** Each colour of the reading half, in the panel's words, with what the theme draws when it is left alone. */
const FIELDS: readonly { key: HeroColorKey; label: string; help: string }[] = [
  { key: "background", label: "Fundo", help: "O fundo do lado do texto. Padrão: o fundo da página (creme no tema Editorial)." },
  { key: "title", label: "Título", help: "As linhas do título. Padrão: a cor de texto do tema." },
  { key: "highlight", label: "Destaque do título", help: "A última linha do título. Padrão: a cor de destaque do tema (terracota no Editorial)." },
  { key: "rule", label: "Traço acima do título", help: "O traço curto em cima do título. Padrão: a cor de acento da região." },
  { key: "text", label: "Texto de apoio", help: "O parágrafo sob o título e a linha “1.191 cidades…”. Padrão: a cor de texto do tema." },
  { key: "link", label: "Link “Ou explore por estado”", help: "Texto e sublinhado do link. Padrão: o mesmo do texto de apoio." },
  { key: "field", label: "Busca: borda e botão", help: "A moldura do campo de busca e o quadrado da seta (a seta fica preta ou branca, a que tiver contraste)." },
];

const TOKENS: readonly [Color, string][] = [
  ["token:ground", "Fundo da página"],
  ["token:region-primary", "Cor principal da região"],
  ["token:near-black", "Preto da campanha"],
];

/** WCAG minimums: body text 4.5:1; the headline (large type), the rule and the field's frame 3:1. */
const MIN_CONTRAST: Partial<Record<HeroColorKey, number>> = { title: 3, highlight: 3, text: 4.5, link: 4.5, rule: 3, field: 3 };

/**
 * "Cores do lado do texto" of the "feature" opening: one choice per element (the theme's own, a colour of the theme, or any colour), posted as
 * `hc_<key>` ("" = the theme's). A contrast warning appears while a chosen colour reads poorly on a chosen ground (only between two exact colours: a theme
 * colour depends on the region's palette, so it is not measured here).
 */
export function HeroColorsEditor({ colors, feature, sectionGround }: {
  colors?: HeroColors;
  /** "Um produto em destaque": the text side has a ground of its own; the three-card hero sits on the section's own Fundo. */
  feature: boolean;
  /** The section's own solid colour (Fundo), as chosen in the form right now: the three-card hero's ground. */
  sectionGround?: string;
}) {
  const fields = feature ? FIELDS : FIELDS.filter((f) => f.key !== "background");
  const [values, setValues] = useState<Record<HeroColorKey, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, colors?.[f.key] ?? ""])) as Record<HeroColorKey, string>);
  const set = (key: HeroColorKey, value: string) => setValues((v) => ({ ...v, [key]: value }));
  // The three-card hero's ground is the section's own (Fundo), measured while it is an exact colour.
  const ground = feature ? values.background : (sectionGround ?? "");
  const warnings = fields.flatMap((f) => {
    const min = MIN_CONTRAST[f.key];
    const value = f.key === "link" && !values.link ? values.text : values[f.key];
    if (!min || !HEX_COLOR.test(value) || !HEX_COLOR.test(ground)) return [];
    const ratio = contrastRatio(value, ground);
    return ratio < min ? [`${f.label}: contraste ${ratio.toFixed(1)}:1 sobre o fundo (o mínimo recomendado é ${min}:1).`] : [];
  });

  return (
    <fieldset className="space-y-4" data-testid="hero-colors">
      <legend className="a-h2 mb-3">Cores do lado do texto</legend>
      <input type="hidden" name="hero_colors_present" value="1" />
      <p className="a-muted text-[0.875rem]">{feature ? "As cores da metade com o título e a busca. Deixe em “Padrão do tema” para seguir a paleta da região (Aparência). A cor da metade do produto continua em Fundo, abaixo." : "As cores do título, do texto e da busca. Deixe em “Padrão do tema” para seguir a paleta da região (Aparência). O fundo desta composição é o da seção, em Fundo, abaixo."}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => {
          const value = values[f.key];
          const custom = value !== "" && !value.startsWith("token:");
          return (
            <div key={f.key}>
              <label className="a-label" htmlFor={`hc_choice_${f.key}`}>{f.label}</label>
              <input type="hidden" name={`hc_${f.key}`} value={value} />
              <div className="flex items-center gap-2">
                <select id={`hc_choice_${f.key}`} className="a-select" value={custom ? "custom" : value} onChange={(e) => set(f.key, e.target.value === "custom" ? (custom ? value : "#ffffff") : e.target.value)} data-testid={`hc-${f.key}`}>
                  <option value="">Padrão do tema</option>
                  {TOKENS.map(([token, name]) => <option key={token} value={token}>{name}</option>)}
                  <option value="custom">Outra cor…</option>
                </select>
                {custom && <input type="color" aria-label={`${f.label}: escolher cor`} value={HEX_COLOR.test(value) ? value : "#ffffff"} onChange={(e) => set(f.key, e.target.value)} className="h-10 w-14 shrink-0" data-testid={`hc-${f.key}-color`} />}
              </div>
              <p className="a-muted mt-1 text-[0.8125rem]">{f.help}</p>
            </div>
          );
        })}
      </div>
      {warnings.length > 0 && (
        <div className="a-flash err text-[0.875rem]" role="status">
          <p className="font-bold">Pouco contraste: pode ficar difícil de ler.</p>
          <ul className="mt-1 list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </fieldset>
  );
}
