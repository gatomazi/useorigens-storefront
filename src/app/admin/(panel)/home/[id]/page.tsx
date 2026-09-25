import Link from "next/link";
import { notFound } from "next/navigation";
import { saveSection, searchHeroProductsAction } from "@/app/admin/actions";
import { eligibleFeaturedCount, legacyFeaturedRefs, resolveFeatured } from "@/lib/hero-featured";
import { REGIONS } from "@/lib/geo/regions";
import type { FeaturedSlotView } from "@/components/admin/HeroFeaturedProducts";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { SectionEditorForm } from "@/components/admin/SectionEditorForm";
import { listMedia } from "@/lib/admin/media";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { sourceStatus } from "@/lib/admin/validate-draft";
import { loadWorkspace } from "@/lib/admin/workspace";
import { campaignStatus, cityStylesStatus, statesStatus } from "@/lib/admin/structured-status";
import { currentScope, storeOf } from "@/lib/admin/scope";
import { toComboEntries } from "@/lib/admin/combo";
import { libraryEntries } from "@/lib/catalog/collection-source";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";

export default async function EditSection({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const store = storeOf(scope);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ws = await loadWorkspace(scope);
  const section = ws.doc.home?.sections.find((s) => s.id === id);
  if (!section) notFound();

  const entries = toComboEntries(libraryEntries(store, enabledInternalIds(ws.doc, store)));
  const status = sourceStatus(section, ws.doc);
  const media = await listMedia();
  const anchor = section.template === "hero" ? undefined : section.anchor;
  const slotViews = (refs: { store: string; productId: string }[]): FeaturedSlotView[] =>
    resolveFeatured(scope, refs as never).map((sl) => ({ value: `${sl.ref.store}:${sl.ref.productId}`, ok: sl.ok, reason: sl.reason, familyName: sl.card?.familyName, cityName: sl.card?.cityName, uf: sl.card?.uf, price: sl.card?.price, imageUrl: sl.imageUrl, buyUrl: sl.buyUrl }));
  // Sul that was never customised keeps the three cards the code has always shown (read-only until the owner customises them).
  const featured =
    section.template === "hero"
      ? section.featured === undefined && scope === "sul"
        ? { mode: "legacy" as const, initial: slotViews(legacyFeaturedRefs("sul")), eligible: eligibleFeaturedCount(scope), regionName: REGIONS[scope].name, search: searchHeroProductsAction }
        : { mode: "edit" as const, initial: slotViews(section.featured ?? []), eligible: eligibleFeaturedCount(scope), regionName: REGIONS[scope].name, search: searchHeroProductsAction }
      : undefined;
  const structured = section.template === "city-styles" ? cityStylesStatus(scope, section) : section.template === "states" ? statesStatus(scope) : section.template === "campaign" ? campaignStatus(scope) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/home" className="a-link text-[0.875rem]">← Seções</Link>
        <h1 className="a-h1 mt-2">{section.title?.replace(/\n/g, " ") ?? section.anchor}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span className="a-badge">{section.template}</span>
          {section.id.startsWith("custom-") && <span className="a-badge ok">Criada aqui</span>}
          {section.active ? <span className="a-badge ok">Ativa</span> : <span className="a-badge">Oculta</span>}
          {structured && (structured.ok ? <span className="a-badge ok">{structured.summary}</span> : <span className="a-badge bad">{structured.summary}</span>)}
          {status && (status.problem ? <span className="a-badge bad">{status.label}: {status.problem}</span> : <span className="a-badge">{status.label} · {status.products} produto(s)</span>)}
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,34rem)_1fr]">
        <section className="a-card p-5" aria-label="Editor da seção">
          <SectionEditorForm section={section} rev={ws.record?.rev ?? null} scope={scope} media={media} collections={entries} action={saveSection} notes={structured?.notes} featured={featured} />
        </section>
        <section className="a-card p-5 2xl:sticky 2xl:top-4 2xl:self-start" aria-label="Pré-visualização">
          <PreviewFrame version={ws.record?.rev ?? 0} anchor={anchor} height={760} />
        </section>
      </div>
    </div>
  );
}
