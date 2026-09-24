import { NextResponse, type NextRequest } from "next/server";
import { adminSurface, LOGIN_COOKIE } from "@/lib/admin/auth/guard";
import { buildAuthUrl, newLoginState, oidcEndpoints, packLoginState, safeNext } from "@/lib/admin/auth/oidc";
import { allow, clientKey } from "@/lib/admin/auth/rate-limit";

export const dynamic = "force-dynamic";

/** Starts the Google sign-in: a fresh state/nonce/PKCE verifier, kept in a signed HttpOnly cookie, then a redirect to Google. Production admin host only. */
export async function GET(request: NextRequest) {
  const config = await adminSurface();
  if (!config || config.mode !== "prod") return new Response(null, { status: 404 });
  if (!allow(`start:${clientKey(request.headers)}`, 20, 10 * 60_000)) return new Response("Muitas tentativas. Aguarde alguns minutos.", { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "600" } });

  const login = newLoginState(safeNext(request.nextUrl.searchParams.get("next")));
  const url = buildAuthUrl({ endpoints: oidcEndpoints(config.oidcIssuer), clientId: config.googleClientId, redirectUri: `${config.adminOrigin}/admin/auth/callback`, login });
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(LOGIN_COOKIE, packLoginState(login, config.sessionSecret), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
