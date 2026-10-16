import { describe, expect, test } from "vitest";
import { safeNext } from "@/lib/admin/auth/oidc";
import {
  ACCESS_TTL_S, CLAUDE_CALLBACK, CODE_TTL_MS, ROTATION_GRACE_MS, checkAuthorizeRequest, exchangeToken, isAllowedRedirectUri, issueCode, pkceChallenge, redirectMatches, registerClient, revokeToken, verifyAccessToken,
  type AuthorizeRequest, type Outcome,
} from "@/lib/mcp/auth/oauth";
import { memoryOAuthStore, sha256Hex, type OAuthStore } from "@/lib/mcp/auth/store";

const ISSUER = "https://www.useorigens.com.br";
const RESOURCE = `${ISSUER}/api/mcp`;
const T0 = Date.UTC(2026, 9, 15, 12, 0, 0);
const VERIFIER = "v".repeat(50);
const allowAll = async () => true;

async function registered(store: OAuthStore, redirectUris = [CLAUDE_CALLBACK]) {
  const r = await registerClient(store, { client_name: "Claude", redirect_uris: redirectUris, token_endpoint_auth_method: "none" });
  expect(r.status).toBe(201);
  return r.body.client_id as string;
}

function authorizeQuery(clientId: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: CLAUDE_CALLBACK, state: "st-1", code_challenge: pkceChallenge(VERIFIER), code_challenge_method: "S256", scope: "origens.read offline_access", ...extra });
}

async function approved(store: OAuthStore, clientId: string, now = T0): Promise<{ code: string; request: AuthorizeRequest }> {
  const check = await checkAuthorizeRequest(store, authorizeQuery(clientId), { resource: RESOURCE, issuer: ISSUER });
  if (!check.ok) throw new Error("authorize request rejected");
  const url = new URL(await issueCode(store, check.request, "owner-1", { issuer: ISSUER, now }));
  return { code: url.searchParams.get("code")!, request: check.request };
}

const codeForm = (clientId: string, code: string, extra: Record<string, string> = {}) =>
  new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: VERIFIER, redirect_uri: CLAUDE_CALLBACK, resource: RESOURCE, ...extra });
const refreshForm = (clientId: string, refresh: string, extra: Record<string, string> = {}) => new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh, ...extra });
const ctx = (now = T0, subjectAllowed = allowAll) => ({ resource: RESOURCE, now, subjectAllowed });
const tokens = (o: Outcome) => ({ access: o.body.access_token as string, refresh: o.body.refresh_token as string });

async function connected(store = memoryOAuthStore()) {
  const clientId = await registered(store);
  const { code } = await approved(store, clientId);
  const outcome = await exchangeToken(store, codeForm(clientId, code), ctx());
  expect(outcome.status).toBe(200);
  return { store, clientId, ...tokens(outcome) };
}
const valid = async (store: OAuthStore, access: string, now = T0 + 1000) => (await verifyAccessToken(store, access, { resource: RESOURCE, now })).ok;

describe("redirect URIs", () => {
  test("given Claude's hosted callback or a loopback address, then it may be registered; anything else may not", () => {
    for (const ok of [CLAUDE_CALLBACK, "http://localhost:3118/callback", "http://127.0.0.1:6274/oauth/callback", "http://localhost/callback"]) expect(isAllowedRedirectUri(ok), ok).toBe(true);
    for (const bad of ["https://claude.ai/api/mcp/auth_callback/", "https://claude.ai/other", "https://evil.example/cb", "http://192.168.0.2:3000/cb", "https://localhost:3000/cb", "http://user:pw@localhost:3000/cb", "http://localhost:3000/cb#x", "javascript:alert(1)", ""]) {
      expect(isAllowedRedirectUri(bad), bad).toBe(false);
    }
  });

  test("given a loopback URI, then it matches on any port but the same host and path; https callbacks match exactly", () => {
    expect(redirectMatches(["http://localhost:3118/callback"], "http://localhost:51234/callback")).toBe(true);
    expect(redirectMatches(["http://localhost:3118/callback"], "http://localhost:51234/other")).toBe(false);
    expect(redirectMatches(["http://localhost:3118/callback"], "http://127.0.0.1:3118/callback")).toBe(false);
    expect(redirectMatches([CLAUDE_CALLBACK], CLAUDE_CALLBACK)).toBe(true);
    expect(redirectMatches([CLAUDE_CALLBACK], `${CLAUDE_CALLBACK}?x=1`)).toBe(false);
  });
});

