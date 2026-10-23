import { saveCollectionHighlightsAction } from "@/app/admin/actions";
import { highlightProps } from "@/components/layout/menu-highlight";
import { collectionMenuEntries } from "@/lib/catalog/collection-menu";
import type { RegionSlug } from "@/lib/geo/regions";
import { highlightContrast, type ThemeColors } from "@/lib/site-config/navigation";
import { MENU_HIGHLIGHT_KEYS, type MenuHighlightColors, type ScopeDoc } from "@/lib/site-config/schema";

const FIELD_LABEL: Record<(typeof MENU_HIGHLIGHT_KEYS)[number], string> = { background: "Cor do botão", text: "Cor do texto", underline: "Cor da linha embaixo" };

/**
 * Menu › Destaque: a collection of the bar drawn with colours of its own ("Natal" in December), on the desktop bar and in the phone menu. Only the
 * collections on the bar are listed; a highlight kept for one that left the bar stays in the document but is not drawn. Each colour is optional and
 * only counts with its box ticked (a colour input always has a value). The sample beside each name shows what is saved, over the region's header.
 */
export function CollectionHighlightsCard({ region, doc, rev, readOnly, colors }: { region: RegionSlug; doc: ScopeDoc; rev: number | null; readOnly: boolean; colors: ThemeColors }) {
  const top = collectionMenuEntries(region, doc).top.filter((e) => e.pagePath);
  const saved = new Map((doc.collections?.highlights ?? []).map(({ store, collectionId, ...c }) => [`${store}:${collectionId}`, c as MenuHighlightColors]));
  const initial: Record<(typeof MENU_HIGHLIGHT_KEYS)[number], string> = { background: colors.accent, text: colors.headerText, underline: colors.accent };
  return (
    <section id="destaque-colecoes" className="a-card scroll-mt-4 p-5" aria-labelledby="destaque-colecoes-titulo" data-testid="collection-highlights">
      <h2 id="destaque-colecoes-titulo" className="a-h2">Destaque de coleções no topo</h2>
      <p className="a-muted mt-2 max-w-3xl">Para chamar atenção para uma coleção da barra (ex.: Natal): a cor do botão, a cor do texto e a cor da linha que aparece embaixo ao passar o mouse. Vale na barra do computador e no menu do celular (lá a linha fica sempre visível). Marque só as cores que quer trocar; as outras seguem o topo. Só as coleções do <strong>Topo</strong> aparecem aqui. A navbar das páginas de produto da INK não mostra o destaque. Vale depois de publicar.</p>
      {top.length === 0 ? (
        <p className="a-muted mt-4">Nenhuma coleção no Topo agora. Coloque uma no Topo (acima) para poder destacá-la.</p>
      ) : (
        <form action={saveCollectionHighlightsAction} className="mt-4 space-y-4">
          <input type="hidden" name="rev" value={rev ?? "null"} />
          <input type="hidden" name="scope" value={region} />
          {top.map((e) => {
            const key = `${e.ref.store}:${e.ref.collectionId}`;
            const current = saved.get(key);
            const issues = current ? highlightContrast(current, colors) : [];
            return (
              <fieldset key={key} className="border-t border-black/15 pt-3" data-testid={`highlight-${key}`}>
                <legend className="flex flex-wrap items-center gap-3 font-semibold">
                  {e.record.name}
                  <span className="inline-flex h-11 items-center px-3 text-[0.9375rem] font-semibold" style={{ background: colors.headerBackground, color: colors.headerText }} aria-label={`Como fica no topo: ${current ? "em destaque" : "sem destaque"}`}>
                    <span className={`py-1 ${current ? "menu-highlight menu-highlight-static" : ""}`} {...highlightProps(current)}>{e.record.name}</span>
                  </span>
                </legend>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
                  {MENU_HIGHLIGHT_KEYS.map((k) => (
                    <label key={k} className="flex items-center gap-2 text-[0.9375rem]">
                      <input type="checkbox" name={`hl_${key}_${k}_on`} defaultChecked={Boolean(current?.[k])} disabled={readOnly} />
                      {FIELD_LABEL[k]}
                      <input type="color" name={`hl_${key}_${k}`} defaultValue={current?.[k] ?? initial[k]} aria-label={`${FIELD_LABEL[k]} de ${e.record.name}`} className="h-9 w-12" disabled={readOnly} />
                    </label>
                  ))}
                </div>
                {issues.map((i) => (
                  <p key={i.message} className={`mt-2 text-[0.8125rem] ${i.level === "blocking" ? "a-flash err" : "a-muted"}`}>{i.level === "blocking" ? "Não publica: " : "Atenção: "}{i.message}.</p>
                ))}
              </fieldset>
            );
          })}
          <p className="a-muted text-[0.8125rem]">Quando a barra não tem espaço, as últimas coleções do Topo saem dela (continuam em Categorias e no menu do celular). Deixe a coleção em destaque entre as primeiras do Topo. Em telas estreitas de computador (perto de 1024 px) a barra só mostra os links da home, sem nenhuma coleção.</p>
          {!readOnly && <button type="submit" className="a-btn" data-testid="save-collection-highlights">Salvar rascunho do destaque</button>}
        </form>
      )}
    </section>
  );
}
