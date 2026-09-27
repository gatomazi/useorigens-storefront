import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { maskedChannels } from "@/lib/customization/contact";
import { hashToken, PUBLIC_STATUS_LABEL, shortRef, TOKEN_SHAPE } from "@/lib/customization/requests";
import { requestStoreOrNull } from "@/lib/customization/server";
import { summaryOf } from "@/lib/customization/validate";
import { allow } from "@/lib/admin/auth/rate-limit";
import { headers } from "next/headers";
import { isRegionSlug } from "@/lib/geo/regions";
import { siteConfigHomeEnabled } from "@/lib/site-config/flag";

// The reference page is private to whoever holds the reference: computed per request, never cached, never indexed, and no referrer is sent from it.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha solicitação de personalização", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function RequestPage({ params }: { params: Promise<{ region: string; token: string }> }) {
  const { region, token } = await params;
  if (!isRegionSlug(region) || !siteConfigHomeEnabled() || !TOKEN_SHAPE.test(token)) notFound();
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`cz-ref:${forwarded}`, 30, 10 * 60_000)) notFound();
  const store = requestStoreOrNull();
  const record = store ? await store.findByTokenHash(hashToken(token)) : null;
  if (!record || record.region !== region) notFound();
  const lines = summaryOf(record.snapshot, record.values);
  const channels = maskedChannels(record.contact ?? {}); // masked: the reference page is a link a person may forward or screenshot
  return (
    <div className="wrap py-10 lg:py-16">
      <h1 className="t-h1">Minha solicitação</h1>
      <p className="t-body mt-2">{record.customizerName} · referência {shortRef(record.id)}</p>
      <p className="mt-4"><span className="inline-block bg-ink px-3 py-1 text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-white" data-testid="public-status">{PUBLIC_STATUS_LABEL[record.status]}</span></p>
      <dl className="mt-6 max-w-xl divide-y divide-line border-y border-line">
        {lines.map((l) => <div key={l.label} className="flex justify-between gap-4 py-2"><dt className="text-ink-mute">{l.label}</dt><dd className="font-bold">{l.value}</dd></div>)}
      </dl>
      <p className="t-small mt-6 max-w-xl border-l-4 border-region-accent pl-3">
        Enviada em {new Date(record.createdAt).toLocaleDateString("pt-BR")}. Esta página mostra só a sua solicitação e o andamento da estampa. <strong>Ela não é uma compra</strong> e não reserva um produto: quando a estampa estiver pronta, nossa equipe fala com você pelo contato informado e orienta a compra.
      </p>
      {channels.length > 0 && <p className="t-small mt-3 max-w-xl text-ink-mute" data-testid="public-channels">Contato informado: {channels.join(" · ")}</p>}
    </div>
  );
}
