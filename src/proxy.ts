// Bootstrap gate (bootstrap review §2): while the catalog snapshot is missing or only partially synced, a
// storefront page would otherwise render "successfully" with zero products — indistinguishable from a
// legitimately empty result. This intercepts real page requests in that state and serves an explicit,
// noindex, 503 maintenance response instead — never a page that looks like a normal (if empty) catalog.
//
// Staging noindex (staging gate §3): a temporary Railway URL must stay out of indexing EVEN AFTER the catalog
// is ready — the 503/noindex above only covers the not-ready window. Once ready, every response still gets
// `X-Robots-Tag: noindex` unless the request's Host matches the canonical `NEXT_PUBLIC_SITE_URL` — so the
// real production domain is unaffected (no header at all there), and a temporary *.up.railway.app address (or
// any other non-canonical host) stays noindexed regardless of readiness, with no separate flag to remember to
// flip. `NEXT_PUBLIC_SITE_URL` must be set to the real intended production domain for this to work — see
// docs/deploy/railway.md.
//
// Named `proxy.ts`, not `middleware.ts`: this Next.js version (16) renamed the convention and made the
// Node.js runtime the default (see node_modules/next/dist/docs/.../proxy.md) — this file relies on that,
// since `catalogReadiness` does a real (cheap) filesystem stat.
//
// Never blocks health or sync: /api/health, /api/ready and /api/admin/catalog-sync are excluded by the
// matcher below, same as static assets — an operator must always be able to check status or trigger a sync
// regardless of readiness.
import { NextResponse, type NextRequest } from "next/server";
import { catalogReadiness } from "@/lib/catalog/readiness";
import { siteUrl } from "@/lib/config/env";
import { ENABLED_REGIONS } from "@/lib/site";

function isCanonicalHost(request: NextRequest): boolean {
  try {
    return request.nextUrl.hostname === new URL(siteUrl()).hostname;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { ready } = catalogReadiness(ENABLED_REGIONS);

  if (!ready) {
    return new Response(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
        `<title>Use Origens — Preparando o catálogo</title>` +
        `<meta name="viewport" content="width=device-width, initial-scale=1"></head>` +
        `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;line-height:1.5">` +
        `<h1>Só um instante.</h1>` +
        `<p>Estamos preparando o catálogo desta loja. Volte em alguns minutos.</p>` +
        `</body></html>`,
      {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex",
          "Cache-Control": "no-store",
          "Retry-After": "60",
        },
      },
    );
  }

  const response = NextResponse.next();
  if (!isCanonicalHost(request)) response.headers.set("X-Robots-Tag", "noindex");
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
