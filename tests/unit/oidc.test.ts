import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { authorizeLogin } from "@/lib/admin/auth/authorize";
import { buildAuthUrl, codeChallenge, exchangeCode, fetchJwks, issuersFor, newLoginState, oidcEndpoints, OidcError, packLoginState, resetJwksCacheForTests, safeNext, unpackLoginState, verifyIdToken, type Jwk } from "@/lib/admin/auth/oidc";
import type { UserRepository, UserRow } from "@/lib/admin/store/ports";

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const CLIENT = "client-id.apps.googleusercontent.com";
const NOW = 1_800_000_000_000;
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwkOf = (k: KeyObject, kid: string): Jwk => ({ ...(k.export({ format: "jwk" }) as object), kid, alg: "RS256", use: "sig" }) as Jwk;
const KEYS = [jwkOf(publicKey, "k1")];

function token(claims: Record<string, unknown>, opts: { key?: KeyObject; kid?: string; alg?: string } = {}) {
  const header = b64u(JSON.stringify({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: "https://accounts.google.com", aud: CLIENT, sub: "1234", email: "Pessoa@Example.com", email_verified: true, nonce: "n0nce", iat: NOW / 1000 - 10, exp: NOW / 1000 + 3000, ...claims }));
  const signature = createSign("RSA-SHA256").update(`${header}.${body}`).sign(opts.key ?? privateKey);
  return `${header}.${body}.${b64u(signature)}`;
}
const verify = (idToken: string, extra: Partial<Parameters<typeof verifyIdToken>[0]> = {}) => verifyIdToken({ idToken, keys: KEYS, issuers: issuersFor("https://accounts.google.com"), clientId: CLIENT, nonce: "n0nce", now: NOW, ...extra });

describe("ID token verification", () => {
  test("given a valid Google-shaped token, when verified, then the e-mail is normalised and the claims come only from the verified token", () => {
    expect(verify(token({}))).toEqual({ sub: "1234", email: "pessoa@example.com", emailVerified: true, name: null });
  });

  test("given a token signed by another key, a tampered payload or an unknown kid, when verified, then it is refused", () => {
    expect(() => verify(token({}, { key: other.privateKey }))).toThrow("bad signature");
    const [h, p, s] = token({}).split(".");
    const forged = `${h}.${b64u(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), email: "admin@evil.example" }))}.${s}`;
    expect(() => verify(forged)).toThrow("bad signature");
    expect(() => verify(token({}, { kid: "nope" }))).toThrow("unknown signing key");
  });

  test("given alg none or HS256, when verified, then it is refused before any key is used", () => {
    expect(() => verify(token({}, { alg: "none" }))).toThrow("unsupported signing algorithm");
    expect(() => verify(token({}, { alg: "HS256" }))).toThrow("unsupported signing algorithm");
    expect(() => verify("a.b")).toThrow(OidcError);
  });

  test("given a wrong issuer, audience, nonce or an expired / future token, when verified, then each is refused", () => {
    expect(() => verify(token({ iss: "https://evil.example" }))).toThrow("wrong issuer");
    expect(() => verify(token({ aud: "someone-else" }))).toThrow("wrong audience");
    expect(() => verify(token({ nonce: "other" }))).toThrow("nonce mismatch");
    expect(() => verify(token({ exp: NOW / 1000 - 3600 }))).toThrow("token expired");
    expect(() => verify(token({ iat: NOW / 1000 + 3600 }))).toThrow("issued in the future");
    expect(() => verify(token({ sub: "" }))).toThrow("no subject");
    expect(() => verify(token({ email: undefined }))).toThrow("no e-mail");
  });

  test("given both Google issuer spellings, when verified, then both are accepted; an unverified e-mail is reported as such", () => {
    expect(verify(token({ iss: "accounts.google.com" })).email).toBe("pessoa@example.com");
    expect(verify(token({ email_verified: false })).emailVerified).toBe(false);
    expect(verify(token({ email_verified: "true" })).emailVerified).toBe(true);
  });

  test("given several audiences, when the authorized party is not us, then it is refused", () => {
    expect(() => verify(token({ aud: [CLIENT, "other"], azp: "other" }))).toThrow("authorized party");
    expect(verify(token({ aud: [CLIENT, "other"], azp: CLIENT })).sub).toBe("1234");
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

  test("given two logins, when started, then state, nonce and verifier are fresh each time", () => {
    const a = newLoginState("/admin");
    const b = newLoginState("/admin");
    expect(new Set([a.state, b.state, a.nonce, b.nonce, a.verifier, b.verifier]).size).toBe(6);
  });

  test("given the authorization URL, when built, then it carries PKCE S256, state, nonce and the exact redirect URI (never the secret)", () => {
    const login = newLoginState("/admin");
    const url = new URL(buildAuthUrl({ endpoints: oidcEndpoints("https://accounts.google.com"), clientId: CLIENT, redirectUri: "https://admin.useorigens.com.br/admin/auth/callback", login }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: CLIENT, response_type: "code", scope: "openid email", state: login.state, nonce: login.nonce, code_challenge: codeChallenge(login.verifier), code_challenge_method: "S256", redirect_uri: "https://admin.useorigens.com.br/admin/auth/callback" });
    expect(url.toString()).not.toContain(login.verifier);
  });

  test("given a post-login destination, when it is anything but a plain admin path, then it falls back to /admin (no open redirect)", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/admin/../x", "/sul", "javascript:alert(1)", "/admin//x", "/admin/login", "/admin/auth/callback", "", null, undefined]) expect(safeNext(bad), String(bad)).toBe("/admin");
    expect(safeNext("/admin/home/custom-1")).toBe("/admin/home/custom-1");
    expect(safeNext("/admin")).toBe("/admin");
  });
});

describe("token exchange and key fetching", () => {
  beforeEach(() => resetJwksCacheForTests());
  test("given the token endpoint, when a code is exchanged, then the secret and verifier go in the POST body and only id_token is used", async () => {
    let seen: { url: string; body: string } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, body: String(init.body) };
      return new Response(JSON.stringify({ id_token: "a.b.c", access_token: "ignored" }), { status: 200 });
    }) as unknown as typeof fetch;
    const t = await exchangeCode({ endpoints: oidcEndpoints("https://accounts.google.com"), clientId: CLIENT, clientSecret: "shh", redirectUri: "https://x/cb", code: "the-code", verifier: "ver", fetchImpl });
    expect(t).toBe("a.b.c");
    expect(seen!.url).toBe("https://oauth2.googleapis.com/token");
    expect(new URLSearchParams(seen!.body).get("code_verifier")).toBe("ver");
    expect(new URLSearchParams(seen!.body).get("client_secret")).toBe("shh");
  });

  test("given an error or an id_token-less answer from the provider, when exchanged, then it throws", async () => {
    const mk = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const args = { endpoints: oidcEndpoints("https://accounts.google.com"), clientId: CLIENT, clientSecret: "s", redirectUri: "x", code: "c", verifier: "v" };
    await expect(exchangeCode({ ...args, fetchImpl: mk(400, {}) })).rejects.toThrow(OidcError);
    await expect(exchangeCode({ ...args, fetchImpl: mk(200, { access_token: "only" }) })).rejects.toThrow("no id_token");
  });

  test("given the JWKS endpoint, when keys are fetched twice within the hour, then the second call is served from cache; a forced refresh refetches", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response(JSON.stringify({ keys: KEYS }), { status: 200 }); }) as unknown as typeof fetch;
    await fetchJwks("https://k/jwks", fetchImpl, NOW);
    await fetchJwks("https://k/jwks", fetchImpl, NOW + 1000);
    expect(calls).toBe(1);
    await fetchJwks("https://k/jwks", fetchImpl, NOW + 2000, true);
    expect(calls).toBe(2);
  });
});

