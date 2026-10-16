import Link from "next/link";
import { setHomeThemeAction } from "@/app/admin/actions";
import type { RegionSlug } from "@/lib/geo/regions";
import { EDITORIAL_COLORS } from "@/lib/site-config/navigation";
import { HOME_THEME_LABEL } from "@/lib/site-config/home-themes";
import { HOME_THEMES, homeThemeOf, type HomeThemeName, type ScopeDoc } from "@/lib/site-config/schema";
import { REGION_THEME } from "@/lib/theme/region-theme";

const ABOUT: Record<HomeThemeName, string> = {
  original: "O visual que a loja já tem: header na cor da região, o cinza das fotos como fundo, e as seções nas composições de sempre.",
  editorial: "A direção editorial aprovada: verde profundo, fundo creme e terracota pontual; abertura com um produto (ou banner) em destaque, faixa de estados, estilos com o título ao lado, cards de coleção e campanha dividida. A faixa do topo e o rodapé ficam no verde.",
};

/**
 * The THEME of the region's home, like the themes of a shop platform: two looks, each with its OWN sections (the same section types, edited in Home).
 * Switching only changes the draft (nothing is lost: the other theme's sections stay kept), and "Ver prévia" shows either theme without switching.
 */
export function HomeThemeCard({ region, doc, live, rev, readOnly }: { region: RegionSlug; doc: ScopeDoc; live: ScopeDoc; rev: number | null; readOnly: boolean }) {
  const inDraft = homeThemeOf(doc);
  const onStore = homeThemeOf(live);
  const swatches: Record<HomeThemeName, string[]> = {
    original: [REGION_THEME[region].primary, "#e5e5e5", REGION_THEME[region].accent, "#000000"],
    editorial: [EDITORIAL_COLORS.brandPrimary, EDITORIAL_COLORS.pageBackground, EDITORIAL_COLORS.accent, "#dfe3d3"],
  };
  return (
    <section id="tema-da-home" className="a-card scroll-mt-4 p-5" aria-labelledby="tema-da-home-titulo" data-testid="home-theme">
      <h2 id="tema-da-home-titulo" className="a-h2">Tema da home</h2>
      <p className="a-muted mt-2 max-w-3xl">Dois temas, como numa plataforma de loja. Cada um tem as <strong>próprias seções</strong> (os mesmos tipos de seção, editados em <Link href="/admin/home" className="a-link">Home</Link>), e trocar de tema não apaga nada: as seções do outro ficam guardadas. A troca vale no rascunho; a loja muda quando a região for publicada. As cores que você definir abaixo, em Identidade visual, valem por cima do tema.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {HOME_THEMES.map((name) => {
          const kept = name !== inDraft && Boolean(doc.homeThemes?.[name]);
          return (
            <div key={name} className={`border p-4 ${name === inDraft ? "border-black bg-white" : "border-black/20"}`} data-testid={`home-theme-${name}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[1.0625rem] font-extrabold">{HOME_THEME_LABEL[name]}</p>
                {name === inDraft && <span className="a-badge ok">no rascunho</span>}
                {name === onStore && <span className="a-badge">na loja</span>}
                {kept && <span className="a-badge">seções guardadas</span>}
              </div>
              <div className="mt-3 flex gap-1.5" aria-hidden="true">
                {swatches[name].map((c, i) => <span key={i} className="h-6 w-10 border border-black/15" style={{ background: c }} />)}
              </div>
              <p className="a-muted mt-3 text-[0.875rem]">{ABOUT[name]}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {name !== inDraft && !readOnly && (
                  <form action={setHomeThemeAction}>
                    <input type="hidden" name="scope" value={region} />
                    <input type="hidden" name="rev" value={rev ?? "null"} />
                    <input type="hidden" name="home_theme" value={name} />
                    <button type="submit" className="a-btn sm" data-testid={`use-home-theme-${name}`}>Usar o tema {HOME_THEME_LABEL[name]} no rascunho</button>
                  </form>
                )}
                {(name === inDraft || kept) && (
                  <a href={`/admin/preview?tema=${name}`} target="_blank" rel="noopener" className="a-link text-[0.875rem]">Ver prévia do tema {HOME_THEME_LABEL[name]}</a>
                )}
                {name !== inDraft && !kept && name === "editorial" && <span className="a-muted text-[0.8125rem]">Na primeira vez, o tema é montado com as seções atuais e as coleções reais da região.</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
