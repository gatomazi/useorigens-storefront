import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { GOOGLE_ISSUER } from "../config";

/**
 * Google OpenID Connect (authorization-code flow with PKCE), implemented directly on the specification with `node:crypto` and `fetch`
 * (no auth framework, no dependency to audit). Everything that decides trust is here and unit-tested:
 *   - `state` and `nonce` are random, bound to the browser by a signed, short-lived cookie, and compared in constant time;
 *   - the ID token's RS256 signature is verified against the provider's published keys (`kid` lookup), then `iss`, `aud`, `exp`,
 *     `iat`, `nonce` and `email_verified` are checked. The e-mail is read ONLY from a verified token, never from the browser.
 * The provider is Google (`https://accounts.google.com`); a loopback issuer exists only so the automated tests can run a fake one.
 */
export type OidcEndpoints = { authorization: string; token: string; jwks: string };

export function oidcEndpoints(issuer: string): OidcEndpoints {
  if (issuer === GOOGLE_ISSUER) return { authorization: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", jwks: "https://www.googleapis.com/oauth2/v3/certs" };
  return { authorization: `${issuer}/authorize`, token: `${issuer}/token`, jwks: `${issuer}/jwks` }; // test provider (loopback only; see config.ts)
}

const b64u = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const fromB64u = (s: string): Buffer => Buffer.from(s, "base64url");

// ── Signed pre-login cookie ──────────────────────────────────────────────────────────────────────────────────

export type LoginState = { state: string; nonce: string; verifier: string; next: string; exp: number };

const sign = (payload: string, secret: string): string => b64u(createHmac("sha256", secret).update(payload).digest());

export function newLoginState(next: string, now: number = Date.now(), ttlMs = 10 * 60_000): LoginState {
  return { state: b64u(randomBytes(24)), nonce: b64u(randomBytes(24)), verifier: b64u(randomBytes(48)), next, exp: now + ttlMs };
}

export const packLoginState = (s: LoginState, secret: string): string => {
  const payload = b64u(JSON.stringify(s));
  return `${payload}.${sign(payload, secret)}`;
};

export function unpackLoginState(cookie: string | undefined, secret: string, now: number = Date.now()): LoginState | null {
  if (!cookie) return null;
  const [payload, mac, extra] = cookie.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(fromB64u(payload).toString("utf8")) as LoginState;
    return typeof s.state === "string" && typeof s.nonce === "string" && typeof s.verifier === "string" && typeof s.next === "string" && typeof s.exp === "number" && s.exp > now ? s : null;
  } catch {
    return null;
  }
}

/** Only same-site admin paths may be a post-login destination (no open redirect). */
export const safeNext = (raw: string | null | undefined): string => (raw && /^\/admin(\/[A-Za-z0-9_\-./]*)?$/.test(raw) && !raw.includes("//") && !raw.includes("..") && !raw.startsWith("/admin/login") && !raw.startsWith("/admin/auth") ? raw : "/admin");

export const constantTimeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const codeChallenge = (verifier: string): string => b64u(createHash("sha256").update(verifier).digest());

export function buildAuthUrl(input: { endpoints: OidcEndpoints; clientId: string; redirectUri: string; login: LoginState }): string {
  const u = new URL(input.endpoints.authorization);
  u.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: input.login.state,
    nonce: input.login.nonce,
    code_challenge: codeChallenge(input.login.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

// ── Token exchange and ID-token verification ────────────────────────────────────────────────────────────────

export type Jwk = { kid?: string; kty: string; alg?: string; n?: string; e?: string; use?: string };
export type IdClaims = { sub: string; email: string; emailVerified: boolean; name: string | null };

export class OidcError extends Error {}

export async function exchangeCode(input: { endpoints: OidcEndpoints; clientId: string; clientSecret: string; redirectUri: string; code: string; verifier: string; fetchImpl?: typeof fetch }): Promise<string> {
  const res = await (input.fetchImpl ?? fetch)(input.endpoints.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, client_id: input.clientId, client_secret: input.clientSecret, code_verifier: input.verifier }),
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
  });
  if (!res.ok) throw new OidcError(`token endpoint answered ${res.status}`);
  const body = (await res.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string" || body.id_token.split(".").length !== 3) throw new OidcError("no id_token in the token response");
  return body.id_token;
}

let jwksCache: { url: string; keys: Jwk[]; at: number } | null = null;

export async function fetchJwks(url: string, fetchImpl: typeof fetch = fetch, now: number = Date.now(), forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && jwksCache && jwksCache.url === url && now - jwksCache.at < 60 * 60_000) return jwksCache.keys;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000), redirect: "error" });
  if (!res.ok) throw new OidcError(`jwks endpoint answered ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  if (!Array.isArray(body.keys)) throw new OidcError("malformed jwks");
  jwksCache = { url, keys: body.keys, at: now };
  return body.keys;
}

export function resetJwksCacheForTests(): void {
  jwksCache = null;
}

export function verifyIdToken(input: { idToken: string; keys: Jwk[]; issuers: string[]; clientId: string; nonce: string; now?: number; clockSkewSec?: number }): IdClaims {
  const [h, p, sig] = input.idToken.split(".");
  if (!h || !p || !sig) throw new OidcError("malformed id_token");
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(fromB64u(h).toString("utf8"));
    claims = JSON.parse(fromB64u(p).toString("utf8"));
  } catch {
    throw new OidcError("malformed id_token");
  }
  if (header.alg !== "RS256") throw new OidcError("unsupported signing algorithm"); // never "none", never HS256 with a public key
  const key = input.keys.find((k) => k.kty === "RSA" && k.kid === header.kid && k.n && k.e);
  if (!key) throw new OidcError("unknown signing key");
  const publicKey = createPublicKey({ key: { kty: "RSA", n: key.n, e: key.e }, format: "jwk" });
  if (!verifySignature("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey, fromB64u(sig))) throw new OidcError("bad signature");

  const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
  const skew = input.clockSkewSec ?? 60;
  if (typeof claims.iss !== "string" || !input.issuers.includes(claims.iss)) throw new OidcError("wrong issuer");
  const aud = claims.aud;
  if (!(aud === input.clientId || (Array.isArray(aud) && aud.includes(input.clientId)))) throw new OidcError("wrong audience");
  if (Array.isArray(aud) && aud.length > 1 && claims.azp !== input.clientId) throw new OidcError("wrong authorized party");
  if (typeof claims.exp !== "number" || claims.exp + skew < nowSec) throw new OidcError("token expired");
  if (typeof claims.iat !== "number" || claims.iat - skew > nowSec) throw new OidcError("token issued in the future");
  if (typeof claims.nonce !== "string" || !constantTimeEqual(claims.nonce, input.nonce)) throw new OidcError("nonce mismatch");
  if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 255) throw new OidcError("no subject");
  if (typeof claims.email !== "string" || !claims.email.includes("@")) throw new OidcError("no e-mail");
  return { sub: claims.sub, email: claims.email.trim().toLowerCase(), emailVerified: claims.email_verified === true || claims.email_verified === "true", name: typeof claims.name === "string" ? claims.name.slice(0, 120) : null };
}

export const issuersFor = (issuer: string): string[] => (issuer === GOOGLE_ISSUER ? [GOOGLE_ISSUER, "accounts.google.com"] : [issuer]);
