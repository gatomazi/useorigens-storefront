import { SOURCES } from "@/lib/analytics/sources";
import type { RegionSlug } from "@/lib/geo/regions";
import type { PodiumLeader } from "@/lib/podio/public";
import { stateIn } from "@/lib/seo/state-copy";
import { TrackedPodioLink } from "./TrackedPodioLink";

/**
 * "Quem está no pódio?" — the home's compact call: one short card per state that has a valid podium, showing only its leading place and a
 * link to the full podium on the state page (#podio). Cards follow the site's editorial state order: the 1º is "leader of that state",
 * never a ranking between states. Hidden entirely when no state has data. Same snapshot and projection as the state page.
 */
export function PodioTeaser({ region, leaders }: { region: RegionSlug; leaders: PodiumLeader[] }) {
  if (leaders.length === 0) return null;
  const cols = leaders.length >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : leaders.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <section id="podio" aria-labelledby="podio-teaser-title" className="wrap pb-14 lg:pb-24">
      <h2 id="podio-teaser-title" className="t-h2">
        Quem está no pódio?
      </h2>
      <p className="t-body mt-3 max-w-2xl text-ink-soft">O ranking muda. A rivalidade também.</p>
      <ul className={`mt-8 grid gap-3 sm:grid-cols-2 lg:mt-10 ${cols}`}>
        {leaders.map((l) => (
          <li key={l.uf}>
            <TrackedPodioLink
              href={l.href}
              params={{ region, state: l.uf, rankingType: "leader", position: 1, source: SOURCES.podioHome }}
              className="group flex h-full min-h-11 flex-col border-t-[3px] border-region-accent bg-[rgb(var(--region-primary-rgb)/0.06)] px-4 pb-4 pt-3 transition-colors hover:border-region-primary focus-visible:border-region-primary"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="t-label">
                  {l.stateName} <span className="text-ink-mute">· {l.uf}</span>
                </span>
                <span className="inline-flex h-6 shrink-0 items-center bg-region-primary px-1.5 text-[0.75rem] font-bold leading-none text-white">
                  1º<span className="sr-only"> lugar {stateIn(l.uf)}</span>
                </span>
              </span>
              <span className="mt-2 block break-words text-[1.375rem] font-extrabold leading-[1.1] tracking-tight transition-colors group-hover:text-region-primary">{l.leaderName}</span>
              <span className="mt-auto pt-3 text-[0.9375rem] font-semibold link-static">Ver pódio →</span>
            </TrackedPodioLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