describe("who may sign in", () => {
  const rows = new Map<string, UserRow>();
  const users: UserRepository = {
    async findByEmail(email) { return [...rows.values()].find((u) => u.email === email) ?? null; },
    async findById(id) { return rows.get(id) ?? null; },
    async list() { return [...rows.values()]; },
    async create(i) { const u: UserRow = { id: `u${rows.size + 1}`, email: i.email, name: i.name, role: i.role, scopes: i.scopes, active: true, googleSub: null, createdAt: "", lastLoginAt: null }; rows.set(u.id, u); return u; },
    async update(id, patch) { const u = rows.get(id); if (!u) return null; Object.assign(u, patch); return u; },
    async bindGoogleSub(id, sub) { const u = rows.get(id)!; if (u.googleSub && u.googleSub !== sub) return false; u.googleSub = sub; return true; },
    async touchLogin() {},
  };
  const claims = (email: string, over: Record<string, unknown> = {}) => ({ sub: "sub-1", email, emailVerified: true, name: null, ...over });
  beforeEach(() => rows.clear());

  test("given the configured owner e-mail and an empty table, when the owner signs in for the first time, then the owner is created (bootstrap)", async () => {
    const r = await authorizeLogin(claims("dono@example.com"), users, "Dono@Example.com");
    expect(r.ok && r.user).toMatchObject({ role: "owner", email: "dono@example.com", googleSub: "sub-1" });
  });

  test("given an unknown e-mail, when it signs in, then it is refused (no public sign-up)", async () => {
    expect(await authorizeLogin(claims("qualquer@example.com"), users, "dono@example.com")).toEqual({ ok: false, reason: "not-allowed" });
    expect(rows.size).toBe(0);
  });

  test("given an unverified Google e-mail, when it matches the owner, then it is refused", async () => {
    expect(await authorizeLogin(claims("dono@example.com", { emailVerified: false }), users, "dono@example.com")).toEqual({ ok: false, reason: "unverified-email" });
  });

  test("given an allowlisted editor, when it signs in, then it is admitted with its scopes; when deactivated, it is refused", async () => {
    const editor = await users.create({ email: "ed@example.com", name: null, role: "editor", scopes: ["sul"] });
    const ok = await authorizeLogin(claims("ed@example.com"), users, "dono@example.com");
    expect(ok.ok && ok.user).toMatchObject({ role: "editor", scopes: ["sul"] });
    await users.update(editor.id, { active: false });
    expect(await authorizeLogin(claims("ed@example.com"), users, "dono@example.com")).toEqual({ ok: false, reason: "inactive" });
  });

  test("given a user already bound to one Google account, when another account with the same e-mail arrives, then it is refused", async () => {
    await users.create({ email: "ed@example.com", name: null, role: "editor", scopes: ["sul"] });
    expect((await authorizeLogin(claims("ed@example.com", { sub: "sub-A" }), users, "dono@example.com")).ok).toBe(true);
    expect(await authorizeLogin(claims("ed@example.com", { sub: "sub-B" }), users, "dono@example.com")).toEqual({ ok: false, reason: "account-mismatch" });
  });

  test("given the configured owner whose row was demoted or deactivated, when the owner signs in, then the environment wins", async () => {
    const u = await users.create({ email: "dono@example.com", name: null, role: "editor", scopes: ["sul"] });
    await users.update(u.id, { active: false });
    const r = await authorizeLogin(claims("dono@example.com"), users, "dono@example.com");
    expect(r.ok && r.user).toMatchObject({ role: "owner", active: true });
  });
});
