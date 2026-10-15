import Image from "next/image";
import type { ReactNode } from "react";
import { SOURCES } from "@/lib/analytics/sources";
import type { PodioClickParams } from "@/lib/analytics/track";
import type { PublicFamilyEntry, PublicLocalityEntry, PublicMovement, PublicPodium } from "@/lib/podio/public";
import { stateOf } from "@/lib/seo/state-copy";
import { TrackedPodioLink } from "./TrackedPodioLink";

/**
 * "O Pódio de {estado}" — the full podium on a state page: the top 3 places and the top 3 design families of the last 30 days, from the
 * daily snapshot (src/lib/podio). Reading order is always 1, 2, 3; the leader gets more room, a big 1º, a subtle regional ground and a small
 * LÍDER tag. Nothing here ever shows a quantity. Every entry is ONE link (no nested links/buttons).
 *
 * Copy speaks of the places PRINTED on the shirts ("os lugares mais vestidos"), never of where buyers live.
 */

function MovementBadge({ movement }: { movement: PublicMovement | null }) {
  if (!movement) return null;
  const tone =
    movement.kind === "new"
      ? "bg-ink text-white border-ink"
      : movement.kind === "up"
        ? "border-region-primary text-region-primary"
        : "border-line text-ink-mute";
  return (
    <span className={`inline-flex h-6 shrink-0 items-center border px-1.5 text-[0.75rem] font-bold leading-none tracking-wide ${tone}`}>
      <span aria-hidden="true">{movement.label}</span>
      <span className="sr-only">{movement.description}</span>
    </span>
  );
}

function LeaderTag() {
  return <span className="inline-flex h-6 shrink-0 items-center bg-region-primary px-1.5 text-[0.6875rem] font-bold uppercase leading-none tracking-[0.12em] text-white">Líder</span>;
}

function Ordinal({ position, lead }: { position: number; lead?: boolean }) {
  return (
    <span aria-hidden="true" className={`font-display shrink-0 font-extrabold leading-none tabular-nums ${lead ? "text-[3.25rem] text-region-primary sm:text-[4rem]" : "w-10 text-[1.75rem] text-ink"}`}>
      {position}º
    </span>
  );
}

function EntryShell({ href, track, className, children }: { href: string | null; track: PodioClickParams; className: string; children: ReactNode }) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <TrackedPodioLink href={href} params={track} className={`group ${className}`}>
      {children}
    </TrackedPodioLink>
  );
}

function FamilyThumb({ entry, size }: { entry: PublicFamilyEntry; size: "lead" | "row" }) {
  const box = size === "lead" ? "w-24 sm:w-28" : "w-14";
  if (!entry.example) {
    // No valid product image of this family in this UF: a quiet placeholder of the same size, never a broken image.
    return <span aria-hidden="true" className={`photo block shrink-0 border border-line ${box}`} />;
  }
  return (
    <span className={`photo block shrink-0 ${box}`}>
      <Image src={entry.example.imageUrl} alt="" fill sizes={size === "lead" ? "112px" : "56px"} quality={70} />
    </span>
  );
}

function LocalityList({ podium, entries }: { podium: PublicPodium; entries: PublicLocalityEntry[] }) {
  const track = (e: PublicLocalityEntry): PodioClickParams => ({ region: podium.region, state: podium.uf, rankingType: "locality", position: e.position, source: SOURCES.podioState });
  return (
    <ol className="mt-4">
      {entries.map((e) =>
        e.position === 1 ? (
          <li key={e.id}>
            <EntryShell href={e.href} track={track(e)} className="flex min-h-11 items-start gap-4 bg-[rgb(var(--region-primary-rgb)/0.07)] p-5 sm:gap-5 sm:p-6">
              <Ordinal position={1} lead />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <LeaderTag />
                  <MovementBadge movement={e.movement} />
                </span>
                <span className="mt-2 block break-words text-[1.625rem] font-extrabold leading-[1.1] tracking-tight transition-colors group-hover:text-region-primary sm:text-[2rem]">
                  <span className="sr-only">1º lugar: </span>
                  {e.name}
                </span>
                {e.kind === "administrative_region" && <span className="t-caption mt-1 block">Região Administrativa</span>}
              </span>
            </EntryShell>
          </li>
        ) : (
          <li key={e.id} className="border-b border-line">
            <EntryShell href={e.href} track={track(e)} className="flex min-h-14 items-center gap-3 py-3 sm:gap-4">
              <Ordinal position={e.position} />
              <span className="min-w-0 flex-1 break-words text-[1.125rem] font-bold leading-tight transition-colors group-hover:text-region-primary">
                <span className="sr-only">{e.position}º lugar: </span>
                {e.name}
              </span>
              <MovementBadge movement={e.movement} />
            </EntryShell>
          </li>
        ),
      )}
    </ol>
  );
}

