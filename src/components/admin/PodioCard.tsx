import { setPodioAction } from "@/app/admin/actions";
import { scopeName } from "@/lib/admin/scope";
import { podioPublicEnabled } from "@/lib/config/env";
import type { RegionSlug } from "@/lib/geo/regions";
import { freshnessOf } from "@/lib/podio/public";
import { readLatestSnapshot, readRunState } from "@/lib/podio/snapshot";
import { PODIO_TZ } from "@/lib/podio/window";

const podioWhen = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: PODIO_TZ });

/** "O Pódio" is not a section (it follows "Estados" on the home and sits on every state page), so it gets a switch of its own, saved in the draft. */
export function PodioCard({ scope, rev, draft, live }: { scope: RegionSlug; rev: number | null; draft: boolean; live: boolean }) {
  const run = readRunState(scope);
  const fresh = freshnessOf(readLatestSnapshot(scope), run, new Date());
  return (
    <section id="podio" className="a-card scroll-mt-4 p-5" aria-labelledby="podio-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 id="podio-titulo" className="a-h2">O Pódio</h2>
          <p className="a-muted mt-1 text-[0.875rem]">Os lugares e as estampas mais vestidos nos últimos 30 dias: “O Pódio” na página de cada estado e “Quem está no pódio?” na home, logo depois de Estados. Desligado, some dos dois lugares e o cálculo diário (04:00) deixa de ler os pedidos da INK de {scopeName(scope)}.</p>
        </div>
        <form action={setPodioAction}>
          <input type="hidden" name="rev" value={rev ?? "null"} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="enabled" value={String(!draft)} />
          <button type="submit" className="a-btn sm">{draft ? "Desligar o pódio" : "Ligar o pódio"}</button>
        </form>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[0.9375rem]" data-testid="podio-status">
        Na loja: {live ? <span className="a-badge ok">Ligado</span> : <span className="a-badge">Desligado</span>}
        {draft !== live && <span className="a-badge warn">No rascunho: {draft ? "ligado" : "desligado"} (falta publicar)</span>}
      </p>
      <p className="a-muted mt-2 text-[0.8125rem]">
        Último cálculo: {run?.lastSuccess ? podioWhen.format(new Date(run.lastSuccess.at)) : "nenhum"}.
        {draft && !fresh.visible && " Sem cálculo recente: depois de publicar, o pódio só aparece na loja após o próximo cálculo diário."}
      </p>
      {!podioPublicEnabled() && <p className="a-flash err mt-3">Desligado no servidor (<code>PODIO_PUBLIC=off</code>) para todas as regiões: enquanto essa variável existir, o pódio não aparece nem é calculado, seja qual for a escolha aqui.</p>}
    </section>
  );
}
