/**
 * End-to-end QA of the MCP connector against a LOCAL development server (ADMIN_DEV_MODE=true, loopback): the whole OAuth flow over HTTP
 * (discovery → DCR → consent → code → token → refresh), then the official MCP client calling every tool. With real INK credentials in
 * .env.local the tools read the real stores (GET only). Prints shapes, counts and coverage — no order is printed whole.
 *   npx tsx scripts/qa/mcp-e2e.mts http://127.0.0.1:3460
 */
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://127.0.0.1:3460";
const REDIRECT = "http://127.0.0.1:53682/callback";
let failures = 0;
const check = (ok: boolean, label: string, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  ${extra}` : ""}`);
  if (!ok) failures++;
};

// 1. Discovery
const anon = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
const challenge = anon.headers.get("www-authenticate") ?? "";
check(anon.status === 401 && challenge.includes(`resource_metadata="${base}/.well-known/oauth-protected-resource/api/mcp"`), "no token → 401 with resource_metadata", challenge);
const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/api/mcp`)).json();
check(prm.resource === `${base}/api/mcp` && prm.authorization_servers?.[0] === base, "protected resource metadata", JSON.stringify(prm));
const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
check(as.code_challenge_methods_supported?.includes("S256") && as.token_endpoint_auth_methods_supported?.includes("none") && Boolean(as.registration_endpoint), "authorization server metadata");

// 2. DCR
const reg = await fetch(as.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "QA local", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }) });
const client = await reg.json();
check(reg.status === 201 && /^mcp_/.test(client.client_id), "dynamic client registration");
const evil = await fetch(as.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://evil.example/cb"] }) });
check(evil.status === 400, "a foreign redirect URI is refused at registration");

// 3. Consent (dev: the loopback developer is the owner) and decision
const verifier = randomBytes(32).toString("base64url");
const challengeS256 = createHash("sha256").update(verifier).digest("base64url");
const params = new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT.replace("53682", "61111"), state: "st-1", code_challenge: challengeS256, code_challenge_method: "S256", scope: "origens.read offline_access", resource: `${base}/api/mcp` });
const page = await fetch(`${as.authorization_endpoint}?${params}`);
const html = await page.text();
check(page.status === 200 && html.includes("Conectar ao Claude") && html.includes("127.0.0.1:61111"), "consent page shows the redirect host (loopback port changed: still matches)");
const form = new URLSearchParams(params);
form.set("decision", "approve");
const decision = await fetch(`${as.authorization_endpoint}/decision`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: base }, body: form, redirect: "manual" });
const location = new URL(decision.headers.get("location") ?? "http://x/");
check(decision.status === 303 && location.host === "127.0.0.1:61111" && location.searchParams.get("state") === "st-1" && location.searchParams.get("iss") === base, "approve → redirect with code, state and iss");
const code = location.searchParams.get("code") ?? "";

// 4. Token, refresh
const tokenRes = await fetch(as.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code, code_verifier: verifier, redirect_uri: REDIRECT.replace("53682", "61111"), resource: `${base}/api/mcp` }) });
const tokens = await tokenRes.json();
check(tokenRes.status === 200 && tokens.token_type === "Bearer" && Boolean(tokens.refresh_token), "code exchange → access + refresh");
const replay = await fetch(as.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code, code_verifier: verifier, redirect_uri: REDIRECT.replace("53682", "61111") }) });
check(replay.status === 400 && (await replay.json()).error === "invalid_grant", "the same code twice → invalid_grant (and the family is revoked)");
// The replay revoked the first grant: authorize again for a working token.
const page2 = await fetch(`${as.authorization_endpoint}?${params}`);
await page2.text();
const decision2 = await fetch(`${as.authorization_endpoint}/decision`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: base }, body: form, redirect: "manual" });
const code2 = new URL(decision2.headers.get("location")!).searchParams.get("code")!;
const t2 = await (await fetch(as.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code: code2, code_verifier: verifier, redirect_uri: REDIRECT.replace("53682", "61111") }) })).json();
const refreshed = await (await fetch(as.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: t2.refresh_token }) })).json();
check(Boolean(refreshed.access_token) && refreshed.refresh_token !== t2.refresh_token, "refresh rotates the refresh token");
const bad = await fetch(`${base}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${"x".repeat(43)}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
check(bad.status === 401 && (bad.headers.get("www-authenticate") ?? "").includes('error="invalid_token"'), "unknown token → 401 invalid_token");

