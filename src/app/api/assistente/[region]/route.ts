import { NextResponse } from "next/server";
import { MAX_ASSISTANT_MESSAGE } from "@/lib/assistant/engine";
import { assistantEnabled } from "@/lib/assistant/flag";
import { assistantBoot, assistantReply, publishedAssistant } from "@/lib/assistant/sources";
import { isRegionSlug, type RegionSlug } from "@/lib/geo/regions";
import { allow, clientKey } from "@/lib/rate-limit";
import { isRegionLaunched } from "@/lib/regions/launched";

// One answer per message: never prerendered. Reads only local files (published config, search index, catalog snapshots); no INK, no database.
export const dynamic = "force-dynamic";

const MAX_BODY = 2048;
const NO_STORE = { "Cache-Control": "no-store" };
// The Worker answers for every INK visitor from a few Cloudflare addresses: it sends the visitor's key (a short hash, never the IP itself).
const VISITOR = /^[a-f0-9]{16,64}$/;

function liveRegion(region: string): RegionSlug | null {
  return isRegionSlug(region) && isRegionLaunched(region) ? region : null;
}

/**
 * `GET /api/assistente/<region>` — what the chat needs to open (`v: 1`): `enabled`, the opening message (the store's line and its first questions)
 * and whether there is a WhatsApp. Off (the panel's switch, `ASSISTANT=off`, or nothing published) = `enabled: false`, and every surface keeps its
 * native help (on the INK pages, the "Ajuda?" button and the WhatsApp link stay as INK draws them). Short CDN cache, like the top strip.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string }> }) {
  const region = liveRegion((await params).region);
  if (!region) return new NextResponse(null, { status: 404 });
  const boot = assistantEnabled() ? assistantBoot(region) : { v: 1 as const, region, enabled: false };
  return NextResponse.json(boot, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=60" } });
}

/**
 * `POST /api/assistente/<region>` `{ "message": "tem de Floripa?" }` — the answer (`AssistantReply`, `v: 1`, see lib/assistant/engine.ts). The text the
 * person typed is never stored, logged or cached (`no-store`), and a CPF or card number is refused without being echoed. Limited per visitor.
 */
export async function POST(request: Request, { params }: { params: Promise<{ region: string }> }) {
  const region = liveRegion((await params).region);
  if (!region) return new NextResponse(null, { status: 404 });
  const config = publishedAssistant(region);
  if (!assistantEnabled() || !config?.enabled) return NextResponse.json({ v: 1, error: "off" }, { status: 404, headers: NO_STORE });

  const visitor = request.headers.get("x-origens-visitor");
  const key = visitor && VISITOR.test(visitor) ? `v:${visitor}` : `ip:${clientKey(request.headers)}`;
  if (!allow(`assistant:${key}`, 20, 60_000) || !allow(`assistant-day:${key}`, 300, 86_400_000) || !allow("assistant:all", 1_200, 60_000)) {
    return NextResponse.json({ v: 1, error: "slow down" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } });
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return NextResponse.json({ v: 1, error: "json only" }, { status: 415, headers: NO_STORE });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ v: 1, error: "too long" }, { status: 413, headers: NO_STORE });
  let message: unknown;
  try {
    message = (JSON.parse(raw) as { message?: unknown }).message;
  } catch {
    message = undefined;
  }
  if (typeof message !== "string" || message.length > MAX_ASSISTANT_MESSAGE) return NextResponse.json({ v: 1, error: "invalid message" }, { status: 400, headers: NO_STORE });
  const reply = assistantReply(region, config, message);
  return reply ? NextResponse.json(reply, { headers: NO_STORE }) : NextResponse.json({ v: 1, error: "off" }, { status: 404, headers: NO_STORE });
}
