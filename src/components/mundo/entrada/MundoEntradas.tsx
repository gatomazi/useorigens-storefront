import Image from "next/image";
import type { RegionSlug } from "@/lib/geo/regions";
import { MUNDO_CAMINHO } from "@/lib/mundo/flag";
import ilhas from "./ilhas-piloto.jpg";

/**
 * The store's three ways into "Meu Pequeno Mundo". Server components with a static picture — no Three.js, no script, nothing of the
 * experience is loaded by the page that shows them. Plain <a> on purpose: <Link> would prefetch the world's route. The caller renders
 * them only when `mundoEntradasAtivas()` (src/lib/mundo/flag.ts) is on.
 *
 * `entrada` and `loja` tell the world where the visit came from (telemetry, "Voltar à loja"); `cidade` suggests a place. The world reads
 * them once and removes them from the address bar; none of them becomes part of a shared world.
 */
const href = (params: Record<string, string>) => `${MUNDO_CAMINHO}?${new URLSearchParams(params).toString()}`;

/**
 * Home: a compact block right after the state chooser. Its tint runs edge to edge (the section's own background); only the content keeps to the
 * page container, so on a wide screen the colour never stops short of the window.
 */
export function MundoBlocoHome({ region }: { region: RegionSlug }) {
  return (
    <section aria-labelledby="mundo-home-titulo" className="border-t-[3px] border-region-accent bg-[rgb(var(--region-primary-rgb)/0.06)]">
      <div className="wrap grid items-center gap-6 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-10 md:py-12">
        <div className="order-2 md:order-1">
          <p className="t-label">Meu Pequeno Mundo</p>
          <h2 id="mundo-home-titulo" className="t-h2 mt-2">
            Os lugares que fazem parte de você
          </h2>
          <p className="t-body mt-3 max-w-xl text-ink-soft">Monte um pequeno mundo com sua origem, seu presente e seu lugar do coração, e encontre as camisetas de cada um.</p>
          <a href={href({ entrada: "home", loja: region })} className="btn mt-6 inline-flex min-h-11 items-center">
            Montar meu mundo
          </a>
        </div>
        <a href={href({ entrada: "home", loja: region })} className="order-1 block md:order-2" tabIndex={-1} aria-hidden="true">
          <Image src={ilhas} alt="" sizes="(min-width: 768px) 46vw, 92vw" placeholder="blur" className="h-auto w-full" />
        </a>
      </div>
    </section>
  );
}

/** City page: an invitation to build a world starting from this place (only a suggestion: nothing changes without the visitor's choice). */
export function MundoConviteCidade({ region, cityId, cityName }: { region: RegionSlug; cityId: string; cityName: string }) {
  return (
    <aside aria-labelledby="mundo-cidade-titulo" className="mt-10 max-w-2xl border-t-[3px] border-region-accent bg-[rgb(var(--region-primary-rgb)/0.06)] px-4 pb-5 pt-4 lg:mt-14">
      <p className="t-label">Meu Pequeno Mundo</p>
      <h2 id="mundo-cidade-titulo" className="mt-1 text-[1.25rem] font-extrabold tracking-tight">
        {cityName} faz parte da sua história?
      </h2>
      <p className="t-body mt-2 text-ink-soft">Monte um pequeno mundo com sua origem, seu presente e seu lugar do coração.</p>
      <a href={href({ entrada: "cidade", cidade: cityId, loja: region })} className="link-static mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-semibold">
        Montar meu mundo com {cityName} →
      </a>
    </aside>
  );
}

/** Footer: a plain text link in the "Loja" list. */
export function MundoLinkRodape({ region }: { region: RegionSlug }) {
  return (
    <a href={href({ entrada: "rodape", loja: region })} className="link-line inline-flex min-h-11 min-w-11 items-center text-[0.9375rem]">
      Meu Pequeno Mundo
    </a>
  );
}
