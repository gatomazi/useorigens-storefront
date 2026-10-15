import { NextResponse } from "next/server";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { publicInkTheme } from "@/lib/site-config/ink-theme-public";

/**
 * Public, read-only, cacheable: the published "Tema da INK" of a region (`v: 1`, see site-config/ink-theme.ts), for the Worker that themes the INK
 * product page, cart and checkout (it calls this server-side, so no CORS is configured here). Only presets turned into `#rrggbb` tokens and on/off
 * switches: no cookies, no identity, nothing administrative. Short cache: a publish reaches the INK in about a minute.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return new NextResponse(null, { status: 404 });
  return NextResponse.json(publicInkTheme(region), { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=60" } });
}
