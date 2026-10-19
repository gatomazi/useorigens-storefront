import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { studioCookieName, studioCredentials, verifyStudioSession, type StudioCredentials } from "./auth-core";

/** This identity is deliberately independent of Railway OIDC and every /admin permission. */
export async function studioSurface(): Promise<StudioCredentials | null> {
  const config = studioCredentials();
  if (!config || (await headers()).get("host")?.toLowerCase() !== new URL(config.origin).host) return null;
  return config;
}
export async function studioSignedIn(config: StudioCredentials): Promise<boolean> {
  return verifyStudioSession((await cookies()).get(studioCookieName(config))?.value, config);
}
export async function requireStudio() {
  const config = await studioSurface();
  if (!config) notFound();
  if (!(await studioSignedIn(config))) redirect("/estampas/login");
  return { username: config.username };
}
export async function studioApiAccess(request: Request, mutation = false): Promise<{ username: string } | Response> {
  const config = await studioSurface();
  const headers = { "Cache-Control": "private, no-store" };
  if (!config || !(await studioSignedIn(config))) return Response.json({ error: "Sua sessão expirou. Entre novamente no editor." }, { status: 401, headers });
  if (mutation && request.headers.get("origin") !== config.origin) return Response.json({ error: "Origem do envio inválida." }, { status: 403, headers });
  return { username: config.username };
}
