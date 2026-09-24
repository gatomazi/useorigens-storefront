import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Scope } from "../../site-config/schema";
import { adminConfig, isAdminHost, type AdminConfig } from "../config";
import { checkDevAdminRequest } from "../dev-guard";
import { platform } from "../platform";
import { canEdit, type Actor } from "../store/ports";

/**
 * The Data Access Layer of the admin: every page, layout, Server Action and route handler calls one of these first. The proxy is only the
 * first (host/path) layer; nothing here trusts a header as identity.
 *
 *   requireAdminSurface()  the admin exists for this request at all (right process, right host); anything else is a plain 404.
 *   requireAdmin(options)  + a valid session (prod) — no session: redirect to the login page; not allowed: back to the panel with a notice.
 *
 * Development (`ADMIN_DEV_MODE`, loopback only) has no login: the developer is the owner of a local sandbox.
 */
export const SESSION_COOKIE = "__Host-uo_admin";
export const LOGIN_COOKIE = "__Host-uo_oidc";
export const SESSION_TTL_MS = 12 * 60 * 60_000;
export const SESSION_IDLE_MS = 2 * 60 * 60_000;

export const DEV_ACTOR: Actor = { id: "dev-local", email: "dev@localhost", name: "Desenvolvimento local", role: "owner", scopes: [] };

/** True when this request may see the admin at all; also returns the configuration it runs under. */
export async function adminSurface(): Promise<Exclude<AdminConfig, { mode: "off" }> | null> {
  const config = adminConfig();
  if (config.mode === "off") return null;
  const h = await headers();
  if (config.mode === "dev") return checkDevAdminRequest(h).ok ? config : null;
  return isAdminHost(h.get("host"), config.adminHost) ? config : null;
}

export async function requireAdminSurface(): Promise<Exclude<AdminConfig, { mode: "off" }>> {
  const config = await adminSurface();
  if (!config) notFound();
  return config;
}

export type RequireOptions = {
  /** The region this call reads or changes; an editor without it is refused. */
  scope?: Scope;
  /** Owner-only operations (people, syncs). */
  owner?: boolean;
  /** A state-changing call (Server Action): in production the Origin must be the admin origin. */
  mutation?: boolean;
};

export async function currentActor(config: Exclude<AdminConfig, { mode: "off" }>): Promise<Actor | null> {
  if (config.mode === "dev") return DEV_ACTOR;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const sessions = platform().sessions;
  if (!token || !sessions) return null;
  const info = await sessions.lookup(token, SESSION_IDLE_MS);
  return info ? { id: info.user.id, email: info.user.email, name: info.user.name, role: info.user.role, scopes: info.user.scopes } : null;
}

export async function requireAdmin(options: RequireOptions = {}): Promise<Actor> {
  const config = await requireAdminSurface();
  if (config.mode === "prod" && options.mutation) {
    const origin = (await headers()).get("origin");
    if (origin !== config.adminOrigin) notFound(); // a cross-site form post never reaches an action
  }
  const actor = await currentActor(config);
  if (!actor) redirect("/admin/login");
  const allowed = (!options.owner || actor.role === "owner") && (!options.scope || canEdit(actor, options.scope));
  if (!allowed) {
    await platform().audit.record({ actor: actor.id, action: "access.denied", scope: options.scope ?? null, target: options.owner ? "owner-only" : null }).catch(() => undefined);
    redirect(`/admin?err=${encodeURIComponent("Você não tem permissão para isso.")}`);
  }
  return actor;
}
