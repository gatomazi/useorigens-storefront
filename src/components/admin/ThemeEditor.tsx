"use client";

import { useMemo, useState } from "react";
import { REGIONS, REGION_SLUGS, type RegionSlug } from "@/lib/geo/regions";
import { normalizeHex } from "@/lib/admin/navigation-form";
import { ChromePreview } from "./ChromePreview";
import {
  assembleNavigation,
  contrastMessage,
  resolveTheme,
  THEME_COLOR_KEYS,
  THEME_COLOR_LABEL,
  themeContrast,
  type NavData,
  type NavigationConfig,
  type ThemeColorKey,
  type ThemeColors,
  type ThemeConfig,
  type ThemeMode,
} from "@/lib/site-config/navigation";

type Mode = ThemeMode | "none";

const HINT: Record<ThemeColorKey, string> = {
  brandPrimary: "Identifica a região: chips, filtros, botões secundários.",
  headerBackground: "Fundo da barra do topo. Vazio = a cor principal.",
  headerText: "Texto e ícones do header.",
  mobileMenuBackground: "Fundo do menu em tela cheia no celular.",
  mobileMenuText: "Texto do menu mobile.",
  accent: "Detalhes e marcadores (não use para texto pequeno).",
  pageBackground: "Fundo da página. As fotos de produto têm fundo #e5e5e5: outro tom pode deixar uma caixa visível.",
  pageText: "Texto principal da página.",
};

const LEVEL_TEXT = { ok: "OK", warning: "Abaixo do AA", blocking: "Bloqueia a publicação" } as const;

/**
 * One palette: a region's (no theme / inherit the global one / its own colours) or the global "Use Origens" one. Everything is live: the effective colours,
 * the contrast of every text/background pair and the two previews are computed from what is typed, with the same rules the publisher enforces. A colour
 * left empty is "not set" and keeps the region's current one.
 */
