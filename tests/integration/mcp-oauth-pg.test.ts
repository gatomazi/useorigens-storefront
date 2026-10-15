import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Db } from "@/lib/admin/db/db";
import { loadMigrations, migrate } from "@/lib/admin/db/migrate";
import { createPgliteDb } from "@/lib/admin/db/pglite-db";
import { pgUserRepository } from "@/lib/admin/store/pg-stores";
import { checkAuthorizeRequest, exchangeToken, issueCode, pkceChallenge, registerClient, revokeToken, verifyAccessToken } from "@/lib/mcp/auth/oauth";
import { pgOAuthStore } from "@/lib/mcp/auth/pg-store";
import { PURGE_GRACE_MS, sha256Hex, type OAuthStore } from "@/lib/mcp/auth/store";

/**
 * The MCP OAuth flow against the real schema (PGlite): what the unit tests prove with the in-memory store must hold on PostgreSQL too —
 * one winner when the same code is exchanged twice at once, rotation and reuse detection, revocation, purge, and only hashes at rest.
 */
let db: Db;
let store: OAuthStore;
let owner: string;
const RESOURCE = "https://www.useorigens.com.br/api/mcp";
const ISSUER = "https://www.useorigens.com.br";
const VERIFIER = "v".repeat(43) + "-._~0123456789";
const allowed = async () => true;

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db, loadMigrations(path.join(process.cwd(), "db", "migrations")));
  store = pgOAuthStore(db);
  owner = (await pgUserRepository(db).create({ email: "dono@example.com", name: null, role: "owner", scopes: [] })).id;
});
afterAll(async () => db.close());

async function authorizedCode(now: number, scope = "origens.read offline_access") {
  const reg = await registerClient(store, { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
  const clientId = String(reg.body.client_id);
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "https://claude.ai/api/mcp/auth_callback", state: "s1", code_challenge: pkceChallenge(VERIFIER), code_challenge_method: "S256", scope, resource: RESOURCE });
  const check = await checkAuthorizeRequest(store, params, { resource: RESOURCE, issuer: ISSUER });
  if (!check.ok) throw new Error("authorize request refused");
  const url = new URL(await issueCode(store, check.request, owner, { issuer: ISSUER, now }));
  return { clientId, code: url.searchParams.get("code")!, url };
}

const exchange = (form: Record<string, string>, now: number) => exchangeToken(store, new URLSearchParams(form), { resource: RESOURCE, now, subjectAllowed: allowed });

