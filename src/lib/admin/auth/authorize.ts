import type { Scope } from "../../site-config/schema";
import type { IdClaims } from "./oidc";
import type { UserRepository, UserRow } from "../store/ports";

/**
 * Who may sign in. The allowlist is the `admin_user` table; the only way a row appears without an owner adding it is the bootstrap: the
 * first sign-in of the e-mail configured in ADMIN_OWNER_EMAIL creates the owner. There is no public sign-up: an unknown, inactive or
 * unverified account is refused, and a Google account is bound to a user on first login (`google_sub`), so a different account that later
 * ends up with the same e-mail address cannot take the seat over.
 */
export type LoginDecision = { ok: true; user: UserRow } | { ok: false; reason: "unverified-email" | "not-allowed" | "inactive" | "account-mismatch" };

export async function authorizeLogin(claims: IdClaims, users: UserRepository, ownerEmail: string): Promise<LoginDecision> {
  if (!claims.emailVerified) return { ok: false, reason: "unverified-email" };
  let user = await users.findByEmail(claims.email);
  const isOwnerEmail = claims.email === ownerEmail.trim().toLowerCase();
  if (!user) {
    if (!isOwnerEmail) return { ok: false, reason: "not-allowed" };
    user = await users.create({ email: claims.email, name: claims.name, role: "owner", scopes: [] });
  } else if (isOwnerEmail && (user.role !== "owner" || !user.active)) {
    // The configured owner can never be locked out by a row edit (the environment is the root of trust).
    user = (await users.update(user.id, { role: "owner", active: true })) ?? user;
  }
  if (!user.active) return { ok: false, reason: "inactive" };
  if (!(await users.bindGoogleSub(user.id, claims.sub))) return { ok: false, reason: "account-mismatch" };
  await users.touchLogin(user.id);
  return { ok: true, user };
}

export const ALL_SCOPES: readonly Scope[] = ["sul", "norte", "centro-oeste"];
