import { NextResponse } from "next/server";
import { publishedAssistant } from "@/lib/assistant/sources";
import { isBearerAuthorized } from "@/lib/config/bearer";
import { isRegionSlug } from "@/lib/geo/regions";
import { liveAnswers } from "@/lib/site-config/assistant-schema";

// Read per request (the published config changes when the panel publishes).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `GET /api/assistente/<region>/base` — the region's published "Assistente" answers as a whole, for the Instagram DM bot (repository
 * instagram-webhook-go), so what the team writes in Painel → Assistente also answers DMs. Only the webhook calls it: `Authorization: Bearer` with
 * INSTAGRAM_HISTORY_SECRET, the secret the two services already share for the conversation history. Without it (or unset): 404.
 * Only enabled answers, in the panel's order; the chat's switch does not matter here (the bot has its own).
 */
export async function GET(request: Request, { params }: { params: Promise<{ region: string }> }) {
  const secret = process.env.INSTAGRAM_HISTORY_SECRET?.trim();
  const region = (await params).region;
  if (!secret || !isBearerAuthorized(request, secret) || !isRegionSlug(region)) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const config = publishedAssistant(region);
  return NextResponse.json(
    {
      v: 1,
      region,
      whatsapp: config?.whatsapp ?? null,
      answers: liveAnswers(config).map((a) => ({ question: a.question, answer: a.answer })),
    },
    { headers: NO_STORE },
  );
}
