import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { authorizeLogin } from "@/lib/admin/auth/authorize";
import { buildAuthUrl, codeChallenge, discoverEndpoints, exchangeCode, fetchJwks, fetchUserinfo, issuersFor, newLoginState, oidcEndpoints, OidcError, packLoginState, resetDiscoveryCacheForTests, resetJwksCacheForTests, safeNext, unpackLoginState, verifyIdToken, type Jwk } from "@/lib/admin/auth/oidc";
import type { UserRepository, UserRow } from "@/lib/admin/store/ports";

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const CLIENT = "railway-client-id";
const ISSUER = "https://backboard.railway.com";
const NOW = 1_800_000_000_000;
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const otherEc = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwkOf = (k: KeyObject, kid: string): Jwk => ({ ...(k.export({ format: "jwk" }) as object), kid, alg: "ES256", use: "sig" }) as Jwk;
const KEYS = [jwkOf(ec.publicKey, "k1")];

function token(claims: Record<string, unknown>, opts: { key?: KeyObject; kid?: string; alg?: string; badLength?: boolean } = {}) {
  const header = b64u(JSON.stringify({ alg: opts.alg ?? "ES256", kid: opts.kid ?? "k1", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: ISSUER, aud: CLIENT, sub: "railway-user-1", email: "Pessoa@Example.com", email_verified: true, nonce: "n0nce", iat: NOW / 1000 - 10, exp: NOW / 1000 + 3000, ...claims }));
  const signature = createSign("SHA256").update(`${header}.${body}`).sign({ key: opts.key ?? ec.privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${body}.${b64u(opts.badLength ? signature.subarray(0, 40) : signature)}`;
}
const verify = (idToken: string, extra: Partial<Parameters<typeof verifyIdToken>[0]> = {}) => verifyIdToken({ idToken, keys: KEYS, issuers: issuersFor(ISSUER), clientId: CLIENT, nonce: "n0nce", now: NOW, ...extra });

describe("ID token verification (ES256, as Railway signs)", () => {
  test("given a valid token, when verified, then the e-mail is normalised and claims come only from the verified token", () => {
    expect(verify(token({}))).toEqual({ sub: "railway-user-1", email: "pessoa@example.com", emailVerified: true, name: null });
  });

  test("given a token signed by another key, a tampered payload, an unknown kid or a malformed signature, when verified, then it is refused", () => {
    expect(() => verify(token({}, { key: otherEc.privateKey }))).toThrow("bad signature");
    const [h, p, s] = token({}).split(".");
    const forged = `${h}.${b64u(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), email: "admin@evil.example" }))}.${s}`;
    expect(() => verify(forged)).toThrow("bad signature");
    expect(() => verify(token({}, { kid: "nope" }))).toThrow("unknown signing key");
    expect(() => verify(token({}, { badLength: true }))).toThrow("bad signature");
  });

  test("given alg none, HS256 or RS256 (not what Railway uses), when verified, then it is refused before any key is used", () => {
    for (const alg of ["none", "HS256", "RS256"]) expect(() => verify(token({}, { alg })), alg).toThrow("unsupported signing algorithm");
    expect(() => verify("a.b")).toThrow(OidcError);
  });

  test("given a wrong issuer, audience, nonce or an expired / future token, when verified, then each is refused", () => {
    expect(() => verify(token({ iss: "https://evil.example" }))).toThrow("wrong issuer");
    expect(() => verify(token({ aud: "someone-else" }))).toThrow("wrong audience");
    expect(() => verify(token({ nonce: "other" }))).toThrow("nonce mismatch");
    expect(() => verify(token({ exp: NOW / 1000 - 3600 }))).toThrow("token expired");
    expect(() => verify(token({ iat: NOW / 1000 + 3600 }))).toThrow("issued in the future");
    expect(() => verify(token({ sub: "" }))).toThrow("no subject");
  });

  test("given a token without an e-mail or with an unverified one, when verified, then the e-mail is null / unverified, never assumed", () => {
    expect(verify(token({ email: undefined, email_verified: undefined }))).toMatchObject({ email: null, emailVerified: false });
    expect(verify(token({ email_verified: false })).emailVerified).toBe(false);
    expect(verify(token({ email_verified: undefined })).emailVerified).toBe(false);
    expect(verify(token({ email_verified: "true" })).emailVerified).toBe(true);
  });

  test("given several audiences, when the authorized party is not us, then it is refused", () => {
    expect(() => verify(token({ aud: [CLIENT, "other"], azp: "other" }))).toThrow("authorized party");
    expect(verify(token({ aud: [CLIENT, "other"], azp: CLIENT })).sub).toBe("railway-user-1");
  });
});

describe("login state and redirects", () => {
  const SECRET = "s".repeat(40);
  test("given a packed state, when unpacked with the same secret, then it round-trips; another secret, a tampered value or an expired one is refused", () => {
    const s = newLoginState("/admin/home", NOW);
    const packed = packLoginState(s, SECRET);
    expect(unpackLoginState(packed, SECRET, NOW + 1000)).toEqual(s);
    expect(unpackLoginState(packed, "z".repeat(40), NOW + 1000)).toBeNull();
    expect(unpackLoginState(`${packed}x`, SECRET, NOW + 1000)).toBeNull();
    expect(unpackLoginState(packed, SECRET, NOW + 11 * 60_000)).toBeNull();
    expect(unpackLoginState(undefined, SECRET, NOW)).toBeNull();
    expect(unpackLoginState("a.b.c", SECRET, NOW)).toBeNull();
  });

  test("given the authorization URL, when built, then it asks only openid email profile, with PKCE S256, state, nonce and the exact redirect URI", () => {
    const login = newLoginState("/admin");
    const url = new URL(buildAuthUrl({ endpoints: oidcEndpoints(ISSUER), clientId: CLIENT, redirectUri: "https://www.useorigens.com.br/admin/auth/callback", login }));
    expect(url.origin + url.pathname).toBe("https://backboard.railway.com/oauth/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: CLIENT, response_type: "code", scope: "openid email profile", state: login.state, nonce: login.nonce, code_challenge: codeChallenge(login.verifier), code_challenge_method: "S256", redirect_uri: "https://www.useorigens.com.br/admin/auth/callback" });
    expect(url.searchParams.get("scope")).not.toMatch(/offline_access|workspace|project/);
    expect(url.toString()).not.toContain(login.verifier);
  });

  test("given a post-login destination, when it is anything but a plain admin path, then it falls back to /admin (no open redirect)", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/admin/../x", "/sul", "javascript:alert(1)", "/admin//x", "/admin/login", "/admin/auth/callback", "", null, undefined]) expect(safeNext(bad), String(bad)).toBe("/admin");
    expect(safeNext("/admin/home/custom-1")).toBe("/admin/home/custom-1");
  });
});

describe("endpoints, token exchange and userinfo", () => {
  beforeEach(() => { resetJwksCacheForTests(); resetDiscoveryCacheForTests(); });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  test("given Railway's discovery document, when endpoints are discovered, then they are used (cached); anything off-domain or malformed falls back to the documented URLs", async () => {
    const doc = { issuer: ISSUER, authorization_endpoint: `${ISSUER}/oauth/auth2`, token_endpoint: `${ISSUER}/oauth/token2`, jwks_uri: `${ISSUER}/oauth/jwks2`, userinfo_endpoint: `${ISSUER}/oauth/me2` };
    let calls = 0;
    const ok = (async () => { calls++; return json(doc); }) as unknown as typeof fetch;
    expect((await discoverEndpoints(ISSUER, ok, NOW)).token).toBe(`${ISSUER}/oauth/token2`);
    await discoverEndpoints(ISSUER, ok, NOW + 1000);
    expect(calls).toBe(1);
    resetDiscoveryCacheForTests();
    const evil = (async () => json({ ...doc, token_endpoint: "https://evil.example/token" })) as unknown as typeof fetch;
    expect(await discoverEndpoints(ISSUER, evil, NOW)).toEqual(oidcEndpoints(ISSUER));
    resetDiscoveryCacheForTests();
    const wrongIssuer = (async () => json({ ...doc, issuer: "https://evil.example" })) as unknown as typeof fetch;
    expect(await discoverEndpoints(ISSUER, wrongIssuer, NOW)).toEqual(oidcEndpoints(ISSUER));
    resetDiscoveryCacheForTests();
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await discoverEndpoints(ISSUER, down, NOW)).toEqual(oidcEndpoints(ISSUER));
  });

  test("given the token endpoint, when a code is exchanged, then the client authenticates with HTTP Basic, the secret is NOT in the body, and the verifier is", async () => {
    let seen: { url: string; body: string; auth: string } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, body: String(init.body), auth: (init.headers as Record<string, string>).Authorization };
      return json({ id_token: "a.b.c", access_token: "at-1" });
    }) as unknown as typeof fetch;
    const t = await exchangeCode({ endpoints: oidcEndpoints(ISSUER), clientId: CLIENT, clientSecret: "sh:h+/", redirectUri: "https://x/cb", code: "the-code", verifier: "ver", fetchImpl });
    expect(t).toEqual({ idToken: "a.b.c", accessToken: "at-1" });
    expect(seen!.url).toBe("https://backboard.railway.com/oauth/token");
    expect(Buffer.from(seen!.auth.replace("Basic ", ""), "base64").toString()).toBe(`${CLIENT}:sh%3Ah%2B%2F`); // form-encoded per RFC 6749 §2.3.1
    const body = new URLSearchParams(seen!.body);
    expect(body.get("code_verifier")).toBe("ver");
    expect(body.get("client_secret")).toBeNull();
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  test("given an error or an id_token-less answer, when exchanged, then it throws", async () => {
    const args = { endpoints: oidcEndpoints(ISSUER), clientId: CLIENT, clientSecret: "s", redirectUri: "x", code: "c", verifier: "v" };
    await expect(exchangeCode({ ...args, fetchImpl: (async () => json({}, 400)) as unknown as typeof fetch })).rejects.toThrow(OidcError);
    await expect(exchangeCode({ ...args, fetchImpl: (async () => json({ access_token: "only" })) as unknown as typeof fetch })).rejects.toThrow("no id_token");
  });

  test("given the userinfo endpoint, when queried with the access token, then e-mail facts are returned in normal form; a missing subject is refused", async () => {
    let auth = "";
    const impl = (async (_u: string, init: RequestInit) => { auth = (init.headers as Record<string, string>).Authorization; return json({ sub: "railway-user-1", email: "Ana@Example.com", email_verified: true, name: "Ana" }); }) as unknown as typeof fetch;
    expect(await fetchUserinfo(oidcEndpoints(ISSUER), "at-1", impl)).toEqual({ sub: "railway-user-1", email: "ana@example.com", emailVerified: true, name: "Ana" });
    expect(auth).toBe("Bearer at-1");
    await expect(fetchUserinfo(oidcEndpoints(ISSUER), "at", (async () => json({ email: "x@y.z" })) as unknown as typeof fetch)).rejects.toThrow("subject");
  });

  test("given the JWKS endpoint, when keys are fetched twice within the hour, then the second call is cached; a forced refresh refetches", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return json({ keys: KEYS }); }) as unknown as typeof fetch;
    await fetchJwks("https://k/jwks", fetchImpl, NOW);
    await fetchJwks("https://k/jwks", fetchImpl, NOW + 1000);
    expect(calls).toBe(1);
    await fetchJwks("https://k/jwks", fetchImpl, NOW + 2000, true);
    expect(calls).toBe(2);
  });
});

describe("who may sign in with Railway", () => {
  const rows = new Map<string, UserRow>();
  const users: UserRepository = {
    async findByEmail(email) { return [...rows.values()].find((u) => u.email === email) ?? null; },
    async findById(id) { return rows.get(id) ?? null; },
    async findByProviderSub(sub) { return [...rows.values()].find((u) => u.providerSub === sub) ?? null; },
    async list() { return [...rows.values()]; },
    async create(i) { const u: UserRow = { id: `u${rows.size + 1}`, email: i.email, name: i.name, role: i.role, scopes: i.scopes, active: true, providerSub: null, createdAt: "", lastLoginAt: null }; rows.set(u.id, u); return u; },
    async update(id, patch) { const u = rows.get(id); if (!u) return null; Object.assign(u, patch); return u; },
    async bindProviderSub(id, sub) { const u = rows.get(id)!; if (u.providerSub && u.providerSub !== sub) return false; u.providerSub = sub; return true; },
    async touchLogin() {},
  };
  const claims = (email: string | null, over: Record<string, unknown> = {}) => ({ sub: "sub-1", email, emailVerified: email !== null, name: null, ...over });
  const OWNER = { email: "Dono@Example.com", sub: null };
  beforeEach(() => rows.clear());

  test("given the configured owner e-mail (verified) and an empty table, when the owner signs in, then the owner is created and bound (bootstrap)", async () => {
    const r = await authorizeLogin(claims("dono@example.com"), users, OWNER);
    expect(r.ok && r.user).toMatchObject({ role: "owner", email: "dono@example.com", providerSub: "sub-1" });
  });

  test("given the owner e-mail but NOT verified by the provider, when it signs in, then it is refused: an unverified e-mail proves nothing", async () => {
    expect(await authorizeLogin(claims("dono@example.com", { emailVerified: false }), users, OWNER)).toEqual({ ok: false, reason: "unverified-email" });
    expect(rows.size).toBe(0);
  });

  test("given a provider that returns no e-mail, when the account id is not the configured owner's, then it is refused; when it IS, the owner is bound by account id", async () => {
    expect(await authorizeLogin(claims(null), users, OWNER)).toEqual({ ok: false, reason: "no-email" });
    expect(await authorizeLogin(claims(null), users, { email: "dono@example.com", sub: "sub-1" })).toEqual({ ok: false, reason: "not-allowed" }); // bound by id but nothing to create the row from
  });

  test("given ADMIN_OWNER_RAILWAY_SUB and an unverified e-mail, when that exact account signs in, then the owner is bound by the immutable id, not the e-mail", async () => {
    const r = await authorizeLogin(claims("dono@example.com", { emailVerified: false }), users, { email: "dono@example.com", sub: "sub-1" });
    expect(r.ok && r.user).toMatchObject({ role: "owner", providerSub: "sub-1" });
    const other = await authorizeLogin(claims("dono@example.com", { emailVerified: false, sub: "sub-2" }), users, { email: "dono@example.com", sub: "sub-1" });
    expect(other).toEqual({ ok: false, reason: "unverified-email" });
  });

  test("given an unknown e-mail, when it signs in, then it is refused (no public sign-up, and no editor is created by signing in)", async () => {
    expect(await authorizeLogin(claims("qualquer@example.com"), users, OWNER)).toEqual({ ok: false, reason: "not-allowed" });
    expect(rows.size).toBe(0);
  });

  test("given an allowlisted editor, when it signs in, then it is admitted with its scopes and bound; when deactivated, it is refused", async () => {
    const editor = await users.create({ email: "ed@example.com", name: null, role: "editor", scopes: ["sul"] });
    const ok = await authorizeLogin(claims("ed@example.com"), users, OWNER);
    expect(ok.ok && ok.user).toMatchObject({ role: "editor", scopes: ["sul"], providerSub: "sub-1" });
    await users.update(editor.id, { active: false });
    expect(await authorizeLogin(claims("ed@example.com"), users, OWNER)).toEqual({ ok: false, reason: "inactive" });
  });

  test("given a user bound to one account, when another account arrives with the same verified e-mail, then it is refused; the bound account still gets in after an e-mail change", async () => {
    await users.create({ email: "ed@example.com", name: null, role: "editor", scopes: ["sul"] });
    expect((await authorizeLogin(claims("ed@example.com", { sub: "sub-A" }), users, OWNER)).ok).toBe(true);
    expect(await authorizeLogin(claims("ed@example.com", { sub: "sub-B" }), users, OWNER)).toEqual({ ok: false, reason: "account-mismatch" });
    const changed = await authorizeLogin(claims("ed-new@example.com", { sub: "sub-A" }), users, OWNER);
    expect(changed.ok && changed.user.email).toBe("ed@example.com"); // the row is found by the immutable id
  });

  test("given the configured owner whose row was demoted or deactivated, when the owner signs in, then the environment wins", async () => {
    const u = await users.create({ email: "dono@example.com", name: null, role: "editor", scopes: ["sul"] });
    await users.update(u.id, { active: false });
    const r = await authorizeLogin(claims("dono@example.com"), users, OWNER);
    expect(r.ok && r.user).toMatchObject({ role: "owner", active: true });
  });
});
