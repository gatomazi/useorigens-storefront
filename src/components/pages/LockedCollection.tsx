import Link from "next/link";
import { dayMonth } from "@/lib/site-config/checkpoints";

/**
 * A collection page the Black calendar keeps closed (`CollectionLanding.locked`): only a padlock and the day it opens, never a product, a price or
 * the collection's offer. The page is noindex (see the route's metadata); the store's header and footer stay around it as on any page.
 */
export function LockedCollection({ region, opensAt }: { region: string; opensAt: string }) {
  return (
    <section aria-labelledby="locked-title" className="wrap flex min-h-[60vh] items-center justify-center py-20 text-center" data-testid="locked-collection">
      <div className="max-w-md">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#e2b64a", color: "#111" }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </svg>
        </span>
        <p className="text-[0.75rem] font-bold uppercase tabular-nums tracking-[0.12em] text-ink-soft">Abre {dayMonth(opensAt)}</p>
        <h1 id="locked-title" className="mt-2 font-display text-[clamp(2.25rem,6vw,3.5rem)] font-extrabold uppercase leading-[0.95]">Oferta surpresa</h1>
        <p className="t-body mt-4 text-ink-soft">Esta seleção abre em {dayMonth(opensAt)}, à meia-noite. Até lá, o cadeado fica fechado.</p>
        <Link href={`/${region}`} className="btn mt-8">Voltar para a loja</Link>
      </div>
    </section>
  );
}
