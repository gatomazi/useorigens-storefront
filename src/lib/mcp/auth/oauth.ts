import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AUTHORIZE_PARAM_NAMES } from "./authorize-params";
import { sha256Hex, type OAuthClient, type OAuthStore, type TokenRecord } from "./store";

/**
 * The OAuth 2.1 authorization server of the MCP connector, implemented directly on the specifications (RFC 6749 / OAuth 2.1, RFC 7636
 * PKCE, RFC 7591 registration, RFC 7009 revocation, RFC 8707 resource indicators), with `node:crypto` only — the same approach as the
 * admin's own login (src/lib/admin/auth/oidc.ts). Everything that decides trust is here, free of HTTP and Next, and unit-tested:
 *   - only public clients, registered by DCR, whose redirect URIs are Claude's own callback or a loopback address (Claude Code, Inspector);
 *   - authorization codes live 60 s, are single-use (a second exchange revokes everything issued from the first) and require PKCE S256;
 *   - access tokens are opaque, 1 h, bound to the MCP resource URL; refresh tokens rotate on every use and a reused one revokes the family;
 *   - nothing but sha256 of a code or token is ever stored, and every secret comparison is constant-time.
 * Who may authorize (the active owner) is decided by the caller (`subjectAllowed`); the store only keeps what was issued.
 */

export const MCP_SCOPE = "origens.read";
/** Confirmed changes in INK (products, categories, order items, exchanges). Granted only when the owner ticks it on the consent page. */
export const WRITE_SCOPE = "origens.write";
export const OFFLINE_SCOPE = "offline_access";
export const SUPPORTED_SCOPES: readonly string[] = [MCP_SCOPE, WRITE_SCOPE, OFFLINE_SCOPE];
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

export const CODE_TTL_MS = 60_000;
export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
/** A refresh token presented again within this window after its rotation is refused WITHOUT revoking the family (parallel refreshes). */
export const ROTATION_GRACE_MS = 60_000;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/; // base64url(sha256(verifier))
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/; // RFC 7636 §4.1
const CLIENT_ID_RE = /^mcp_[A-Za-z0-9_-]{22,64}$/;
const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 500;
const MAX_STATE_LENGTH = 500;

const b64u = (b: Buffer): string => b.toString("base64url");
const randomToken = (): string => b64u(randomBytes(32));
export const newClientId = (): string => `mcp_${b64u(randomBytes(24))}`;
const newFamilyId = (): string => b64u(randomBytes(24));
export const pkceChallenge = (verifier: string): string => b64u(createHash("sha256").update(verifier).digest());

export const constantTimeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// ── Redirect URIs ────────────────────────────────────────────────────────────────────────────────────────────────

function parseUri(raw: string): URL | null {
  if (raw.length === 0 || raw.length > MAX_URI_LENGTH) return null;
  try {
    const u = new URL(raw);
    return u.username || u.password || u.hash ? null : u;
  } catch {
    return null;
  }
}

