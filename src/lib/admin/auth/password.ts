import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { UserRepository, UserRow } from "../store/ports";

/**
 * The fallback login: e-mail + password, for when Login with Railway is down or misconfigured. It changes nothing about WHO may enter (the
 * `admin_user` allowlist, `active`, roles and scopes are the same), only how a person proves it:
 *   - every person sets their own password inside the panel (signed in with Railway first); the owner may clear someone's, never see or set it;
 *   - the owner can also be let in by ADMIN_OWNER_PASSWORD_HASH (environment), so the fallback works even if no password was ever set;
 *   - hashes are scrypt (`scrypt:<salt>:<hash>`, the same format as the print studio), compared in constant time, and an unknown e-mail
 *     still costs one scrypt, so the response time does not tell which e-mails exist.
 */
const derive = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
export const PASSWORD_HASH_RE = /^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX_BYTES = 1024;
const DUMMY_HASH = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

/** Why a new password is not acceptable, or null. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use uma senha com pelo menos ${PASSWORD_MIN} caracteres.`;
  if (Buffer.byteLength(password) > PASSWORD_MAX_BYTES) return "Senha longa demais.";
  if (password.trim().length === 0) return "A senha não pode ser só espaços.";
  return null;
}

export async function hashAdminPassword(password: string): Promise<string> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await derive(password, salt, 64)).toString("hex")}`;
}

/** Always runs one scrypt, even for a missing or malformed hash (then it can only answer false). */
export async function verifyAdminPassword(password: string, hash: string | null): Promise<boolean> {
  const match = PASSWORD_HASH_RE.exec(hash ?? "") ?? PASSWORD_HASH_RE.exec(DUMMY_HASH)!;
  if (Buffer.byteLength(password) > PASSWORD_MAX_BYTES) return false;
  const digest = await derive(password, match[1], 64);
  const ok = timingSafeEqual(digest, Buffer.from(match[2], "hex"));
  return ok && hash !== null && PASSWORD_HASH_RE.test(hash);
}

export type PasswordLoginDecision = { ok: true; user: UserRow } | { ok: false; reason: "invalid" | "inactive" };

/**
 * Who may enter with a password. Same allowlist as the Railway login: an unknown e-mail is refused (no sign-up), except the configured
 * owner with the environment hash, who is created as owner exactly like the Railway bootstrap. The owner is never locked out by a row edit.
 */
export async function authorizePasswordLogin(
  input: { email: string; password: string },
  users: UserRepository,
  owner: { email: string; passwordHash: string | null },
): Promise<PasswordLoginDecision> {
  const email = input.email.trim().toLowerCase();
  const isOwner = email.length > 0 && email === owner.email.trim().toLowerCase();
  let user = email ? await users.findByEmail(email) : null;
  const stored = user ? await users.getPasswordHash(user.id) : null;
  const byRow = await verifyAdminPassword(input.password, stored);
  const byEnv = isOwner && owner.passwordHash !== null && !byRow ? await verifyAdminPassword(input.password, owner.passwordHash) : false;
  if (!byRow && !byEnv) return { ok: false, reason: "invalid" };

  if (!user) user = await users.create({ email, name: null, role: "owner", scopes: [] }); // only reachable through the owner's env hash
  if (isOwner && (user.role !== "owner" || !user.active)) user = (await users.update(user.id, { role: "owner", active: true })) ?? user;
  if (!user.active) return { ok: false, reason: "inactive" };
  await users.touchLogin(user.id);
  return { ok: true, user };
}
