import { NextResponse, type NextRequest } from "next/server";
import { adminSurface, SESSION_COOKIE, SESSION_COOKIE_PATH, SESSION_TTL_MS } from "@/lib/admin/auth/guard";
import { safeNext } from "@/lib/admin/auth/oidc";
import { authorizePasswordLogin } from "@/lib/admin/auth/password";
import { allow, clientKey } from "@/lib/admin/auth/rate-limit";
import { platform } from "@/lib/admin/platform";

export const dynamic = "force-dynamic";

/**
 * The fallback login (e-mail + password), posted by the form on the login page. Nothing here talks to Railway, so it works while the
 * provider is down. Production admin host only; a cross-site post is a 404 (the login form has no session in front of it); every credential
 * failure gets the same answer, and attempts are limited per address and per e-mail.
 */
export async function POST(request: NextRequest) {
  const config = await adminSurface();
  if (!config || config.mode !== "prod") return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== config.adminOrigin) return new Response(null, { status: 404 });

  const fd = await request.formData().catch(() => null);
  const field = (name: string) => (typeof fd?.get(name) === "string" ? (fd!.get(name) as string) : "");
  const next = safeNext(field("next"));
  const email = field("email").trim().toLowerCase().slice(0, 254);
  const password = field("password");
  const fail = (code: string) => {
    const q = new URLSearchParams({ erro: code, modo: "senha" });
    if (next !== "/admin") q.set("next", next);
    const r = NextResponse.redirect(new URL(`/admin/login?${q}`, config.adminOrigin), 303);
    r.headers.set("Cache-Control", "no-store");
    return r;
  };
  if (!allow(`password:${clientKey(request.headers)}`, 10, 10 * 60_000) || (email && !allow(`password-email:${email}`, 5, 15 * 60_000))) return fail("limite");
  if (!email || !password) return fail("senha");

  const { users, sessions, audit } = platform();
  if (!users || !sessions) return fail("indisponivel");
  const decision = await authorizePasswordLogin({ email, password }, users, { email: config.ownerEmail, passwordHash: config.ownerPasswordHash }).catch(() => null);
  if (!decision) return fail("indisponivel");
  if (!decision.ok) {
    await audit.record({ actor: "anonymous", action: "access.denied", target: "login", meta: { method: "password", reason: decision.reason } }).catch(() => undefined);
    return fail("senha");
  }
  const token = await sessions.create(decision.user.id, SESSION_TTL_MS);
  await audit.record({ actor: decision.user.id, action: "login", meta: { method: "password" } }).catch(() => undefined);
  const response = NextResponse.redirect(new URL(next, config.adminOrigin), 303);
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: SESSION_COOKIE_PATH, maxAge: Math.floor(SESSION_TTL_MS / 1000) });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