/** `http://localhost:<port>/…` or `http://127.0.0.1:<port>/…` (RFC 8252 §7.3): Claude Code and the MCP Inspector. */
export function isLoopbackRedirect(raw: string): boolean {
  const u = parseUri(raw);
  return u !== null && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

/** The only redirect URIs a client may register: Claude's hosted callback, exactly, or a loopback address. */
export const isAllowedRedirectUri = (raw: string): boolean => raw === CLAUDE_CALLBACK || isLoopbackRedirect(raw);

/** Exact match, except that a loopback URI matches whatever port it is presented with (the port changes every session). */
export function redirectMatches(registered: readonly string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  if (!isLoopbackRedirect(requested)) return false;
  const r = new URL(requested);
  return registered.some((raw) => {
    if (!isLoopbackRedirect(raw)) return false;
    const u = new URL(raw);
    return u.hostname === r.hostname && u.pathname === r.pathname && u.search === r.search;
  });
}

// ── Dynamic client registration (RFC 7591) ───────────────────────────────────────────────────────────────────────

export type Outcome = { status: number; body: Record<string, unknown> };

const registrationError = (error: "invalid_redirect_uri" | "invalid_client_metadata", description: string): Outcome => ({ status: 400, body: { error, error_description: description } });

export async function registerClient(store: OAuthStore, raw: unknown, newId: () => string = newClientId): Promise<Outcome> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return registrationError("invalid_client_metadata", "the body must be a JSON object");
  const m = raw as Record<string, unknown>;
  const uris = m.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS || !uris.every((u): u is string => typeof u === "string")) {
    return registrationError("invalid_redirect_uri", "redirect_uris must list 1 to 10 URIs");
  }
  if (!uris.every(isAllowedRedirectUri)) return registrationError("invalid_redirect_uri", `only ${CLAUDE_CALLBACK} or a loopback address (http://localhost or http://127.0.0.1) is accepted`);
  if (m.token_endpoint_auth_method !== undefined && m.token_endpoint_auth_method !== "none") return registrationError("invalid_client_metadata", "only public clients (token_endpoint_auth_method none) are supported");
  if (m.grant_types !== undefined && (!Array.isArray(m.grant_types) || !m.grant_types.every((g) => g === "authorization_code" || g === "refresh_token"))) {
    return registrationError("invalid_client_metadata", "grant_types may only contain authorization_code and refresh_token");
  }
  if (m.response_types !== undefined && (!Array.isArray(m.response_types) || !m.response_types.every((t) => t === "code"))) return registrationError("invalid_client_metadata", "response_types may only contain code");
  let clientName: string | null = null;
  if (m.client_name !== undefined) {
    if (typeof m.client_name !== "string" || m.client_name.trim().length === 0 || m.client_name.trim().length > 100) return registrationError("invalid_client_metadata", "client_name must have 1 to 100 characters");
    clientName = m.client_name.trim();
  }
  const client = await store.createClient({ clientId: newId(), clientName, redirectUris: [...new Set(uris)] });
  return {
    status: 201,
    body: {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(new Date(client.createdAt).getTime() / 1000),
      ...(client.clientName ? { client_name: client.clientName } : {}),
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}

// ── Authorization request ────────────────────────────────────────────────────────────────────────────────────────

export type AuthorizeRequest = { client: OAuthClient; redirectUri: string; state: string | null; codeChallenge: string; scope: string[]; resource: string };
export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest }
  /** The client or its redirect URI could not be trusted: shown as a page, never redirected anywhere. */
  | { ok: false; kind: "page"; message: string }
  | { ok: false; kind: "redirect"; url: string };

/** The redirect back to the client with an error (RFC 6749 §4.1.2.1) plus `iss` (RFC 9207). */
export function errorRedirect(redirectUri: string, error: string, description: string, state: string | null, issuer: string): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", description);
  if (state !== null) u.searchParams.set("state", state);
  u.searchParams.set("iss", issuer);
  return u.href;
}

/** Requested scopes: space-separated, every one supported; `origens.read` is always part of the grant (every tool needs it). */
export function parseScope(raw: string | null): string[] | null {
  const requested = (raw ?? "").split(" ").filter(Boolean);
  if (!requested.every((s) => SUPPORTED_SCOPES.includes(s))) return null;
  return SUPPORTED_SCOPES.filter((s) => s === MCP_SCOPE || requested.includes(s));
}

/**
 * The owner's own choice on the consent page decides `origens.write`, whatever the client asked: unticked removes it, ticked adds it (the
 * token response then states the granted scope, RFC 6749 §3.3). A client asking for it only pre-ticks the box.
 */
export const withWriteChoice = (scope: readonly string[], allowWrite: boolean): string[] => SUPPORTED_SCOPES.filter((s) => (s === WRITE_SCOPE ? allowWrite : scope.includes(s)));

export async function checkAuthorizeRequest(store: OAuthStore, params: URLSearchParams, ctx: { resource: string; issuer: string }): Promise<AuthorizeCheck> {
  const page = (message: string): AuthorizeCheck => ({ ok: false, kind: "page", message });
  if (AUTHORIZE_PARAM_NAMES.some((name) => params.getAll(name).length > 1)) return page("O pedido de autorização repete parâmetros.");
  const clientId = params.get("client_id") ?? "";
  const client = CLIENT_ID_RE.test(clientId) ? await store.findClient(clientId) : null;
  if (!client) return page("Este aplicativo não está registrado. Volte ao Claude e conecte de novo.");
  const requested = params.get("redirect_uri");
  const redirectUri = requested ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) return page("O endereço de retorno não confere com o registrado para este aplicativo.");

  const state = params.get("state");
  const fail = (error: string, description: string): AuthorizeCheck => ({ ok: false, kind: "redirect", url: errorRedirect(redirectUri, error, description, state !== null && state.length <= MAX_STATE_LENGTH ? state : null, ctx.issuer) });
  if (state !== null && state.length > MAX_STATE_LENGTH) return fail("invalid_request", "state is too long");
  if (params.get("response_type") !== "code") return fail("unsupported_response_type", "only response_type=code is supported");
  const codeChallenge = params.get("code_challenge") ?? "";
  if (params.get("code_challenge_method") !== "S256" || !CHALLENGE_RE.test(codeChallenge)) return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
  const scope = parseScope(params.get("scope"));
  if (!scope) return fail("invalid_scope", `supported scopes: ${SUPPORTED_SCOPES.join(" ")}`);
  const resource = params.get("resource");
  if (resource !== null && resource !== ctx.resource) return fail("invalid_target", `the only resource is ${ctx.resource}`);
  return { ok: true, request: { client, redirectUri, state, codeChallenge, scope, resource: ctx.resource } };
}

