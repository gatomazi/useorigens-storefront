import { NextResponse, type NextRequest } from "next/server";
import { adminSurface, currentActor } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { authorizeParams } from "@/lib/mcp/auth/authorize-params";
import { checkAuthorizeRequest, errorRedirect, issueCode, withWriteChoice } from "@/lib/mcp/auth/oauth";
import { mcpResourceFromHeaders, oauthStore } from "@/lib/mcp/auth/resource";

export const dynamic = "force-dynamic";

const page = (status: number, text: string) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * The owner's answer on the consent page. Same rules as an admin Server Action: production requires `Origin` = the admin origin (a
 * cross-site form never gets here; the session cookie is also SameSite=Lax), a live session, and the owner role. The authorization request
 * is validated again from the posted fields, so nothing shown on the page is trusted. Approve → a single-use code; deny → access_denied.
 */
export async function POST(request: NextRequest) {
  const config = await adminSurface();
  const where = mcpResourceFromHeaders(request.headers);
  if (!config || !where) return new Response(null, { status: 404 });
  if (config.mode === "prod" && request.headers.get("origin") !== config.adminOrigin) return new Response(null, { status: 404 });
  const actor = await currentActor(config);
  if (!actor) return NextResponse.redirect(new URL("/admin/login", where.origin), 303);
  if (actor.role !== "owner") return page(403, "Só o dono da loja pode conectar o Claude.");

  const form = await request.formData();
  const store = oauthStore();
  const check = await checkAuthorizeRequest(store, authorizeParams(form), where);
  if (!check.ok && check.kind === "page") return page(400, check.message);
  if (!check.ok) return NextResponse.redirect(check.url, 303);

  const req = { ...check.request, scope: withWriteChoice(check.request.scope, form.get("allow_write") === "yes") };
  if (form.get("decision") !== "approve") return NextResponse.redirect(errorRedirect(req.redirectUri, "access_denied", "the owner denied the request", req.state, where.issuer), 303);
  const url = await issueCode(store, req, actor.id, { issuer: where.issuer, now: Date.now() });
  await platform()
    .audit.record({ actor: actor.id, action: "mcp.authorize", target: req.client.clientId, meta: { client: req.client.clientName, redirectHost: new URL(req.redirectUri).host, scope: req.scope } })
    .catch(() => undefined);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
