import type { Scope } from "../../site-config/schema";
import type { IdClaims } from "./oidc";
import type { UserRepository, UserRow } from "../store/ports";

/**
 * Who may sign in. The allowlist is the `admin_user` table; Login with Railway only proves WHO the person is (an immutable account id,
 * `sub`, and, when the provider says so, a verified e-mail). It grants nothing by itself: an unknown, inactive or unverified account is
 * refused, and no editor is ever created just because someone could sign in with Railway.
 *
 * Identity rules, in order:
 *   1. A user already bound to this `sub` is that user (the e-mail may have changed on the provider side; the account id has not).
 *   2. Otherwise the e-mail must be PRESENT and VERIFIED (never trusted otherwise) and match an allowlisted, active user; the account id
 *      is then bound to that user for good. A different account that later arrives with the same e-mail is refused.
 *   3. Owner bootstrap has two routes, both rooted in the environment, never in a hard-coded address: the verified e-mail equal to
 *      ADMIN_OWNER_EMAIL, or (when the provider's e-mail cannot be trusted) the account id equal to ADMIN_OWNER_RAILWAY_SUB, which is
 *      shown to the person on the refusal screen so the owner can put it in the environment.
 */
export type LoginDecision = { ok: true; user: UserRow } | { ok: false; reason: "no-email" | "unverified-email" | "not-allowed" | "inactive" | "account-mismatch" };

export async function authorizeLogin(claims: IdClaims, users: UserRepository, owner: { email: string; sub: string | null }): Promise<LoginDecision> {
  const ownerEmail = owner.email.trim().toLowerCase();
  const isOwnerBySub = owner.sub !== null && claims.sub === owner.sub;
  const isOwnerByEmail = claims.emailVerified && claims.email === ownerEmail;

  let user = await users.findByProviderSub(claims.sub);
  if (!user) {
    if (!isOwnerBySub) {
      if (!claims.email) return { ok: false, reason: "no-email" };
      if (!claims.emailVerified) return { ok: false, reason: "unverified-email" };
    }
    user = claims.email ? await users.findByEmail(claims.email) : null;
    if (!user) {
      if (!(isOwnerBySub || isOwnerByEmail) || !claims.email) return { ok: false, reason: "not-allowed" };
      user = await users.create({ email: claims.email, name: claims.name, role: "owner", scopes: [] });
    }
  }
  if ((isOwnerBySub || isOwnerByEmail) && (user.role !== "owner" || !user.active)) {
    // The configured owner can never be locked out by a row edit (the environment is the root of trust).
    user = (await users.update(user.id, { role: "owner", active: true })) ?? user;
  }
  if (!user.active) return { ok: false, reason: "inactive" };
  if (!(await users.bindProviderSub(user.id, claims.sub))) return { ok: false, reason: "account-mismatch" };
  await users.touchLogin(user.id);
  return { ok: true, user };
}

export const ALL_SCOPES: readonly Scope[] = ["sul", "norte", "centro-oeste"];
