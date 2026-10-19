import { NextResponse } from "next/server";
import { studioSurface } from "@/lib/print-studio/auth";
import { studioCookieName, studioCookieOptions } from "@/lib/print-studio/auth-core";

export async function POST(request: Request) {
  const config = await studioSurface();
  if (!config) return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== config.origin) return new Response(null, { status: 403 });
  const response = NextResponse.redirect(new URL("/estampas/login", config.origin), { status: 303, headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(studioCookieName(config), "", { ...studioCookieOptions(config), maxAge: 0 });
  return response;
}
