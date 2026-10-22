// Google Merchant Center data source (scheduled fetch): the INK export with the product cover as image_link, see src/lib/merchant/feed.ts
// and docs/google-merchant-feed.md. Serves the last generated file from the Volume. When it is older than FEED_MAX_AGE_MS, a fresh
// generation (INK's export re-read, so prices and promotions follow INK) starts in the background and this request still gets the last
// good file. Before the first generation it answers 503, never an empty feed (Merchant Center would read that as "every product removed").
//
// Public, like the product pages it describes. When MERCHANT_FEED_TOKEN is set, the URL must carry ?token=<it> (Merchant Center takes
// the full URL), so the file is not handed to whoever guesses the path.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { singleStoreDataDir } from "@/lib/catalog/commerce-mode";
import { FEED_FILE } from "@/lib/merchant/files";
import { regenerateMerchantFeed } from "@/lib/merchant/generate";

export const dynamic = "force-dynamic";

const FEED_MAX_AGE_MS = 4 * 60 * 60 * 1000;

function tokenOk(request: Request): boolean {
  const expected = process.env.MERCHANT_FEED_TOKEN?.trim();
  if (!expected) return true;
  const given = Buffer.from(new URL(request.url).searchParams.get("token") ?? "");
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(request: Request) {
  if (!tokenOk(request)) return new Response("not found", { status: 404 });
  const file = path.join(singleStoreDataDir(), FEED_FILE);
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(file)).mtimeMs;
  } catch {
    void regenerateMerchantFeed();
    return new Response("feed ainda não gerado", { status: 503, headers: { "Retry-After": "600" } });
  }
  if (Date.now() - mtimeMs > FEED_MAX_AGE_MS) void regenerateMerchantFeed();
  return new Response(await readFile(file), {
    headers: {
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Content-Disposition": 'inline; filename="google-merchant.tsv"',
      "Cache-Control": "no-store",
      "Last-Modified": new Date(mtimeMs).toUTCString(),
      "X-Robots-Tag": "noindex",
    },
  });
}