describe("dynamic client registration", () => {
  test("given Claude's metadata, then a public client is registered and described back", async () => {
    const store = memoryOAuthStore();
    const r = await registerClient(store, { client_name: "  Claude  ", redirect_uris: [CLAUDE_CALLBACK, CLAUDE_CALLBACK], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ client_name: "Claude", redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: "none" });
    expect(r.body.client_id).toMatch(/^mcp_[A-Za-z0-9_-]{32}$/);
    expect(r.body).not.toHaveProperty("client_secret");
    expect(await store.findClient(r.body.client_id as string)).not.toBeNull();
  });

  test("given a foreign redirect, a confidential client, an unknown grant or a long name, then it is refused", async () => {
    const store = memoryOAuthStore();
    expect((await registerClient(store, { redirect_uris: ["https://evil.example/cb"] })).body.error).toBe("invalid_redirect_uri");
    expect((await registerClient(store, { redirect_uris: [] })).body.error).toBe("invalid_redirect_uri");
    expect((await registerClient(store, { redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: "client_secret_basic" })).body.error).toBe("invalid_client_metadata");
    expect((await registerClient(store, { redirect_uris: [CLAUDE_CALLBACK], grant_types: ["client_credentials"] })).body.error).toBe("invalid_client_metadata");
    expect((await registerClient(store, { redirect_uris: [CLAUDE_CALLBACK], client_name: "x".repeat(101) })).body.error).toBe("invalid_client_metadata");
    expect((await registerClient(store, "nope")).status).toBe(400);
  });
});

describe("authorization request", () => {
  const check = (store: OAuthStore, q: URLSearchParams) => checkAuthorizeRequest(store, q, { resource: RESOURCE, issuer: ISSUER });

  test("given an unknown client or a redirect URI it did not register, then it is an error PAGE, never a redirect", async () => {
    const store = memoryOAuthStore();
    const clientId = await registered(store);
    expect(await check(store, authorizeQuery("mcp_" + "x".repeat(32)))).toMatchObject({ ok: false, kind: "page" });
    expect(await check(store, authorizeQuery(clientId, { redirect_uri: "https://evil.example/cb" }))).toMatchObject({ ok: false, kind: "page" });
    const dup = authorizeQuery(clientId);
    dup.append("redirect_uri", "https://evil.example/cb");
    expect(await check(store, dup)).toMatchObject({ ok: false, kind: "page" });
  });

  test("given a trusted redirect but no PKCE, plain PKCE, an unknown scope or another resource, then the client gets the error with state and iss", async () => {
    const store = memoryOAuthStore();
    const clientId = await registered(store);
    const cases: [Record<string, string>, string][] = [
      [{ code_challenge: "" }, "invalid_request"],
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ scope: "origens.admin" }, "invalid_scope"],
      [{ resource: "https://evil.example/api/mcp" }, "invalid_target"],
      [{ response_type: "token" }, "unsupported_response_type"],
    ];
    for (const [extra, error] of cases) {
      const r = await check(store, authorizeQuery(clientId, extra));
      if (r.ok || r.kind !== "redirect") throw new Error(`expected a redirect for ${error}`);
      const u = new URL(r.url);
      expect(u.origin + u.pathname).toBe(CLAUDE_CALLBACK);
      expect(Object.fromEntries(u.searchParams)).toMatchObject({ error, state: "st-1", iss: ISSUER });
    }
  });

  test("given no scope, then the grant is origens.read; the resource defaults to the MCP URL", async () => {
    const store = memoryOAuthStore();
    const clientId = await registered(store);
    const q = authorizeQuery(clientId);
    q.delete("scope");
    const r = await check(store, q);
    expect(r).toMatchObject({ ok: true, request: { scope: ["origens.read"], resource: RESOURCE } });
  });

  test("given a loopback client, then its registered path is accepted on another port", async () => {
    const store = memoryOAuthStore();
    const clientId = await registered(store, ["http://localhost:3118/callback"]);
    const r = await check(store, authorizeQuery(clientId, { redirect_uri: "http://localhost:40001/callback" }));
    expect(r).toMatchObject({ ok: true, request: { redirectUri: "http://localhost:40001/callback" } });
  });

  test("the approval redirect carries a fresh code, the state and the issuer, and only the code's hash is stored", async () => {
    const store = memoryOAuthStore();
    const clientId = await registered(store);
    const { code } = await approved(store, clientId);
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await store.consumeCode(code, T0)).toBeNull();
    expect((await store.consumeCode(sha256Hex(code), T0))?.status).toBe("fresh");
  });
});