/** Stores a fresh single-use code for an approved request and returns where to send the browser. */
export async function issueCode(store: OAuthStore, request: AuthorizeRequest, subject: string, ctx: { issuer: string; now: number }): Promise<string> {
  const code = randomToken();
  await store.saveCode(sha256Hex(code), {
    clientId: request.client.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope: request.scope,
    resource: request.resource,
    subject,
    familyId: newFamilyId(),
    expiresAt: ctx.now + CODE_TTL_MS,
  });
  const u = new URL(request.redirectUri);
  u.searchParams.set("code", code);
  if (request.state !== null) u.searchParams.set("state", request.state);
  u.searchParams.set("iss", ctx.issuer);
  return u.href;
}

// ── Token endpoint ───────────────────────────────────────────────────────────────────────────────────────────────

export type TokenContext = { resource: string; now: number; subjectAllowed: (subject: string) => Promise<boolean> };

const tokenError = (error: "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type" | "invalid_scope" | "invalid_target", description: string): Outcome => ({
  status: error === "invalid_client" ? 401 : 400,
  body: { error, error_description: description },
});

async function issueTokens(store: OAuthStore, grant: { familyId: string; clientId: string; subject: string; scope: string[]; resource: string }, now: number): Promise<Outcome> {
  const access = randomToken();
  const refresh = randomToken();
  await store.saveToken(sha256Hex(access), { kind: "access", ...grant, expiresAt: now + ACCESS_TTL_S * 1000 });
  await store.saveToken(sha256Hex(refresh), { kind: "refresh", ...grant, expiresAt: now + REFRESH_TTL_MS });
  await store.touchClient(grant.clientId, now).catch(() => undefined);
  return { status: 200, body: { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: grant.scope.join(" ") } };
}

const single = (form: URLSearchParams, name: string): string | null => {
  const values = form.getAll(name);
  return values.length === 1 ? values[0] : null;
};

