import { saveHeaderActionsAction } from "@/app/admin/actions";
import { HEADER_ACTIONS, HEADER_ACTION_LABEL, headerActionsOf, type NavigationConfig } from "@/lib/site-config/navigation-schema";

const ICONS: Record<(typeof HEADER_ACTIONS)[number], React.ReactNode> = {
  favorites: <path d="M12 20.5s-7.5-4.6-10-9.3C.6 7.8 2.4 4.5 5.7 4c2-.3 3.9.6 5 2.2C11.8 4.6 13.7 3.7 15.7 4c3.3.5 5.1 3.8 3.7 7.2-2.5 4.7-10 9.3-10 9.3Z" />,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
};

/**
 * "Ícones do topo": the header's buttons on the right ("Meus Lugares", "Conta", "Buscar"), each the icon only or the icon with its word (from 640px;
 * phones always show the icon). A draft of the region's navigation, like the rest of the menu; the menu editor below keeps this choice when it saves.
 */
export function HeaderActionsCard({ scope, navigation, rev, readOnly }: { scope: string; navigation: NavigationConfig | undefined; rev: number | null; readOnly: boolean }) {
  const now = headerActionsOf(navigation);
  return (
    <section className="a-card scroll-mt-4 p-5" id="icones-do-topo" aria-labelledby="icones-do-topo-titulo" data-testid="header-actions">
      <h2 id="icones-do-topo-titulo" className="a-h2">Ícones do topo</h2>
      <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">Os botões à direita do topo do site. “Só o ícone” deixa a barra mais leve (o nome continua para leitores de tela e aparece ao passar o mouse); “Ícone e texto” mostra a palavra ao lado, a partir de tablets. No celular são sempre só ícones.</p>
      <form action={saveHeaderActionsAction} className="mt-4 space-y-3">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="rev" value={rev ?? "null"} />
        {HEADER_ACTIONS.map((a) => (
          <fieldset key={a} className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <legend className="sr-only">{HEADER_ACTION_LABEL[a]}</legend>
            <span aria-hidden="true" className="inline-flex w-40 items-center gap-2 font-bold">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{ICONS[a]}</svg>
              {HEADER_ACTION_LABEL[a]}
            </span>
            <label className="flex min-h-11 items-center gap-2 text-[0.9375rem]">
              <input type="radio" name={`header_${a}`} value="icon" defaultChecked={now[a] === "icon"} disabled={readOnly} data-testid={`header-${a}-icon`} /> Só o ícone
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[0.9375rem]">
              <input type="radio" name={`header_${a}`} value="label" defaultChecked={now[a] === "label"} disabled={readOnly} data-testid={`header-${a}-label`} /> Ícone e texto
            </label>
          </fieldset>
        ))}
        {!readOnly && <button type="submit" className="a-btn" data-testid="header-actions-save">Salvar rascunho</button>}
      </form>
    </section>
  );
}