describe("authorization code exchange", () => {
  test("given the right verifier, then an access token (1 h) and a refresh token are issued, and the access token is valid for the MCP", async () => {
    const store = memoryOAuthStore();
    const clientId = await registered(store);
    const { code } = await approved(store, clientId);
    const r = await exchangeToken(store, codeForm(clientId, code), ctx());
    expect(r).toMatchObject({ status: 200, body: { token_type: "Bearer", expires_in: ACCESS_TTL_S, scope: "origens.read offline_access" } });
    const { access } = tokens(r);
    expect(await valid(store, access)).toBe(true);
    expect(await valid(store, access, T0 + ACCESS_TTL_S * 1000)).toBe(false);
    expect((await verifyAccessToken(store, access, { resource: "https://other.example/api/mcp", now: T0 })).ok).toBe(false);
  });

  test("given a wrong verifier, another redirect, another client, another resource or an expired code, then invalid_grant / invalid_target", async () => {
    const store = memoryOAuthStore();
    const clientId = await registered(store);
    const other = await registered(store);
    const attempt = async (form: (code: string) => URLSearchParams, now = T0) => {
      const { code } = await approved(store, clientId);
      return (await exchangeToken(store, form(code), ctx(now))).body.error;
    };
    expect(await attempt((c) => codeForm(clientId, c, { code_verifier: "w".repeat(50) }))).toBe("invalid_grant");
    expect(await attempt((c) => codeForm(clientId, c, { redirect_uri: "http://localhost:1/cb" }))).toBe("invalid_grant");
    expect(await attempt((c) => codeForm(other, c))).toBe("invalid_grant");
    expect(await attempt((c) => codeForm(clientId, c, { resource: "https://evil.example/api/mcp" }))).toBe("invalid_target");
    expect(await attempt((c) => codeForm(clientId, c), T0 + CODE_TTL_MS)).toBe("invalid_grant");
    expect((await exchangeToken(store, codeForm("mcp_" + "z".repeat(32), "c".repeat(43)), ctx())).status).toBe(401);
    expect((await exchangeToken(store, new URLSearchParams({ grant_type: "password", client_id: clientId }), ctx())).body.error).toBe("unsupported_grant_type");
  });

  test("given a code used twice, then the second exchange fails AND everything issued from the first is revoked", async () => {
    const store = memoryOAuthStore();
    const clientId = await registered(store);
    const { code } = await approved(store, clientId);
    const first = tokens(await exchangeToken(store, codeForm(clientId, code), ctx()));
    expect(await valid(store, first.access)).toBe(true);
    expect((await exchangeToken(store, codeForm(clientId, code), ctx(T0 + 5000))).body.error).toBe("invalid_grant");
    expect(await valid(store, first.access)).toBe(false);
    expect((await exchangeToken(store, refreshForm(clientId, first.refresh), ctx(T0 + 6000))).body.error).toBe("invalid_grant");
  });

  test("given an authorizing account that lost access, then no token is issued", async () => {
    const store = memoryOAuthStore();
    const clientId = await registered(store);
    const { code } = await approved(store, clientId);
    expect((await exchangeToken(store, codeForm(clientId, code), ctx(T0, async () => false))).body.error).toBe("invalid_grant");
  });
});

