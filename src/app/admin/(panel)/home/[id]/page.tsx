import Link from "next/link";
import { notFound } from "next/navigation";
import { saveSection } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { SectionEditorForm } from "@/components/admin/SectionEditorForm";
import { listMedia } from "@/lib/admin/media";
import { requireDevAdmin } from "@/lib/admin/require-dev-admin";
import { sourceStatus } from "@/lib/admin/validate-draft";
import { loadWorkspace } from "@/lib/admin/workspace";
import { toComboEntries } from "@/lib/admin/combo";
import { libraryEntries } from "@/lib/catalog/collection-source";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";

export default async function EditSection({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireDevAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ws = await loadWorkspace();
  const section = ws.doc.home?.sections.find((s) => s.id === id);
  if (!section) notFound();

  const entries = toComboEntries(libraryEntries("use-sul", enabledInternalIds(ws.doc, "use-sul")));
  const status = sourceStatus(section, ws.doc);
  const media = await listMedia();
  const anchor = section.template === "hero" ? undefined : section.anchor;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/home" className="a-link text-[0.875rem]">← Seções</Link>
        <h1 className="a-h1 mt-2">{section.title?.replace(/\n/g, " ") ?? section.anchor}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span className="a-badge">{section.template}</span>
          {section.id.startsWith("custom-") && <span className="a-badge ok">Criada aqui</span>}
          {section.active ? <span className="a-badge ok">Ativa</span> : <span className="a-badge">Oculta</span>}
          {status && (status.problem ? <span className="a-badge bad">{status.label}: {status.problem}</span> : <span className="a-badge">{status.label} · {status.products} produto(s)</span>)}
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,34rem)_1fr]">
        <section className="a-card p-5" aria-label="Editor da seção">
          <SectionEditorForm section={section} rev={ws.record?.rev ?? null} media={media} collections={entries} action={saveSection} />
        </section>
        <section className="a-card p-5 2xl:sticky 2xl:top-4 2xl:self-start" aria-label="Pré-visualização">
          <PreviewFrame version={ws.record?.rev ?? 0} anchor={anchor} height={760} />
        </section>
      </div>
    </div>
  );
}
