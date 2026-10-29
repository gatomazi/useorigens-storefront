import Link from "next/link";
import { notFound } from "next/navigation";
import { clearRegionalSection, saveRegionalSection, searchHeroProductsAction } from "@/app/admin/actions";
import { eligibleFeaturedCount, resolveFeatured } from "@/lib/hero-featured";
import { REGIONS, STATE_NAMES } from "@/lib/geo/regions";
import type { FeaturedSlotView } from "@/components/admin/HeroFeaturedProducts";
import type { FeaturedProductRef } from "@/lib/site-config/schema";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { SectionEditorForm } from "@/components/admin/SectionEditorForm";
import { listMedia } from "@/lib/admin/media";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { loadWorkspace } from "@/lib/admin/workspace";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { toComboEntries } from "@/lib/admin/combo";
import { libraryEntries } from "@/lib/catalog/collection-source";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import { followedDoc } from "@/lib/site-config/follow";
import { FOLLOW_SOURCE } from "@/lib/site-config/follow-schema";

/**
 * "Imagens e produtos" of one of Sul's sections, in a region that follows Sul's home: the section as the region shows it (Sul's structure, the region's
 * own pictures and products when it has them), edited with the section editor in its regional mode. Only the region's draft is written.
 */
export default async function RegionalSection({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  if (scope === FOLLOW_SOURCE) notFound();
  const store = storeOf(scope);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [ws, sul] = await Promise.all([loadWorkspace(scope), loadWorkspace(FOLLOW_SOURCE)]);
  const section = followedDoc({ ...ws.doc, follow: ["home"] }, sul.baseDoc, true).home?.sections.find((s) => s.id === id);
  if (!section) notFound();
  const own = ws.doc.regional?.some((e) => e.sectionId === id) ?? false;

  const media = await listMedia();
  const slotViews = (refs: FeaturedProductRef[]): FeaturedSlotView[] =>
    resolveFeatured(scope, refs).map((sl) => ({
      value: `${sl.ref.store}:${sl.ref.productId}`, ok: sl.ok, reason: sl.reason, familyName: sl.card?.familyName, cityName: sl.card?.cityName, uf: sl.card?.uf, price: sl.card?.price, imageUrl: sl.imageUrl, buyUrl: sl.buyUrl,
      ...(sl.ref.image ? { image: { assetId: sl.ref.image.assetId, alt: sl.ref.image.alt } } : {}),
      ...(sl.ref.pins?.length ? { pins: resolveFeatured(scope, sl.ref.pins).map((p, k) => ({ value: `${p.ref.store}:${p.ref.productId}`, x: sl.ref.pins![k].x, y: sl.ref.pins![k].y, ok: p.ok, reason: p.reason, familyName: p.card?.familyName, cityName: p.card?.cityName, uf: p.card?.uf, imageUrl: p.imageUrl })) } : {}),
    }));
  const featured = section.template === "hero" ? { mode: "edit" as const, initial: slotViews(section.featured ?? []), eligible: eligibleFeaturedCount(scope), regionName: REGIONS[scope].name, search: searchHeroProductsAction } : undefined;
  const stateCovers = section.template === "states" ? REGIONS[scope].ufs.map((uf) => ({ uf, name: STATE_NAMES[uf], legacy: false })) : undefined;
  const entries = toComboEntries(libraryEntries(store, enabledInternalIds(ws.doc, store)));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/home#imagens-regiao" className="a-link text-[0.875rem]">← Home</Link>
        <h1 className="a-h1 mt-2">{section.title?.replace(/\n/g, " ") ?? section.anchor} <span className="a-muted">· imagens e produtos do {scopeName(scope)}</span></h1>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span className="a-badge">{section.template}</span>
          {own ? <span className="a-badge ok">Próprias do {scopeName(scope)}</span> : <span className="a-badge">As da Sul</span>}
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,34rem)_1fr]">
        <section className="a-card space-y-5 p-5" aria-label="Imagens e produtos da região">
          <SectionEditorForm regional section={section} rev={ws.record?.rev ?? null} scope={scope} media={media} collections={entries} action={saveRegionalSection} featured={featured} stateCovers={stateCovers} />
          {own && (
            <form action={clearRegionalSection} className="border-t border-black/15 pt-4">
              <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="id" value={id} />
              <button type="submit" className="a-btn sm ghost">Voltar a usar as imagens e os produtos da Sul</button>
            </form>
          )}
        </section>
        <section className="a-card p-5 2xl:sticky 2xl:top-4 2xl:self-start" aria-label="Pré-visualização">
          <PreviewFrame version={ws.record?.rev ?? 0} anchor={section.template === "hero" ? undefined : section.anchor} height={760} />
        </section>
      </div>
    </div>
  );
}
