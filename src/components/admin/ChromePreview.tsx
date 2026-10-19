"use client";

import Image from "next/image";
import { MobileMenuPanel } from "@/components/layout/MobileMenu";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import type { NavBlockData, ResolvedNavigation, ThemeColors } from "@/lib/site-config/navigation";

/**
 * The two surfaces the editor is styling, drawn from the SAME resolved data and the SAME menu component the store uses (MobileMenuPanel), on the colours
 * being edited. Inert on purpose: nothing here links, tracks or requests anything, so opening the editor never reports an event.
 */
export function ChromePreview({ region, navigation, colors }: { region?: RegionSlug; navigation: Pick<ResolvedNavigation, "blocks" | "primary" | "collections" | "categories" | "categoriesLabel" | "states" | "regions">; colors: ThemeColors }) {
  const logo = region ? `/brand/logo-${region === "centro-oeste" ? "centro" : region}.png` : null;
  const name = region ? REGIONS[region].name : "páginas sem região";
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]" data-testid="chrome-preview">
      <figure className="min-w-0" data-testid="preview-desktop">
        <figcaption className="a-label">Desktop Header</figcaption>
        <div className="overflow-hidden border border-black/25" role="img" aria-label={`Prévia do header desktop de ${name}`}>
          <div className="flex h-14 items-center justify-between gap-4 px-4" style={{ background: colors.headerBackground, color: colors.headerText }} data-testid="preview-header">
            <span className="flex items-center gap-2">
              {logo && <Image src={logo} alt="" width={40} height={40} className="h-8 w-8" unoptimized />}
              <span translate="no" className="font-display text-[1.25rem] font-black uppercase leading-none tracking-[0.02em]">Use Origens</span>
            </span>
            <span className="hidden items-center gap-5 text-[0.8125rem] font-semibold sm:flex">
              {region && <span>Sua cidade</span>}
              {navigation.states.length > 0 && <span>Estados ▾</span>}
              {navigation.categories.length > 0 && <span>{navigation.categoriesLabel} ▾</span>}
              {[...navigation.primary, ...navigation.collections].map((l) => <span key={l.href}>{l.label}</span>)}
            </span>
            <span className="flex items-center gap-3 text-[0.8125rem] font-semibold">
              {region && navigation.regions.length > 0 && <span>{REGIONS[region].name} ▾</span>}
              {region && <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4" /></svg>}
            </span>
          </div>
          <div className="px-4 py-5" style={{ background: colors.pageBackground, color: colors.pageText }} data-testid="preview-page">
            <p className="text-[1.125rem] font-extrabold leading-tight">{region ? "Sua cidade, de 8 jeitos." : "Todas as suas origens."}</p>
            <p className="mt-1 text-[0.8125rem]">Amostra da página: fundo e texto principal.</p>
            <span className="mt-3 inline-flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-wide">
              <span className="inline-block h-3 w-10" style={{ background: colors.brandPrimary }} aria-hidden="true" /> cor principal
              <span className="ml-2 inline-block h-3 w-10" style={{ background: colors.accent }} aria-hidden="true" /> destaque
            </span>
          </div>
        </div>
      </figure>

      <figure className="mx-auto w-full max-w-[20rem]" data-testid="preview-drawer">
        <figcaption className="a-label">Mobile Drawer</figcaption>
        <div className="h-[34rem] overflow-y-auto border border-black/25 px-5 pb-6" style={{ background: colors.mobileMenuBackground, color: colors.mobileMenuText, ["--region-accent" as string]: colors.accent }} role="img" aria-label={`Prévia do menu mobile de ${name}`}>
          <div className="flex justify-end pt-2">
            <span className="inline-flex min-h-11 items-center gap-2 text-[1rem] font-semibold">
              Fechar
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
            </span>
          </div>
          <div className="pt-3">
            {/* The store's menu opens with the city search ("Sua cidade"); drawn here as a still field. */}
            {region && <div className="mb-7 border-b border-current/25 pb-6">
              <p className="mb-3 flex items-center gap-2.5 text-[0.8125rem] font-semibold uppercase leading-none tracking-[0.14em]">
                <span aria-hidden="true" className="inline-block h-[3px] w-5" style={{ background: "var(--region-accent, currentColor)" }} />
                Sua cidade
              </p>
              <span className="flex min-h-14 items-center border-2 border-black bg-white px-3 text-[0.9375rem] font-medium text-neutral-600">Cidade, estampa ou coleção…</span>
            </div>}
            <MobileMenuPanel blocks={navigation.blocks as NavBlockData[]} interactive={false} />
          </div>
        </div>
      </figure>
    </div>
  );
}