function FamilyList({ podium, entries }: { podium: PublicPodium; entries: PublicFamilyEntry[] }) {
  const track = (e: PublicFamilyEntry): PodioClickParams => ({ region: podium.region, state: podium.uf, rankingType: "family", position: e.position, source: SOURCES.podioState });
  return (
    <ol className="mt-4">
      {entries.map((e) =>
        e.position === 1 ? (
          <li key={e.id}>
            <EntryShell href={e.href} track={track(e)} className="flex min-h-11 items-start gap-4 bg-[rgb(var(--region-primary-rgb)/0.07)] p-5 sm:gap-5 sm:p-6">
              <Ordinal position={1} lead />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <LeaderTag />
                  <MovementBadge movement={e.movement} />
                </span>
                <span className="mt-2 block break-words text-[1.625rem] font-extrabold leading-[1.1] tracking-tight transition-colors group-hover:text-region-primary sm:text-[2rem]">
                  <span className="sr-only">1º lugar: </span>
                  {e.name}
                </span>
                {e.example && <span className="t-caption mt-1 block">Na foto: {e.example.placeName}</span>}
                {e.href && <span className="mt-2 inline-block text-[0.9375rem] font-semibold link-static">Ver camiseta →</span>}
              </span>
              <FamilyThumb entry={e} size="lead" />
            </EntryShell>
          </li>
        ) : (
          <li key={e.id} className="border-b border-line">
            <EntryShell href={e.href} track={track(e)} className="flex min-h-14 items-center gap-3 py-3 sm:gap-4">
              <Ordinal position={e.position} />
              <FamilyThumb entry={e} size="row" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-[1.125rem] font-bold leading-tight transition-colors group-hover:text-region-primary">
                  <span className="sr-only">{e.position}º lugar: </span>
                  {e.name}
                </span>
                {e.example && <span className="t-caption block">Na foto: {e.example.placeName}{e.href ? " · Ver camiseta →" : ""}</span>}
              </span>
              <MovementBadge movement={e.movement} />
            </EntryShell>
          </li>
        ),
      )}
    </ol>
  );
}

export function StatePodium({ podium, productsAnchor }: { podium: PublicPodium; productsAnchor: string }) {
  const { uf, localities, families } = podium;
  const hasPlaces = localities.length > 0;
  const hasFamilies = families.length > 0;
  // "Sua cidade" reads wrong where the places are administrative regions (DF) or other non-municipal localities.
  const otherPlaces = uf === "DF" || localities.some((l) => l.kind !== "municipality");
  return (
    <section id="podio" aria-labelledby="podio-title" className="wrap pb-12 lg:pb-16">
      <div className="border-t-[3px] border-region-accent pt-8 lg:pt-10">
        <h2 id="podio-title" className="t-h2">
          O Pódio {stateOf(uf)}
        </h2>
        <p className="t-body mt-3 max-w-2xl text-ink-soft">Os lugares e as estampas mais vestidos nos últimos 30 dias.</p>
        <p className="t-caption mt-2">
          Atualizado em {podium.updatedLabel} · Vendas dos últimos 30 dias
          {podium.pending && <span> · atualização pendente</span>}
        </p>

        <div className={`mt-8 grid gap-10 lg:mt-10 ${hasPlaces && hasFamilies ? "md:grid-cols-2 md:gap-12" : "max-w-2xl"}`}>
          {hasPlaces && (
            <div>
              <h3 className="t-label uppercase tracking-[0.08em]">Lugares mais vestidos</h3>
              <LocalityList podium={podium} entries={localities} />
            </div>
          )}
          {hasFamilies && (
            <div>
              <h3 className="t-label uppercase tracking-[0.08em]">Estampas mais vestidas</h3>
              <FamilyList podium={podium} entries={families} />
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-col gap-5 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[1.0625rem] font-bold leading-snug">
              {otherPlaces ? "Seu lugar está fazendo a parte dele?" : "Sua cidade está fazendo a parte dela?"} <span aria-hidden="true">👀</span>
            </p>
            <p className="t-small mt-1 text-ink-soft">Vista seu lugar e ajude a mexer nesse pódio.</p>
          </div>
          <TrackedPodioLink
            href={`#${productsAnchor}`}
            params={{ region: podium.region, state: uf, rankingType: "cta", source: SOURCES.podioState }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center bg-ink px-5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-region-primary focus-visible:bg-region-primary"
          >
            Ver camisetas {stateOf(uf)} →
          </TrackedPodioLink>
        </div>
      </div>
    </section>
  );
}