describe("refresh token rotation", () => {
  test("given a refresh, then a new pair is issued in the same family and the old refresh token is spent", async () => {
    const { store, clientId, refresh } = await connected();
    const next = await exchangeToken(store, refreshForm(clientId, refresh), ctx(T0 + 60 * 60_000));
    expect(next.status).toBe(200);
    const pair = tokens(next);
    expect(pair.refresh).not.toBe(refresh);
    expect(await valid(store, pair.access, T0 + 60 * 60_000 + 1)).toBe(true);
  });

  test("given the old refresh token again within the grace window (two refreshes in flight), then it is refused but the connection survives", async () => {
    const { store, clientId, refresh } = await connected();
    const pair = tokens(await exchangeToken(store, refreshForm(clientId, refresh), ctx(T0 + 1000)));
    expect((await exchangeToken(store, refreshForm(clientId, refresh), ctx(T0 + 1000 + ROTATION_GRACE_MS - 1))).body.error).toBe("invalid_grant");
    expect(await valid(store, pair.access, T0 + 2000)).toBe(true);
  });

  test("given the old refresh token after the grace window, then it is a reuse: the whole family is revoked", async () => {
    const { store, clientId, refresh } = await connected();
    const pair = tokens(await exchangeToken(store, refreshForm(clientId, refresh), ctx(T0 + 1000)));
    const late = T0 + 1000 + ROTATION_GRACE_MS + 1;
    expect((await exchangeToken(store, refreshForm(clientId, refresh), ctx(late))).body.error).toBe("invalid_grant");
    expect(await valid(store, pair.access, late)).toBe(false);
    expect((await exchangeToken(store, refreshForm(clientId, pair.refresh), ctx(late))).body.error).toBe("invalid_grant");
  });

  test("given a refresh token presented by another client, then it is refused and the family is revoked", async () => {
    const { store, clientId, access, refresh } = await connected();
    const other = await registered(store);
    expect((await exchangeToken(store, refreshForm(other, refresh), ctx(T0 + 1000))).body.error).toBe("invalid_grant");
    expect(await valid(store, access)).toBe(false);
    expect((await exchangeToken(store, refreshForm(clientId, refresh), ctx(T0 + 2000 + ROTATION_GRACE_MS))).body.error).toBe("invalid_grant");
  });

  test("given a scope, then it may only narrow the grant; given an owner that lost access, then the family is revoked", async () => {
    const a = await connected();
    expect((await exchangeToken(a.store, refreshForm(a.clientId, a.refresh, { scope: "origens.write" }), ctx(T0 + 1000))).body.error).toBe("invalid_scope");
    const b = await connected();
    expect((await exchangeToken(b.store, refreshForm(b.clientId, b.refresh, { scope: "origens.read" }), ctx(T0 + 1000))).body.scope).toBe("origens.read");
    const c = await connected();
    expect((await exchangeToken(c.store, refreshForm(c.clientId, c.refresh), ctx(T0 + 1000, async () => false))).body.error).toBe("invalid_grant");
    expect(await valid(c.store, c.access)).toBe(false);
  });

  test("given an expired refresh token, then invalid_grant", async () => {
    const { store, clientId, refresh } = await connected();
    expect((await exchangeToken(store, refreshForm(clientId, refresh), ctx(T0 + 31 * 24 * 60 * 60_000))).body.error).toBe("invalid_grant");
  });
});

describe("resource server checks and revocation", () => {
  test("given a malformed, unknown, refresh-kind or scope-less token, then it is refused with the right error", async () => {
    const { store, refresh } = await connected();
    const v = (t: string) => verifyAccessToken(store, t, { resource: RESOURCE, now: T0 + 1 });
    expect(await v("not a token")).toEqual({ ok: false, error: "invalid_token" });
    expect(await v("a".repeat(43))).toEqual({ ok: false, error: "invalid_token" });
    expect(await v(refresh)).toEqual({ ok: false, error: "invalid_token" });
    const scopeless = "s".repeat(43);
    await store.saveToken(sha256Hex(scopeless), { kind: "access", familyId: "f".repeat(22), clientId: "mcp_" + "q".repeat(22), subject: "owner-1", scope: ["offline_access"], resource: RESOURCE, expiresAt: T0 + 60_000 });
    expect(await v(scopeless)).toEqual({ ok: false, error: "insufficient_scope" });
  });

  test("given a revocation, then the whole authorization stops working; an unknown token is still a 200", async () => {
    const { store, access, refresh, clientId } = await connected();
    expect(await revokeToken(store, new URLSearchParams({ token: refresh, client_id: clientId }), T0 + 1)).toEqual({ status: 200, revoked: 2 });
    expect(await valid(store, access)).toBe(false);
    expect(await revokeToken(store, new URLSearchParams({ token: "u".repeat(43) }), T0 + 1)).toEqual({ status: 200, revoked: 0 });
  });
});

describe("login return path", () => {
  test("given the consent page with its OAuth query, then the login comes back to it; anything else outside /admin is still refused", () => {
    const back = `/admin/oauth/authorize?${authorizeQuery("mcp_" + "x".repeat(32)).toString()}`;
    expect(safeNext(back)).toBe(back);
    for (const bad of ["/admin/oauth/authorize?x=<script>", "/admin/oauth/authorize?a=1#frag", "https://evil.example/admin/oauth/authorize?x=1", "/admin/oauth/authorize/../../x?y=1"]) expect(safeNext(bad), bad).toBe("/admin");
  });
});
