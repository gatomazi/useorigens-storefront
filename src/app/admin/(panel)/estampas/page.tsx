import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { PrintStudio } from "@/components/print-studio/PrintStudio";
import { availableStudioFonts } from "@/lib/print-studio/font-server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { platform } from "@/lib/admin/platform";
import { canEdit } from "@/lib/admin/store/ports";
import { loadRequestArtwork } from "@/lib/customization/artwork-server";
import { shortRef } from "@/lib/customization/requests";

export const metadata: Metadata = { title: "Estúdio de estampas", robots: { index: false, follow: false } };

export default async function PrintStudioPage({ searchParams }: { searchParams: Promise<{ solicitacao?: string; arte?: string }> }) {
  const actor = await requireAdmin();
  const { solicitacao, arte } = await searchParams;
  const record = solicitacao ? await platform().requests.get(solicitacao) : null;
  if (solicitacao && (!record || !canEdit(actor, record.region))) notFound();
  // ?arte=2: another art of a family order (the first one is `artwork`, the others `moreArtwork`).
  const index = Math.max(0, (Number.parseInt(arte ?? "1", 10) || 1) - 1);
  const project = record ? await loadRequestArtwork(index ? record.values.moreArtwork?.[index - 1] : record.values.artwork).catch(() => null) : null;
  if (record && !project) return <p className="a-flash err">A base desta arte não está disponível. <Link className="a-link" href={`/admin/personalizacao/solicitacoes/${record.id}`}>Voltar à solicitação</Link></p>;
  return <>{record && <p className="a-muted mb-4">Arte da solicitação {shortRef(record.id)}. Salvar cria uma nova estampa e preserva a arte enviada pelo cliente. <Link className="a-link" href={`/admin/personalizacao/solicitacoes/${record.id}`}>Voltar à solicitação</Link></p>}<PrintStudio key={record ? `${record.id}-${index}` : "studio"} owner={actor.role === "owner"} initialProject={project ?? undefined} draftKey={record ? `request-${record.id}${index ? `-${index + 1}` : ""}` : "draft"} availableFonts={await availableStudioFonts()} /></>;
}