export function ThemeEditor({ scope, region, theme, globalTheme, navigation, navData, readOnly, action, rev, title, note }: {
  scope: "global" | RegionSlug;
  region: RegionSlug;
  theme: ThemeConfig | undefined;
  globalTheme: ThemeConfig | undefined;
  navigation: NavigationConfig | undefined;
  navData: Record<RegionSlug, NavData>;
  readOnly: boolean;
  action: (fd: FormData) => Promise<void>;
  rev: string;
  title: string;
  note: string;
}) {
  const isGlobal = scope === "global";
  const [mode, setMode] = useState<Mode>(isGlobal ? "override" : (theme?.mode ?? "none"));
  const [colors, setColors] = useState<Record<ThemeColorKey, string>>(() => Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, theme?.mode === "override" ? (theme.colors[k] ?? "") : ""])) as Record<ThemeColorKey, string>);
  const [previewRegion, setPreviewRegion] = useState<RegionSlug>(region);

  const current: ThemeConfig | undefined = useMemo(() => {
    if (mode === "none") return undefined;
    if (mode === "inherit") return { mode: "inherit", colors: {} };
    const valid: Partial<ThemeColors> = {};
    for (const k of THEME_COLOR_KEYS) {
      const hex = normalizeHex(colors[k]);
      if (hex) valid[k] = hex; // half-typed or invalid values are simply not applied to the preview
    }
    return { mode: "override", colors: valid };
  }, [mode, colors]);

  const shownRegion = isGlobal ? previewRegion : region;
  // Global palette preview: what a region that INHERITS it would look like.
  const resolved = useMemo(
    () => (isGlobal ? resolveTheme(shownRegion, { theme: { mode: "inherit", colors: {} } }, { theme: current }) : resolveTheme(shownRegion, { theme: current }, { theme: globalTheme })),
    [isGlobal, shownRegion, current, globalTheme],
  );
  const contrast = useMemo(() => themeContrast(resolved.effective), [resolved]);
  const preview = useMemo(() => assembleNavigation(shownRegion, isGlobal ? undefined : navigation, navData[shownRegion]), [isGlobal, shownRegion, navigation, navData]);
  const editable = !readOnly && mode === "override";
  const flagged = contrast.filter((c) => c.level !== "ok");

  const modes: { value: Mode; label: string; hint: string }[] = isGlobal
    ? []
    : [
        { value: "none", label: "Visual atual", hint: "Sem configuração: a região mantém exatamente as cores de hoje." },
        { value: "inherit", label: "Herdar da Use Origens", hint: "Usa a paleta global. Se o global mudar, esta região muda junto, sem deploy." },
        { value: "override", label: "Paleta própria", hint: "Cores só desta região; o global não a afeta." },
      ];

  return (
    <section className="a-card p-5" aria-labelledby={`theme-${scope}`} data-testid={`theme-${scope}`}>
      <h2 id={`theme-${scope}`} className="a-h2">{title}</h2>
      <p className="a-muted mt-1 max-w-3xl text-[0.9375rem]">{note}</p>
      <form action={action} className="mt-5 space-y-6">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="rev" value={rev} />
        <input type="hidden" name="mode" value={mode} />

        {!isGlobal && (
          <fieldset disabled={readOnly}>
            <legend className="a-label">Como esta região usa as cores</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {modes.map((m) => (
                <label key={m.value} className={`flex cursor-pointer items-start gap-2 border p-3 ${mode === m.value ? "border-black bg-black/5" : "border-black/25"}`}>
                  <input type="radio" name={`mode-choice-${scope}`} value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-1" data-testid={`mode-${m.value}`} />
                  <span><span className="block font-extrabold">{m.label}</span><span className="a-muted block text-[0.8125rem]">{m.hint}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {THEME_COLOR_KEYS.map((key) => {
            const shown = resolved.effective[key];
            return (
              <div key={key}>
                <label className="a-label" htmlFor={`${scope}-${key}`}>{THEME_COLOR_LABEL[key]}</label>
                <div className="flex items-center gap-2">
                  <input aria-label={`${THEME_COLOR_LABEL[key]}: seletor de cor`} type="color" value={shown} disabled={!editable} onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))} className="h-10 w-12 shrink-0 cursor-pointer border border-black/38 bg-white p-0.5 disabled:cursor-not-allowed" />
                  <input id={`${scope}-${key}`} name={`color_${key}`} className="a-input font-mono" placeholder={resolved.origin[key] === "default" ? `${shown} (atual)` : shown} value={mode === "override" ? colors[key] : ""} disabled={!editable} onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))} spellCheck={false} autoComplete="off" maxLength={7} data-testid={`color-${key}`} />
                </div>
                <p className="a-muted mt-1 text-[0.75rem]">{HINT[key]}{mode !== "none" && resolved.origin[key] === "global" ? " Vem do global." : ""}</p>
              </div>
            );
          })}
        </div>

        <div data-testid={`contrast-${scope}`}>
          <h3 className="a-label">Contraste (WCAG)</h3>
          <ul className="space-y-1.5 text-[0.875rem]">
            {contrast.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2" data-testid={`contrast-${scope}-${c.id}`} data-level={c.level}>
                <span className={`a-badge ${c.level === "ok" ? "ok" : c.level === "warning" ? "warn" : "bad"}`}>{LEVEL_TEXT[c.level]}</span>
                <span>{c.label}: <strong>{c.ratio.toFixed(1)}:1</strong></span>
              </li>
            ))}
          </ul>
          {flagged.length > 0 && (
            <p className={`a-flash mt-3 ${flagged.some((c) => c.level === "blocking") ? "err" : ""}`} role="status" data-testid={`contrast-warning-${scope}`}>
              {flagged.map((c) => contrastMessage(c)).join(" ")}
            </p>
          )}
        </div>

        {isGlobal && (
          <div className="max-w-xs">
            <label className="a-label" htmlFor="preview-region">Ver a prévia em</label>
            <select id="preview-region" className="a-select" value={previewRegion} onChange={(e) => setPreviewRegion(e.target.value as RegionSlug)}>
              {REGION_SLUGS.map((r) => <option key={r} value={r}>{REGIONS[r].name}</option>)}
            </select>
            <p className="a-muted mt-1 text-[0.75rem]">Como ficaria uma região que herda esta paleta (cores não definidas aqui seguem o visual atual de cada região).</p>
          </div>
        )}

        <ChromePreview region={shownRegion} navigation={preview} colors={resolved.effective} />

        {readOnly ? <p className="a-muted">Somente leitura para o seu perfil.</p> : <button type="submit" className="a-btn" data-testid={`save-theme-${scope}`}>Salvar rascunho {isGlobal ? "da paleta global" : `de ${REGIONS[region].name}`}</button>}
      </form>
    </section>
  );
}
