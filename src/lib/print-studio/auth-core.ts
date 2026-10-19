import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export const STUDIO_SESSION_SECONDS = 12 * 60 * 60;
export type StudioCredentials = { username: string; passwordHash: string; secret: string; origin: string };
const HASH = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/;
const equal = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export async function hashStudioPassword(password: string): Promise<string> {
  if (password.length < 8 || Buffer.byteLength(password) > 1024) throw new Error("Use uma senha com pelo menos 8 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await derive(password, salt, 64) as Buffer).toString("hex")}`;
}

export function studioCredentials(env: Record<string, string | undefined> = process.env): StudioCredentials | null {
  const username = env.PRINT_STUDIO_USERNAME?.trim();
  const passwordHash = env.PRINT_STUDIO_PASSWORD_HASH;
  const secret = env.PRINT_STUDIO_SESSION_SECRET;
  const origin = env.PRINT_STUDIO_ORIGIN;
  if (!username || username.length > 100 || !HASH.test(passwordHash ?? "") || !secret || secret.length < 32 || !origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return null;
  } catch { return null; }
  return { username, passwordHash: passwordHash!, secret, origin };
}

export async function verifyStudioLogin(username: string, password: string, config: StudioCredentials): Promise<boolean> {
  const match = HASH.exec(config.passwordHash);
  if (!match || Buffer.byteLength(password) > 1024 || username.length > 100) return false;
  const digest = (await derive(password, match[1], 64) as Buffer).toString("hex");
  return equal(digest, match[2]) && equal(username.trim(), config.username);
}

function credentialVersion(config: StudioCredentials) { return createHash("sha256").update(`${config.username}:${config.passwordHash}`).digest("hex"); }
function sign(body: string, secret: string) { return createHmac("sha256", secret).update(`origens-print-studio:${body}`).digest("base64url"); }
export function createStudioSession(config: StudioCredentials, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ purpose: "print-studio", username: config.username, credentials: credentialVersion(config), expires: now + STUDIO_SESSION_SECONDS * 1000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  return `${body}.${sign(body, config.secret)}`;
}

export function verifyStudioSession(token: string | undefined, config: StudioCredentials, now = Date.now()): boolean {
  if (!token || token.length > 2000) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !equal(parts[1], sign(parts[0], config.secret))) return false;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    return data.purpose === "print-studio" && data.username === config.username && data.credentials === credentialVersion(config) && typeof data.expires === "number" && data.expires > now && data.expires <= now + STUDIO_SESSION_SECONDS * 1000;
  } catch { return false; }
}

export const studioCookieName = (config: StudioCredentials) => config.origin.startsWith("https:") ? "__Secure-uo_print_studio" : "uo_print_studio_local";
export const studioCookieOptions = (config: StudioCredentials) => ({ httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "strict" as const, path: "/estampas", maxAge: STUDIO_SESSION_SECONDS });
