import { NextResponse, type NextRequest } from "next/server";
import { authorizeLogin } from "@/lib/admin/auth/authorize";
import { adminSurface, LOGIN_COOKIE, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/admin/auth/guard";
import { constantTimeEqual, discoverEndpoints, exchangeCode, fetchJwks, fetchUserinfo, issuersFor, unpackLoginState, verifyIdToken, OidcError, type IdClaims } from "@/lib/admin/auth/oidc";
import { allow, clientKey } from "@/lib/admin/auth/rate-limit";
import { platform } from "@/lib/admin/platform";

export const dynamic = "force-dynamic";

/** The Railway redirect target. Everything is verified server-side; the browser contributes only the `code` and the echoed `state`. */
export async function GET(request: NextRequest) {
  const config = await adminSurface();
  if (!config || config.mode !== "prod") return new Response(null, { status: 404 });
  const to = (path: string) => NextResponse.redirect(new URL(path, config.adminOrigin), 303);
  const fail = (code: string, ref?: string) => {
    const r = to(`/admin/login?erro=${code}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`);
    r.cookies.set(LOGIN_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    r.headers.set("Cache-Control", "no-store");
    return r;
  };
  if (!allow(`callback:${clientKey(request.headers)}`, 20, 10 * 60_000)) return fail("limite");

  const params = request.nextUrl.searchParams;
  const login = unpackLoginState(request.cookies.get(LOGIN_COOKIE)?.value, config.sessionSecret);
  const state = params.get("state");
  const code = params.get("code");
  if (!login || !state || !constantTimeEqual(state, login.state)) return fail("sessao");
  if (params.get("error") || !code) return fail("negado");

  const { users, sessions, audit } = platform();
  if (!users || !sessions) return fail("indisponivel");
  let claims: IdClaims;
  try {
    const endpoints = await discoverEndpoints(config.oidcIssuer);
    const tokens = await exchangeCode({ endpoints, clientId: config.oauthClientId, clientSecret: config.oauthClientSecret, redirectUri: `${config.adminOrigin}/admin/auth/callback`, code, verifier: login.verifier });
    const verify = (keys: Awaited<ReturnType<typeof fetchJwks>>) => verifyIdToken({ idToken: tokens.idToken, keys, issuers: issuersFor(config.oidcIssuer), clientId: config.oauthClientId, nonce: login.nonce });
    try {
      claims = verify(await fetchJwks(endpoints.jwks));
    } catch (error) {
      if (!(error instanceof OidcError) || error.message !== "unknown signing key") throw error;
      claims = verify(await fetchJwks(endpoints.jwks, fetch, Date.now(), true)); // the provider rotated its keys: one refresh
    }
    if (!claims.email && tokens.accessToken) {
      // The ID token carried no e-mail: ask the userinfo endpoint (server to server), accepting it only for the SAME account.
      const info = await fetchUserinfo(endpoints, tokens.accessToken);
      if (info.sub === claims.sub) claims = { ...claims, email: info.email, emailVerified: info.emailVerified, name: claims.name ?? info.name };
    }
  } catch {
    return fail("negado");
  }

  const decision = await authorizeLogin(claims, users, { email: config.ownerEmail, sub: config.ownerSub }).catch(() => null);
  if (!decision) return fail("indisponivel");
  if (!decision.ok) {
    await audit.record({ actor: "anonymous", action: "access.denied", target: "login", meta: { reason: decision.reason } }).catch(() => undefined);
    // The account id is the person's own identifier; showing it lets the owner bind it (ADMIN_OWNER_RAILWAY_SUB) or an editor be checked.
    return fail("acesso", claims.sub);
  }
  const token = await sessions.create(decision.user.id, SESSION_TTL_MS);
  await audit.record({ actor: decision.user.id, action: "login" }).catch(() => undefined);
  const response = to(login.next);
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: Math.floor(SESSION_TTL_MS / 1000) });
  response.cookies.set(LOGIN_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
