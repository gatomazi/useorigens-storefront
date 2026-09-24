import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { RAILWAY_ISSUER } from "../config";

/**
 * Login with Railway (OpenID Connect, authorization-code flow with PKCE), implemented directly on the specification with `node:crypto`
 * and `fetch` (no auth framework, no dependency to audit). Everything that decides trust is here and unit-tested:
 *   - `state` and `nonce` are random, bound to the browser by a signed, short-lived cookie, and compared in constant time;
 *   - the ID token's signature (ES256, Railway's only algorithm) is verified against the provider's published keys (`kid` lookup), then
 *     `iss`, `aud`, `exp`, `iat` and `nonce` are checked;
 *   - the client authenticates to the token endpoint with HTTP Basic (`client_secret_basic`), and only `openid email profile` is asked:
 *     Railway is used purely as an IDENTITY provider (no workspace, project or API scope, no refresh token).
 * Endpoints come from Railway's discovery document (cached, and every endpoint must live under https://backboard.railway.com/), with the
 * documented URLs as a fallback. A loopback issuer exists only so the automated tests can run a fake provider.
 */
export type OidcEndpoints = { authorization: string; token: string; jwks: string; userinfo: string };

const RAILWAY_FALLBACK: OidcEndpoints = {
  authorization: "https://backboard.railway.com/oauth/auth",
  token: "https://backboard.railway.com/oauth/token",
  jwks: "https://backboard.railway.com/oauth/jwks",
  userinfo: "https://backboard.railway.com/oauth/me",
};

/** Fixed endpoints for the loopback test provider, and the documented fallback for Railway. */
export function oidcEndpoints(issuer: string): OidcEndpoints {
  if (issuer === RAILWAY_ISSUER) return RAILWAY_FALLBACK;
  return { authorization: `${issuer}/authorize`, token: `${issuer}/token`, jwks: `${issuer}/jwks`, userinfo: `${issuer}/me` };
}

let discoveryCache: { issuer: string; endpoints: OidcEndpoints; at: number } | null = null;

