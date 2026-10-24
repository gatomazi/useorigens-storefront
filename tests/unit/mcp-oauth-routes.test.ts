import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { pkceChallenge } from "@/lib/mcp/auth/oauth";

/**
 * The HTTP surface of the MCP OAuth (metadata, registration, token) and the check `/api/mcp` runs, on the loopback development server
 * (ADMIN_DEV_MODE, in-memory store, the developer is the owner) and with the admin off. The consent page itself needs the admin session
 * and is exercised end to end in the browser; here an approved request is issued through the same `issueCode` the decision route calls.
 */
const ORIGIN = "http://localhost:3000";
const req = (path: string, init: RequestInit & { host?: string } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("host", init.host ?? "localhost:3000");
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ADMIN_DEV_MODE", "true");
  (globalThis as { __uoMcpOAuthStore?: unknown }).__uoMcpOAuthStore = undefined;
});
afterEach(() => vi.unstubAllEnvs());

async function connect(subject = "dev-local", scope = "origens.read offline_access") {
  const register = await import("@/app/api/mcp/oauth/register/route");
  const token = await import("@/app/api/mcp/oauth/token/route");
  const { checkAuthorizeRequest, issueCode } = await import("@/lib/mcp/auth/oauth");
  const { oauthStore } = await import("@/lib/mcp/auth/resource");
  const reg = await register.POST(req("/api/mcp/oauth/register", { method: "POST", body: JSON.stringify({ client_name: "Claude Code", redirect_uris: ["http://localhost:3118/callback"] }), headers: { "content-type": "application/json" } }));
  expect(reg.status).toBe(201);
  const clientId = ((await reg.json()) as { client_id: string }).client_id;
  const verifier = "k".repeat(64);
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "http://localhost:51000/callback", state: "s", code_challenge: pkceChallenge(verifier), code_challenge_method: "S256", scope, resource: `${ORIGIN}/api/mcp` });
  const check = await checkAuthorizeRequest(oauthStore(), q, { resource: `${ORIGIN}/api/mcp`, issuer: ORIGIN });
  if (!check.ok) throw new Error("rejected");
  const code = new URL(await issueCode(oauthStore(), check.request, subject, { issuer: ORIGIN, now: Date.now() })).searchParams.get("code")!;
  const form = new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: "http://localhost:51000/callback", resource: `${ORIGIN}/api/mcp` });
  return token.POST(req("/api/mcp/oauth/token", { method: "POST", body: form.toString(), headers: { "content-type": "application/x-www-form-urlencoded" } }));
}

describe("discovery metadata", () => {
  test("given the dev server, then the resource and authorization server metadata point at this origin and DCR only", async () => {
    const prm = await import("@/app/.well-known/oauth-protected-resource/[[...path]]/route");
    const as = await import("@/app/.well-known/oauth-authorization-server/route");
    const r = await prm.GET(req("/.well-known/oauth-protected-resource/api/mcp"), { params: Promise.resolve({ path: ["api", "mcp"] }) });
    expect(await r.json()).toMatchObject({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN], scopes_supported: ["origens.read", "origens.write"], bearer_methods_supported: ["header"] });
    expect((await prm.GET(req("/.well-known/oauth-protected-resource"), { params: Promise.resolve({}) })).status).toBe(200);
    expect((await prm.GET(req("/.well-known/oauth-protected-resource/other"), { params: Promise.resolve({ path: ["other"] }) })).status).toBe(404);
    const meta = (await (await as.GET(req("/.well-known/oauth-authorization-server"))).json()) as Record<string, unknown>;
    expect(meta).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/admin/oauth/authorize`,
      token_endpoint: `${ORIGIN}/api/mcp/oauth/token`,
      registration_endpoint: `${ORIGIN}/api/mcp/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["origens.read", "origens.write", "offline_access"],
    });
    expect(meta).not.toHaveProperty("client_id_metadata_document_supported");
  });

  test("given a host that is not loopback, or the admin off, then every endpoint is a 404", async () => {
    const as = await import("@/app/.well-known/oauth-authorization-server/route");
    expect((await as.GET(req("/.well-known/oauth-authorization-server", { host: "www.useorigens.com.br" }))).status).toBe(404);
    const { authenticateMcpRequest } = await import("@/lib/mcp/auth/resource");
    expect(((await authenticateMcpRequest(req("/api/mcp", { host: "evil.example" }))) as { response: Response }).response.status).toBe(404);
    vi.stubEnv("ADMIN_DEV_MODE", "false");
    expect((await as.GET(req("/.well-known/oauth-authorization-server"))).status).toBe(404);
  });
});