// 5. MCP over Streamable HTTP with the official client
const mcp = new Client({ name: "qa", version: "1.0.0" });
await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { authorization: `Bearer ${refreshed.access_token}` } } }));
const { tools } = await mcp.listTools();
check(tools.length === 10 && tools.every((t) => t.annotations?.readOnlyHint === true), "tools/list: 10 read-only tools");
const call = async (name: string, args: Record<string, unknown>) => {
  const started = Date.now();
  const r = await mcp.callTool({ name, arguments: args });
  const out = r.structuredContent as { meta: { coverage: { status: string; reason: string | null }; data_as_of: string | null; period: unknown }; data: Record<string, unknown> } | undefined;
  if (r.isError) console.log(`      ${name} → ERROR ${(r.content as { text: string }[])[0].text}`);
  else console.log(`      ${name} → ${Date.now() - started} ms, coverage ${out?.meta.coverage.status}${out?.meta.coverage.reason ? ` (${out.meta.coverage.reason})` : ""}, data_as_of ${out?.meta.data_as_of}`);
  return { r, out };
};
const cap = await call("origens_capabilities", {});
check(!cap.r.isError, "capabilities");
const status = await call("origens_catalog_status", { include_unclassified: true, limit: 3 });
check(!status.r.isError, "catalog status", JSON.stringify((status.out?.data.stores as { store: string; cityDesigns: number; excluded: number }[] | undefined)?.map((s) => [s.store, s.cityDesigns, s.excluded])));
const search = await call("origens_search_products", { uf: "SC", city: "Tijucas", limit: 3 });
const firstProduct = (search.out?.data.products as { store: string; product_id: string; name: string }[] | undefined)?.[0];
check(!search.r.isError && Boolean(firstProduct), "search Tijucas/SC", firstProduct ? `${firstProduct.name}` : "");
if (firstProduct) {
  const prod = await call("origens_get_product", { store: firstProduct.store, product_id: firstProduct.product_id });
  const live = prod.out?.data.live as { variants_count?: number; visible_in_store?: boolean } | undefined;
  check(!prod.r.isError && (live?.variants_count ?? 0) > 0, "get product with live variants", `variants=${live?.variants_count} visible=${live?.visible_in_store}`);
}
const summary = await call("origens_sales_summary", { last_days: 30 });
const s = summary.out?.data as { orders?: number; units_net?: number; order_total?: { brl: string }; design_coverage?: { unclassified_share: number }; excluded?: unknown; ink_requests?: number } | undefined;
check(!summary.r.isError && (s?.orders ?? 0) > 0, "sales summary, last 30 days, 3 stores", `orders=${s?.orders} units=${s?.units_net} total=${s?.order_total?.brl} unclassified_share=${s?.design_coverage?.unclassified_share} reasons=${JSON.stringify((s?.design_coverage as { unclassified_by_reason?: unknown } | undefined)?.unclassified_by_reason)} excluded=${JSON.stringify(s?.excluded)} ink_requests=${s?.ink_requests}`);
const again = await call("origens_sales_summary", { last_days: 30 });
check((again.out?.data as { from_cache?: boolean }).from_cache === true, "same question again is served from the 5-minute cache");
const rank = await call("origens_sales_ranking", { last_days: 30, design_uf: "SC", dimension: "design_city", limit: 5 });
check(!rank.r.isError, "ranking of SC design cities", JSON.stringify((rank.out?.data.rows as { label: string; units_net: number }[] | undefined)?.map((r) => [r.label, r.units_net])));
const fam = await call("origens_sales_summary", { last_days: 30, family: "coordenadas" });
check(!fam.r.isError, "Coordenadas in the period", JSON.stringify({ units: (fam.out?.data as { units_net?: number }).units_net, orders: (fam.out?.data as { orders_with_matching_items?: number }).orders_with_matching_items }));
const awaiting = await call("origens_list_orders", { order_status: "awaiting_production", limit: 2 });
const awaitingData = awaiting.out?.data as { total_orders?: number; production_delayed?: number; orders?: { store: string; order_id: string }[] } | undefined;
check(!awaiting.r.isError, "orders awaiting production", `total=${awaitingData?.total_orders} production_delayed=${awaitingData?.production_delayed}`);
const one = awaitingData?.orders?.[0];
if (one) {
  const o = await call("origens_get_order", { store: one.store, order_id: one.order_id });
  const text = JSON.stringify(o.r);
  check(!o.r.isError && !/"(buyer|email|phone|document|street|cep|billing_address|pix|payment_method)"/.test(text), "get order: no personal-data keys in the answer");
}
const cats = await call("origens_list_categories", { visibility: "public" });
check(!cats.r.isError && ((cats.out?.data.total_matches as number | undefined) ?? 0) > 0, "public INK categories", `total=${cats.out?.data.total_matches}`);
const byCategory = await call("origens_sales_ranking", { last_days: 30, dimension: "category", limit: 5 });
const bc = byCategory.out?.data as { rows?: { label: string; units_net: number }[]; category_coverage?: { membership_unknown_share: number } } | undefined;
check(!byCategory.r.isError && (bc?.rows?.length ?? 0) > 0, "ranking by public category", `${JSON.stringify(bc?.rows?.map((r) => [r.label, r.units_net]))} unknown_share=${bc?.category_coverage?.membership_unknown_share}`);
const promos = await call("origens_promotions", { last_days: 30 });
const pu = promos.out?.data.usage as { orders_in_period?: number; orders_with_code?: number; by_code?: { code: string; orders: number }[] } | undefined;
check(!promos.r.isError && (pu?.orders_in_period ?? 0) > 0, "coupons: panel + usage on the orders", `with_code=${pu?.orders_with_code}/${pu?.orders_in_period} codes=${JSON.stringify(pu?.by_code?.slice(0, 5).map((c) => [c.code, c.orders]))}`);
const onSale = await call("origens_search_products", { on_sale: true, limit: 1 });
check(!onSale.r.isError, "products on sale", `total=${onSale.out?.data.total_matches}`);
const tooLong = await call("origens_sales_summary", { start_date: "2025-01-01", end_date: "2026-10-01" });
check(tooLong.r.isError === true, "a period over 186 days is refused, not truncated");
await mcp.close();
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
