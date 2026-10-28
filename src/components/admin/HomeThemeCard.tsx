import { editHomeThemeAction, setHomeThemeAction } from "@/app/admin/actions";
import type { RegionSlug } from "@/lib/geo/regions";
import { EDITORIAL_PALETTE, hasHomeTheme, HOME_THEME_LABEL, isSeasonalTheme } from "@/lib/site-config/home-themes";
import { HOME_THEMES, homeThemeOf, type HomeThemeName, type ScopeDoc } from "@/lib/site-config/schema";
import { REGION_THEME } from "@/lib/theme/region-theme";

const ABOUT: Record<HomeThemeName, string> = {
  original: "O visual que a loja já tem: header na cor da região, o cinza das fotos como fundo, as seções nas composições de sempre.",
  editorial: "A direção editorial: verde profundo, fundo creme e terracota; abertura com produto ou banner em destaque, faixa de estados, cards de coleção e campanha dividida. Faixa do topo e rodapé no verde.",
  black: "Para a Black Friday: nasce como cópia do tema em uso, com a abertura escura (fundo preto, destaque amarelo, “de R$ 119,90 por R$ 99,90”) e o topo preto. Depois da data, volte ao tema de antes em “Usar na loja”.",
  natal: "Para o Natal: nasce como cópia do tema em uso, com a abertura “Presente que tem endereço.” em vermelho e, logo abaixo, a chamada para o Natal em família e a vitrine da coleção Natal. Depois da data, volte ao tema de antes em “Usar na loja”.",
};

/**
 * The THEMES of the region's home, like the themes of a shop platform: each with its OWN sections and its OWN colours. The panel EDITS one theme at a
 * time (Home and Aparência show and save only that theme's sections and colours) and, separately, chooses the theme the STORE uses. Editing a theme never
 * puts it on the store; choosing the store's theme never loses the other one.
 *
 * `doc`: the region's document as the editor sees it (every theme is in it, in use or kept). `to`: the screen to come back to.
 */
export function HomeThemeCard({ region, doc, editing, active, live, rev, readOnly, to }: {
  region: RegionSlug;
  doc: ScopeDoc;
  editing: HomeThemeName;
  /** The theme the store uses in the draft. */
  active: HomeThemeName;
  /** The theme the store uses now (published). */
  live: HomeThemeName;
  rev: number | null;
  readOnly: boolean;
  to: "/admin/home" | "/admin/aparencia";
}) {
  // Each theme's OWN colours as they are in the draft (the one in use carries `doc.theme`, a kept one its own), over the look it has with none set.
  // Main colour, page background and accent.
  const fallback: Record<HomeThemeName, string[]> = {
    original: [REGION_THEME[region].primary, "#e5e5e5", REGION_THEME[region].accent],
    editorial: [EDITORIAL_PALETTE.colors.brandPrimary!, EDITORIAL_PALETTE.colors.pageBackground!, EDITORIAL_PALETTE.colors.accent!],
    // Not created yet: the colours of their openings (the palette itself will be the theme in use's).
    black: ["#111111", "#ffffff", "#e2b64a"],
    natal: [EDITORIAL_PALETTE.colors.brandPrimary!, EDITORIAL_PALETTE.colors.pageBackground!, "#a8322d"],
  };
  const swatches = (name: HomeThemeName): string[] => {
    const inUse = homeThemeOf(doc) === name;
    const theme = inUse ? doc.theme : doc.homeThemes?.[name]?.theme;
    const c = theme?.mode === "override" ? theme.colors : {};
    const [primary, page, accent] = fallback[name];
    if (!isSeasonalTheme(name)) return [c.brandPrimary ?? primary, c.pageBackground ?? page, c.accent ?? accent];
    // A seasonal theme shares the palette it was copied from: what tells it apart is its top and its opening's colours.
    const hero = (inUse ? doc.home?.sections : doc.homeThemes?.[name]?.sections)?.find((s) => s.template === "hero")?.heroColors;
    const hex = (v: string | undefined) => (v?.startsWith("#") ? v : undefined);
    return [c.headerBackground ?? c.brandPrimary ?? primary, hex(hero?.background) ?? c.pageBackground ?? page, hex(hero?.highlight) ?? c.accent ?? accent];
  };
  const hidden = (theme: HomeThemeName) => (
    <>
      <input type="hidden" name="scope" value={region} />
      <input type="hidden" name="rev" value={rev ?? "null"} />
      <input type="hidden" name="home_theme" value={theme} />
      <input type="hidden" name="to" value={to} />
    </>
  );
  return (
    <section id="tema-da-home" className="a-card scroll-mt-4 p-5" aria-labelledby="tema-da-home-titulo" data-testid="home-theme">
      <h2 id="tema-da-home-titulo" className="a-h2">Tema da home</h2>
      <p className="a-muted mt-2 max-w-3xl">Temas, como numa plataforma de loja: cada um tem as <strong>próprias seções</strong> e as <strong>próprias cores</strong>. Black Friday e Natal são cópias do tema em uso feitas na hora em que você os cria, com a abertura da data. Escolha qual tema editar; Home e Aparência passam a mostrar e salvar só o dele. Editar um tema não o coloca na loja: isso é o botão “Usar na loja”, que vale quando a região for publicada.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2" role="group" aria-label="Temas da home">
        {HOME_THEMES.map((name) => {
          const exists = hasHomeTheme(doc, name);
          const isEditing = name === editing;
          return (
            <div key={name} className={`border p-4 ${isEditing ? "border-black bg-white" : "border-black/20"}`} data-testid={`home-theme-${name}`} aria-current={isEditing ? "true" : undefined}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[1.0625rem] font-extrabold">{HOME_THEME_LABEL[name]}</p>
                {isEditing && <span className="a-badge ok">editando</span>}
                {name === active && <span className="a-badge">na loja{active !== live ? " (rascunho)" : ""}</span>}
                {name === live && active !== live && <span className="a-badge">na loja agora</span>}
                {!exists && <span className="a-badge">ainda não criado</span>}
              </div>
              <div className="mt-3 flex gap-1.5" aria-hidden="true">
                {swatches(name).map((c, i) => <span key={i} className="h-6 w-10 border border-black/15" style={{ background: c }} />)}
              </div>
              <p className="a-muted mt-3 text-[0.875rem]">{ABOUT[name]}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {!isEditing && !readOnly && (
                  <form action={editHomeThemeAction}>
                    {hidden(name)}
                    <button type="submit" className="a-btn sm" data-testid={`edit-home-theme-${name}`}>{exists ? `Editar o tema ${HOME_THEME_LABEL[name]}` : `Criar e editar o tema ${HOME_THEME_LABEL[name]}`}</button>
                  </form>
                )}
                {exists && name !== active && !readOnly && (
                  <form action={setHomeThemeAction}>
                    {hidden(name)}
                    <button type="submit" className="a-btn sm ghost" data-testid={`use-home-theme-${name}`}>Usar na loja</button>
                  </form>
                )}
                {exists && (
                  <a href={`/admin/preview?tema=${name}`} target="_blank" rel="noopener" className="a-link text-[0.875rem]">Ver prévia</a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