describe("token endpoint", () => {
  test("given JSON instead of a form, then invalid_request; a valid exchange answers no-store", async () => {
    const token = await import("@/app/api/mcp/oauth/token/route");
    const json = await token.POST(req("/api/mcp/oauth/token", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(json.status).toBe(400);
    const ok = await connect();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(await ok.json()).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
  });
});

describe("authenticateMcpRequest", () => {
  test("given no token, then 401 with the metadata pointer and the scope; given a bad one, then error=invalid_token", async () => {
    const { authenticateMcpRequest } = await import("@/lib/mcp/auth/resource");
    const none = (await authenticateMcpRequest(req("/api/mcp", { method: "POST" }))) as { ok: false; response: Response };
    expect(none.response.status).toBe(401);
    expect(none.response.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp", scope="origens.read"`);
    const bad = (await authenticateMcpRequest(req("/api/mcp", { method: "POST", headers: { authorization: `Bearer ${"x".repeat(43)}` } }))) as { ok: false; response: Response };
    expect(bad.response.status).toBe(401);
    expect(bad.response.headers.get("www-authenticate")).toMatch(/^Bearer error="invalid_token", resource_metadata="/);
  });

  test("given a token from the approved flow, then the grant names the owner; a token of an account that is not the owner is refused", async () => {
    const { authenticateMcpRequest } = await import("@/lib/mcp/auth/resource");
    const { access_token } = (await (await connect()).json()) as { access_token: string };
    const ok = await authenticateMcpRequest(req("/api/mcp", { method: "POST", headers: { authorization: `Bearer ${access_token}` } }));
    expect(ok).toMatchObject({ ok: true, grant: { subject: "dev-local", email: "dev@localhost", scopes: ["origens.read", "offline_access"], resource: `${ORIGIN}/api/mcp` } });
    const stranger = await connect("someone-else");
    expect(stranger.status).toBe(400); // the exchange itself is refused: not an owner
  });
});

describe("owner API key (X-Origens-Key)", () => {
  test("given the key whose hash is configured, then the owner with read and write, without any OAuth token", async () => {
    const { apiKeyHash, newApiKey } = await import("@/lib/mcp/auth/api-key");
    const key = newApiKey();
    vi.stubEnv("MCP_API_KEY_SHA256", apiKeyHash(key));
    const { authenticateMcpRequest } = await import("@/lib/mcp/auth/resource");
    const ok = await authenticateMcpRequest(req("/api/mcp", { method: "POST", headers: { "x-origens-key": key } }));
    expect(ok).toMatchObject({ ok: true, grant: { subject: "dev-local", email: "dev@localhost", clientId: "chave-api", scopes: ["origens.read", "origens.write"], resource: `${ORIGIN}/api/mcp` } });
  });

  test("given a wrong key, or a key while none is configured, then 401 invalid_token, even with a valid OAuth token alongside", async () => {
    const { apiKeyHash, newApiKey } = await import("@/lib/mcp/auth/api-key");
    const { authenticateMcpRequest } = await import("@/lib/mcp/auth/resource");
    const { access_token } = (await (await connect()).json()) as { access_token: string };
    const off = (await authenticateMcpRequest(req("/api/mcp", { method: "POST", headers: { "x-origens-key": newApiKey(), authorization: `Bearer ${access_token}` } }))) as { ok: false; response: Response };
    expect(off.response.status).toBe(401);
    expect(await off.response.json()).toMatchObject({ error: "invalid_token", error_description: "API key access is not enabled" });
    vi.stubEnv("MCP_API_KEY_SHA256", apiKeyHash(newApiKey()));
    const wrong = (await authenticateMcpRequest(req("/api/mcp", { method: "POST", headers: { "x-origens-key": newApiKey() } }))) as { ok: false; response: Response };
    expect(wrong.response.status).toBe(401);
    expect(await wrong.response.json()).toMatchObject({ error: "invalid_token", error_description: "the API key is invalid" });
  });

  test("given a malformed hash in the environment, then no key is accepted", async () => {
    const { checkApiKey, newApiKey } = await import("@/lib/mcp/auth/api-key");
    const key = newApiKey();
    expect(checkApiKey(key, "")).toBe("off");
    expect(checkApiKey(key, "abc")).toBe("off");
    expect(checkApiKey(key, "z".repeat(64))).toBe("off");
  });

  test("given a host that is not the admin's, then 404 before the key is looked at", async () => {
    const { apiKeyHash, newApiKey } = await import("@/lib/mcp/auth/api-key");
    const key = newApiKey();
    vi.stubEnv("MCP_API_KEY_SHA256", apiKeyHash(key));
    const { authenticateMcpRequest } = await import("@/lib/mcp/auth/resource");
    const r = (await authenticateMcpRequest(req("/api/mcp", { method: "POST", host: "evil.example", headers: { "x-origens-key": key } }))) as { ok: false; response: Response };
    expect(r.response.status).toBe(404);
  });
});
