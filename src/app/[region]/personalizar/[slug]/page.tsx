import type { Metadata } from "next";
import { CustomizerPageView } from "@/components/customization/CustomizerPageView";
import { resolveCustomizer } from "@/lib/pages/public";
import { REGIONS } from "@/lib/geo/regions";
import { customizerHref } from "@/lib/site-config/pages";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ region: string; slug: string }> }): Promise<Metadata> {
  const { region, slug } = await params;
  try {
    const { region: r, model } = resolveCustomizer(region, slug);
    return {
      title: `${model.name} · Personalização · Use Origens ${REGIONS[r].name}`,
      ...(model.description ? { description: model.description } : {}),
      alternates: { canonical: customizerHref(r, model) },
      robots: { index: false, follow: true }, // a request form: not a landing to rank
    };
  } catch {
    return {};
  }
}

export default async function CustomizerPage({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { region, slug } = await params;
  const { region: r, model, bundle } = resolveCustomizer(region, slug);
  return <CustomizerPageView region={r} model={model} bundle={bundle} />;
}
