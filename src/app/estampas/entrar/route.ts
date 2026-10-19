import { NextResponse } from "next/server";
import { allow, clientKey } from "@/lib/admin/auth/rate-limit";
import { createStudioSession, studioCookieName, studioCookieOptions, verifyStudioLogin } from "@/lib/print-studio/auth-core";
import { studioSurface } from "@/lib/print-studio/auth";

export async function POST(request: Request) {
  const config = await studioSurface();
  const headers = { "Cache-Control": "private, no-store" };
  if (!config) return new Response(null, { status: 404, headers });
  if (request.headers.get("origin") !== config.origin) return new Response(null, { status: 403, headers });
  const back = (reason: string) => NextResponse.redirect(new URL(`/estampas/login?erro=${reason}`, config.origin), { status: 303, headers });
  if (!allow(`studio-login:${clientKey(request.headers)}`, 10, 15 * 60_000) || !allow("studio-login:global", 100, 15 * 60_000)) return back("limite");
  if (Number(request.headers.get("content-length")) > 8192) return back("credenciais");
  // Bound the body independently of Content-Length (chunked requests may omit it).
  const reader = request.body?.getReader();
  if (!reader) return back("credenciais");
  let body = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 8192) { await reader.cancel(); return back("credenciais"); }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  const form = new URLSearchParams(body);
  if (!(await verifyStudioLogin(form.get("username") ?? "", form.get("password") ?? "", config))) return back("credenciais");
  const response = NextResponse.redirect(new URL("/estampas", config.origin), { status: 303, headers });
  response.cookies.set(studioCookieName(config), createStudioSession(config), studioCookieOptions(config));
  return response;
}