/** Railway's discovery document, cached for an hour; anything unexpected (other issuer, other host, malformed) falls back to the documented URLs. */
export async function discoverEndpoints(issuer: string, fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<OidcEndpoints> {
  if (issuer !== RAILWAY_ISSUER) return oidcEndpoints(issuer);
  if (discoveryCache && discoveryCache.issuer === issuer && now - discoveryCache.at < 60 * 60_000) return discoveryCache.endpoints;
  try {
    const res = await fetchImpl(`${issuer}/oauth/.well-known/openid-configuration`, { signal: AbortSignal.timeout(6_000), redirect: "error" });
    if (!res.ok) throw new Error("discovery unavailable");
    const doc = (await res.json()) as Record<string, unknown>;
    const under = (v: unknown): v is string => typeof v === "string" && v.startsWith(`${RAILWAY_ISSUER}/`);
    if (doc.issuer !== RAILWAY_ISSUER || !under(doc.authorization_endpoint) || !under(doc.token_endpoint) || !under(doc.jwks_uri) || !under(doc.userinfo_endpoint)) throw new Error("unexpected discovery document");
    const endpoints = { authorization: doc.authorization_endpoint, token: doc.token_endpoint, jwks: doc.jwks_uri, userinfo: doc.userinfo_endpoint };
    discoveryCache = { issuer, endpoints, at: now };
    return endpoints;
  } catch {
    return RAILWAY_FALLBACK;
  }
}

export function resetDiscoveryCacheForTests(): void {
  discoveryCache = null;
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
    scope: "openid email profile",
    state: input.login.state,
    nonce: input.login.nonce,
    code_challenge: codeChallenge(input.login.verifier),
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

// ── Token exchange and ID-token verification ────────────────────────────────────────────────────────────────

export type Jwk = { kid?: string; kty: string; crv?: string; alg?: string; x?: string; y?: string; n?: string; e?: string; use?: string };
export type IdClaims = { sub: string; email: string | null; emailVerified: boolean; name: string | null };

export class OidcError extends Error {}

const formEncode = (v: string): string => encodeURIComponent(v).replace(/%20/g, "+");

export type TokenSet = { idToken: string; accessToken: string | null };

/** Authorization-code exchange. The client authenticates with HTTP Basic; the PKCE verifier proves the same browser started the flow. */
export async function exchangeCode(input: { endpoints: OidcEndpoints; clientId: string; clientSecret: string; redirectUri: string; code: string; verifier: string; fetchImpl?: typeof fetch }): Promise<TokenSet> {
  const basic = Buffer.from(`${formEncode(input.clientId)}:${formEncode(input.clientSecret)}`).toString("base64");
  const res = await (input.fetchImpl ?? fetch)(input.endpoints.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}`, Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, code_verifier: input.verifier }),
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
  });
  if (!res.ok) throw new OidcError(`token endpoint answered ${res.status}`);
  const body = (await res.json()) as { id_token?: unknown; access_token?: unknown };
  if (typeof body.id_token !== "string" || body.id_token.split(".").length !== 3) throw new OidcError("no id_token in the token response");
  return { idToken: body.id_token, accessToken: typeof body.access_token === "string" ? body.access_token : null };
}

/**
 * The userinfo endpoint, called with the access token we just obtained from the token endpoint (server to server, over TLS). Used ONLY when
 * the ID token itself carries no e-mail; its `sub` must equal the verified ID token's, so it can add facts about the same account, never
 * change which account it is.
 */
export async function fetchUserinfo(endpoints: OidcEndpoints, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<{ sub: string; email: string | null; emailVerified: boolean; name: string | null }> {
  const res = await fetchImpl(endpoints.userinfo, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(8_000), redirect: "error" });
  if (!res.ok) throw new OidcError(`userinfo endpoint answered ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  if (typeof body.sub !== "string") throw new OidcError("userinfo without a subject");
  return {
    sub: body.sub,
    email: typeof body.email === "string" && body.email.includes("@") ? body.email.trim().toLowerCase() : null,
    emailVerified: body.email_verified === true || body.email_verified === "true",
    name: typeof body.name === "string" ? body.name.slice(0, 120) : null,
  };
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

const ALGS: Record<string, { hash: string; ieee?: boolean; kty: string }> = { ES256: { hash: "sha256", ieee: true, kty: "EC" }, RS256: { hash: "sha256", kty: "RSA" } };

export function verifyIdToken(input: { idToken: string; keys: Jwk[]; issuers: string[]; clientId: string; nonce: string; algs?: string[]; now?: number; clockSkewSec?: number }): IdClaims {
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
  const allowed = input.algs ?? ["ES256"];
  const alg = header.alg && allowed.includes(header.alg) ? ALGS[header.alg] : undefined;
  if (!alg) throw new OidcError("unsupported signing algorithm"); // never "none", never HS256 with a public key
  const key = input.keys.find((k) => k.kty === alg.kty && k.kid === header.kid && (alg.kty === "EC" ? k.x && k.y && k.crv === "P-256" : k.n && k.e));
  if (!key) throw new OidcError("unknown signing key");
  const jwk = alg.kty === "EC" ? { kty: "EC", crv: "P-256", x: key.x, y: key.y } : { kty: "RSA", n: key.n, e: key.e };
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signature = fromB64u(sig);
  if (alg.ieee && signature.length !== 64) throw new OidcError("bad signature");
  if (!verifySignature(alg.hash, Buffer.from(`${h}.${p}`), alg.ieee ? { key: publicKey, dsaEncoding: "ieee-p1363" } : publicKey, signature)) throw new OidcError("bad signature");

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
  const email = typeof claims.email === "string" && claims.email.includes("@") ? claims.email.trim().toLowerCase() : null;
  return { sub: claims.sub, email, emailVerified: email !== null && (claims.email_verified === true || claims.email_verified === "true"), name: typeof claims.name === "string" ? claims.name.slice(0, 120) : null };
}

export const issuersFor = (issuer: string): string[] => [issuer];