describe("MCP OAuth on PostgreSQL", () => {
  test("code → tokens; the code is single-use even when two exchanges race; only hashes are stored", async () => {
    const now = Date.now();
    const { clientId, code, url } = await authorizedCode(now);
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("iss")).toBe(ISSUER);
    const form = { grant_type: "authorization_code", client_id: clientId, code, code_verifier: VERIFIER, redirect_uri: "https://claude.ai/api/mcp/auth_callback", resource: RESOURCE };
    const [a, b] = await Promise.all([exchange(form, now + 1000), exchange(form, now + 1000)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 400]);
    const ok = a.status === 200 ? a : b;
    const loser = a.status === 200 ? b : a;
    expect(loser.body.error).toBe("invalid_grant");
    // Whether the loser's family revocation lands before or after the winner's tokens are written depends on timing, so it is not
    // asserted here; a replay AFTER the exchange always revokes (next line), which is the case that matters for a leaked code.
    expect((await exchange(form, now + 3000)).body.error).toBe("invalid_grant");
    expect((await verifyAccessToken(store, String(ok.body.access_token), { resource: RESOURCE, now: now + 4000 })).ok).toBe(false);
    const rows = await db.query<{ token_hash: string }>("select token_hash from mcp_oauth_token");
    expect(rows.rows.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash))).toBe(true);
    expect(JSON.stringify(rows.rows)).not.toContain(String(ok.body.access_token));
    expect((await db.query("select 1 from mcp_oauth_code where code_hash = $1", [sha256Hex(code)])).rowCount).toBe(1);
  });

  test("refresh rotates; an old refresh token presented after the grace window revokes the whole authorization", async () => {
    const t0 = Date.now();
    const { clientId, code } = await authorizedCode(t0);
    const first = await exchange({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: VERIFIER, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }, t0 + 1000);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "origens.read offline_access" });
    const r1 = String(first.body.refresh_token);
    const second = await exchange({ grant_type: "refresh_token", client_id: clientId, refresh_token: r1 }, t0 + 60_000);
    expect(second.status).toBe(200);
    expect(second.body.refresh_token).not.toBe(r1);
    const access2 = String(second.body.access_token);
    expect((await verifyAccessToken(store, access2, { resource: RESOURCE, now: t0 + 61_000 })).ok).toBe(true);
    // Within the grace window a second refresh with r1 is refused without revoking (parallel refreshes).
    expect((await exchange({ grant_type: "refresh_token", client_id: clientId, refresh_token: r1 }, t0 + 70_000)).body.error).toBe("invalid_grant");
    expect((await verifyAccessToken(store, access2, { resource: RESOURCE, now: t0 + 71_000 })).ok).toBe(true);
    // Much later, r1 again: a stolen token being replayed — everything of this authorization goes.
    expect((await exchange({ grant_type: "refresh_token", client_id: clientId, refresh_token: r1 }, t0 + 10 * 60_000)).body.error).toBe("invalid_grant");
    expect((await verifyAccessToken(store, access2, { resource: RESOURCE, now: t0 + 10 * 60_000 + 1 })).ok).toBe(false);
    expect((await exchange({ grant_type: "refresh_token", client_id: clientId, refresh_token: String(second.body.refresh_token) }, t0 + 11 * 60_000)).body.error).toBe("invalid_grant");
  });

  test("wrong verifier, wrong redirect, other resource and an access token used for another resource all fail", async () => {
    const now = Date.now();
    const a = await authorizedCode(now);
    expect((await exchange({ grant_type: "authorization_code", client_id: a.clientId, code: a.code, code_verifier: "w".repeat(43), redirect_uri: "https://claude.ai/api/mcp/auth_callback" }, now + 1)).body.error).toBe("invalid_grant");
    const b = await authorizedCode(now);
    expect((await exchange({ grant_type: "authorization_code", client_id: b.clientId, code: b.code, code_verifier: VERIFIER, redirect_uri: "http://localhost:3000/callback" }, now + 1)).body.error).toBe("invalid_grant");
    const c = await authorizedCode(now);
    expect((await exchange({ grant_type: "authorization_code", client_id: c.clientId, code: c.code, code_verifier: VERIFIER, redirect_uri: "https://claude.ai/api/mcp/auth_callback", resource: "https://evil.example/api/mcp" }, now + 1)).body.error).toBe("invalid_target");
    const d = await authorizedCode(now);
    const ok = await exchange({ grant_type: "authorization_code", client_id: d.clientId, code: d.code, code_verifier: VERIFIER, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }, now + 1);
    expect((await verifyAccessToken(store, String(ok.body.access_token), { resource: "https://outro.example/api/mcp", now: now + 2 })).ok).toBe(false);
    // An expired code.
    const e = await authorizedCode(now);
    expect((await exchange({ grant_type: "authorization_code", client_id: e.clientId, code: e.code, code_verifier: VERIFIER, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }, now + 61_000)).body.error).toBe("invalid_grant");
  });

  test("revocation cuts the authorization; purge removes only what expired more than a day ago", async () => {
    const now = Date.now();
    const { clientId, code } = await authorizedCode(now);
    const ok = await exchange({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: VERIFIER, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }, now + 1);
    const access = String(ok.body.access_token);
    const revoked = await revokeToken(store, new URLSearchParams({ token: String(ok.body.refresh_token) }), now + 2);
    expect(revoked).toEqual({ status: 200, revoked: 2 });
    expect((await verifyAccessToken(store, access, { resource: RESOURCE, now: now + 3 })).ok).toBe(false);
    const before = (await db.query("select 1 from mcp_oauth_token")).rowCount;
    expect(await store.purgeExpired(now)).toBe(0);
    expect(await store.purgeExpired(now + 31 * 24 * 60 * 60_000 + PURGE_GRACE_MS)).toBeGreaterThanOrEqual(before);
    expect((await db.query("select 1 from mcp_oauth_token")).rowCount).toBe(0);
  });

  test("deactivating the owner's account removes nothing silently but the account check refuses new tokens", async () => {
    const now = Date.now();
    const { clientId, code } = await authorizedCode(now);
    const refused = await exchangeToken(store, new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: VERIFIER, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }), { resource: RESOURCE, now: now + 1, subjectAllowed: async () => false });
    expect(refused).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
  });
});
