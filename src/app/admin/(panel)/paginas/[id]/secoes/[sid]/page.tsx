import Link from "next/link";
import { notFound } from "next/navigation";
import { saveSection } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { SectionEditorForm } from "@/components/admin/SectionEditorForm";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { toComboEntries } from "@/lib/admin/combo";
import { listMedia } from "@/lib/admin/media";
import { pageOptions } from "@/lib/admin/pages-view";
import { platform } from "@/lib/admin/platform";
import { currentScope, storeOf } from "@/lib/admin/scope";
import { campaignStatus, cityStylesStatus, imageGridStatus, statesStatus } from "@/lib/admin/structured-status";
import { collectionOrderArrangement, collectionOrderMembers, sourceStatus } from "@/lib/admin/validate-draft";
import { loadWorkspace } from "@/lib/admin/workspace";
import { libraryEntries } from "@/lib/catalog/collection-source";
import { STATE_NAMES } from "@/lib/geo/regions";
import { REGIONS } from "@/lib/geo/regions";
import { bannerFor, usableBannerAsset } from "@/lib/editorial/banners";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";

/** The section editor inside a page: the SAME form as the home's, carrying the page id so every save goes to that page. */
export default async function PageSectionEditor({ params, searchParams }: { params: Promise<{ id: string; sid: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const [{ id, sid }, sp] = await Promise.all([params, searchParams]);
  const ws = await loadWorkspace(scope);
  const page = ws.doc.pages?.find((p) => p.id === id);
  const section = page?.sections.find((s) => s.id === sid);
  if (!page || !section) notFound();
  const published = (await platform().files.read())?.docs[scope] ?? ws.baseDoc;
  const store = storeOf(scope);
  const entries = toComboEntries(libraryEntries(store, enabledInternalIds(ws.doc, store)));
  const status = sourceStatus(section, ws.doc);
  const media = await listMedia();
  const structured = section.template === "city-styles" ? cityStylesStatus(scope, section) : section.template === "states" ? statesStatus(scope) : section.template === "campaign" ? campaignStatus(scope) : section.template === "image-grid" ? imageGridStatus(section) : null;
  const stateCovers = section.template === "states" ? REGIONS[scope].ufs.map((uf) => ({ uf, name: STATE_NAMES[uf], legacy: usableBannerAsset("state", bannerFor(scope, "state", uf)) !== null })) : undefined;
  const customizers = (ws.doc.customizers ?? []).map((m) => ({ id: m.id, name: m.name, active: m.active, live: Boolean(published.customizers?.some((x) => x.id === m.id)) }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/paginas/${page.id}`} className="a-link text-[0.875rem]">← {page.title}</Link>
        <h1 className="a-h1 mt-2">{section.title?.replace(/\n/g, " ") ?? section.anchor}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span className="a-badge">{section.template}</span>
          {section.active ? <span className="a-badge ok">Ativa</span> : <span className="a-badge">Oculta</span>}
          {structured && (structured.ok ? <span className="a-badge ok">{structured.summary}</span> : <span className="a-badge bad">{structured.summary}</span>)}
          {status && (status.problem ? <span className="a-badge bad">{status.label}: {status.problem}</span> : <span className="a-badge">{status.label} · {status.products} produto(s)</span>)}
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,34rem)_1fr]">
        <section className="a-card p-5" aria-label="Editor da seção">
          <SectionEditorForm
            section={section} rev={ws.record?.rev ?? null} scope={scope} media={media} collections={entries} action={saveSection} notes={structured?.notes}
            stateCovers={stateCovers} page={page.id} pages={pageOptions(ws.doc, published)} customizers={customizers} anchors={page.sections.map((s) => ({ anchor: s.anchor, label: s.title?.replace(/\n/g, " ") ?? s.anchor }))}
            collectionMembers={collectionOrderMembers(section, ws.doc)}
            collectionArrangement={collectionOrderArrangement(section, ws.doc)}
            pageKind={page.kind}
          />
        </section>
        <section className="a-card p-5 2xl:sticky 2xl:top-4 2xl:self-start" aria-label="Pré-visualização">
          <PreviewFrame version={ws.record?.rev ?? 0} page={page.id} anchor={section.anchor} height={760} />
        </section>
      </div>
    </div>
  );
}
