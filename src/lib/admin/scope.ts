import "server-only";
import { cookies } from "next/headers";
import { REGIONS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import type { Scope } from "../site-config/schema";
import { canEdit, type Actor } from "./store/ports";

/**
 * Which region the person is working on. The three regional homes are edited with the same screens; the choice lives in a small cookie
 * (`Path=/admin`, never sent to the public site) that the switcher sets, and EVERY form also carries the scope it was rendered for
 * (`<input name="scope">`), which the Server Action validates against the person's permissions. Two tabs on two regions therefore cannot
 * write into each other: an action trusts the form, not the cookie, and never a scope the person may not edit.
 */
export const REGION_SCOPES: readonly RegionSlug[] = ["sul", "norte", "centro-oeste"];
export const SCOPE_COOKIE = "uo_admin_scope";

export const isRegionScope = (v: unknown): v is RegionSlug => typeof v === "string" && (REGION_SCOPES as readonly string[]).includes(v);
export const storeOf = (scope: RegionSlug): CommerceStoreKey => REGIONS[scope].storeKey;
export const scopeName = (scope: Scope): string => (scope === "global" ? "Global" : REGIONS[scope].name);

/** Regions this person may edit (owner: all; editor: their scopes). */
export const editableScopes = (actor: Actor): RegionSlug[] => REGION_SCOPES.filter((s) => canEdit(actor, s));

/** The region a page renders: the cookie's, when valid and permitted; otherwise the first region the person may edit (Sul for the owner). */
export async function currentScope(actor: Actor): Promise<RegionSlug> {
  const allowed = editableScopes(actor);
  const fromCookie = (await cookies()).get(SCOPE_COOKIE)?.value;
  return isRegionScope(fromCookie) && allowed.includes(fromCookie) ? fromCookie : (allowed[0] ?? "sul");
}

/** The region a form submission is about: its own `scope` field when valid, else the cookie's. Permission is checked by the caller (`requireAdmin({ scope })`). */
export async function scopeOf(fd: FormData, actor: Actor): Promise<RegionSlug> {
  const v = fd.get("scope");
  return isRegionScope(v) ? v : currentScope(actor);
}