export async function exchangeToken(store: OAuthStore, form: URLSearchParams, ctx: TokenContext): Promise<Outcome> {
  if (["grant_type", "code", "redirect_uri", "client_id", "code_verifier", "refresh_token", "resource", "scope"].some((n) => form.getAll(n).length > 1)) return tokenError("invalid_request", "repeated parameter");
  const grantType = single(form, "grant_type");
  const clientId = single(form, "client_id") ?? "";
  if (grantType !== "authorization_code" && grantType !== "refresh_token") return tokenError(grantType ? "unsupported_grant_type" : "invalid_request", "grant_type must be authorization_code or refresh_token");
  if (!CLIENT_ID_RE.test(clientId)) return tokenError("invalid_client", "unknown client");
  const client = await store.findClient(clientId);
  if (!client) return tokenError("invalid_client", "unknown client");
  const resource = single(form, "resource");
  if (resource !== null && resource !== ctx.resource) return tokenError("invalid_target", `the only resource is ${ctx.resource}`);

  if (grantType === "authorization_code") {
    const code = single(form, "code") ?? "";
    const verifier = single(form, "code_verifier") ?? "";
    const redirectUri = single(form, "redirect_uri");
    if (!TOKEN_RE.test(code) || !VERIFIER_RE.test(verifier)) return tokenError("invalid_request", "code and a valid code_verifier are required");
    const consumed = await store.consumeCode(sha256Hex(code), ctx.now);
    if (!consumed) return tokenError("invalid_grant", "unknown authorization code");
    const record = consumed.record;
    if (consumed.status === "reused") {
      // A replayed code means it leaked: whatever was issued from it is revoked (RFC 6749 §4.1.2, OAuth 2.1 §4.1.3).
      await store.revokeFamily(record.familyId, ctx.now);
      return tokenError("invalid_grant", "authorization code already used");
    }
    if (record.clientId !== client.clientId) return tokenError("invalid_grant", "the code was issued to another client");
    if (record.expiresAt <= ctx.now) return tokenError("invalid_grant", "authorization code expired");
    if (redirectUri !== record.redirectUri) return tokenError("invalid_grant", "redirect_uri does not match the authorization request");
    if (record.resource !== ctx.resource) return tokenError("invalid_grant", "the code was issued for another resource");
    if (!constantTimeEqual(pkceChallenge(verifier), record.codeChallenge)) return tokenError("invalid_grant", "PKCE verification failed");
    if (!(await ctx.subjectAllowed(record.subject))) return tokenError("invalid_grant", "the authorizing account no longer has access");
    return issueTokens(store, { familyId: record.familyId, clientId: client.clientId, subject: record.subject, scope: record.scope, resource: record.resource }, ctx.now);
  }

  const refresh = single(form, "refresh_token") ?? "";
  if (!TOKEN_RE.test(refresh)) return tokenError("invalid_request", "refresh_token is required");
  const rotated = await store.rotateRefresh(sha256Hex(refresh), ctx.now);
  if (!rotated) return tokenError("invalid_grant", "unknown refresh token");
  const record = rotated.record;
  if (rotated.status === "revoked") {
    // Presented again right after its own rotation: two refreshes in flight, not a theft. Anything later is a reuse.
    const justRotated = record.revokedAt !== null && ctx.now - record.revokedAt < ROTATION_GRACE_MS;
    if (!justRotated) await store.revokeFamily(record.familyId, ctx.now);
    return tokenError("invalid_grant", "refresh token is no longer valid");
  }
  if (record.clientId !== client.clientId) {
    await store.revokeFamily(record.familyId, ctx.now);
    return tokenError("invalid_grant", "the refresh token was issued to another client");
  }
  if (record.expiresAt <= ctx.now) return tokenError("invalid_grant", "refresh token expired");
  if (record.resource !== ctx.resource) return tokenError("invalid_grant", "the refresh token was issued for another resource");
  let scope = record.scope;
  const requestedScope = single(form, "scope");
  if (requestedScope !== null) {
    const narrowed = requestedScope.split(" ").filter(Boolean);
    if (narrowed.length === 0 || !narrowed.every((s) => record.scope.includes(s))) return tokenError("invalid_scope", "the scope may only narrow the original grant");
    scope = record.scope.filter((s) => narrowed.includes(s));
  }
  if (!(await ctx.subjectAllowed(record.subject))) {
    await store.revokeFamily(record.familyId, ctx.now);
    return tokenError("invalid_grant", "the authorizing account no longer has access");
  }
  return issueTokens(store, { familyId: record.familyId, clientId: client.clientId, subject: record.subject, scope, resource: record.resource }, ctx.now);
}

// ── Revocation (RFC 7009) ────────────────────────────────────────────────────────────────────────────────────────

/** Revokes the whole authorization a token belongs to. Always 200, known token or not (RFC 7009 §2.2). */
export async function revokeToken(store: OAuthStore, form: URLSearchParams, now: number): Promise<{ status: number; revoked: number }> {
  const token = form.get("token") ?? "";
  if (!TOKEN_RE.test(token)) return { status: 200, revoked: 0 };
  const record = await store.findToken(sha256Hex(token));
  const clientId = form.get("client_id");
  if (!record || (clientId !== null && clientId !== record.clientId)) return { status: 200, revoked: 0 };
  return { status: 200, revoked: await store.revokeFamily(record.familyId, now) };
}

// ── Resource server side ─────────────────────────────────────────────────────────────────────────────────────────

export type VerifyResult = { ok: true; record: TokenRecord } | { ok: false; error: "invalid_token" | "insufficient_scope" };

export async function verifyAccessToken(store: OAuthStore, token: string, ctx: { resource: string; now: number }): Promise<VerifyResult> {
  if (!TOKEN_RE.test(token)) return { ok: false, error: "invalid_token" };
  const record = await store.findToken(sha256Hex(token));
  if (!record || record.kind !== "access" || record.revokedAt !== null || record.expiresAt <= ctx.now || record.resource !== ctx.resource) return { ok: false, error: "invalid_token" };
  if (!record.scope.includes(MCP_SCOPE)) return { ok: false, error: "insufficient_scope" };
  return { ok: true, record };
}
