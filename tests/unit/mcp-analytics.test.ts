import { createVerify, generateKeyPairSync } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";
import { ga4FromEnv, signAssertion, type Ga4Client, type Ga4ReportRequest } from "@/lib/mcp/analytics/client";
import { analyticsCapabilities, analyticsRunReport } from "@/lib/mcp/analytics/tools";
import { McpToolError } from "@/lib/mcp/errors";
import { createUseOrigensMcpServer } from "@/lib/mcp/server";
import type { AllDeps } from "@/lib/mcp/write-tools";

const NOW = new Date("2026-11-09T15:00:00Z");
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const keyB64 = Buffer.from(JSON.stringify({ client_email: "leitor@projeto.iam.gserviceaccount.com", private_key: privateKey })).toString("base64");

function fakeClient(report: object = {}, requests: Ga4ReportRequest[] = []): Ga4Client {
  return {
    propertyId: "123456789",
    runReport: async (r) => {
      requests.push(r);
      return report;
    },
    getMetadata: async () => ({
      dimensions: [
        { apiName: "eventName", uiName: "Event name", category: "Event" },
        { apiName: "customEvent:entry_point", uiName: "entry_point", customDefinition: true, category: "Custom" },
      ],
      metrics: [{ apiName: "eventCount", uiName: "Event count" }],
    }),
  };
}
const deps = (analytics: Ga4Client | null = fakeClient()) => ({ now: () => NOW, analytics });
const failure = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as McpToolError);

describe("GA4 client", () => {
  test("the assertion is an RS256 JWT of the service account, valid for an hour, that the key's public half verifies", () => {
    const jwt = signAssertion({ clientEmail: "a@b.iam", privateKey }, 1_000);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "a@b.iam", scope: "https://www.googleapis.com/auth/analytics.readonly", aud: "https://oauth2.googleapis.com/token", iat: 1_000, exp: 4_600 });
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });

  test("without the property id or with a key that is not a service account key there is no client (the tools then answer MISSING_CREDENTIAL)", () => {
    expect(ga4FromEnv({})).toBeNull();
    expect(ga4FromEnv({ GA4_PROPERTY_ID: "123", GA4_SERVICE_ACCOUNT_JSON_B64: "bm90IGpzb24=" })).toBeNull();
    expect(ga4FromEnv({ GA4_PROPERTY_ID: "G-ABC123", GA4_SERVICE_ACCOUNT_JSON_B64: keyB64 })).toBeNull();
  });

  test("one token serves many requests; the request goes to the fixed property, with the bearer token and the report body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.includes("oauth2") ? Response.json({ access_token: "tok", expires_in: 3600 }) : Response.json({ rows: [] });
    }) as unknown as typeof fetch;
    const client = ga4FromEnv({ GA4_PROPERTY_ID: "123456789", GA4_SERVICE_ACCOUNT_JSON_B64: keyB64 }, fetchFn, () => NOW.getTime())!;
    await client.runReport({ dateRanges: [{ startDate: "2026-11-01", endDate: "2026-11-02" }], dimensions: [], metrics: [{ name: "eventCount" }], limit: "10" });
    await client.getMetadata();
    expect(calls.map((c) => c.url)).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport",
      "https://analyticsdata.googleapis.com/v1beta/properties/123456789/metadata",
    ]);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(String(calls[0].init.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
  });

  test("403 is said as 'no access to the property', a Google refusal of the key as upstream, and neither message carries the key", async () => {
    const make = (status: number, onToken = false) =>
      ga4FromEnv({ GA4_PROPERTY_ID: "1", GA4_SERVICE_ACCOUNT_JSON_B64: keyB64 }, (async (url: string) => (url.includes("oauth2") ? (onToken ? new Response("{}", { status }) : Response.json({ access_token: "t" })) : new Response("{}", { status }))) as unknown as typeof fetch, () => NOW.getTime())!;
    const denied = await failure(make(403).getMetadata());
    expect(denied?.code).toBe("FORBIDDEN");
    const bad = await failure(make(401, true).getMetadata());
    expect(bad?.code).toBe("UPSTREAM_UNAVAILABLE");
    for (const e of [denied, bad]) expect(e?.message).not.toContain("PRIVATE KEY");
  });
});

describe("GA4 tools", () => {
  test("a server without GA4 credentials answers MISSING_CREDENTIAL", async () => {
    expect((await failure(analyticsRunReport(deps(null), { metrics: ["eventCount"] })))?.code).toBe("MISSING_CREDENTIAL");
    expect((await failure(analyticsCapabilities(deps(null))))?.code).toBe("MISSING_CREDENTIAL");
  });

  test("capabilities lists the custom dimensions first and filters by text", async () => {
    const r = await analyticsCapabilities(deps(), {});
    expect((r.data.dimensions as { name: string }[])[0].name).toBe("customEvent:entry_point");
    const only = await analyticsCapabilities(deps(), { search: "event count", kind: "metric" });
    expect(only.data.metrics).toEqual([{ name: "eventCount", label: "Event count" }]);
    expect(only.data.dimensions).toEqual([]);
  });

  test("the report asks Google for the period in São Paulo days, the filters ANDed, a metric order and the row cap; rows come back as named values", async () => {
    const requests: Ga4ReportRequest[] = [];
    const client = fakeClient(
      { dimensionHeaders: [{ name: "eventName" }], metricHeaders: [{ name: "eventCount" }], rows: [{ dimensionValues: [{ value: "origens_sua_cidade_open" }], metricValues: [{ value: "42" }] }], rowCount: 1, metadata: { timeZone: "America/Sao_Paulo" } },
      requests,
    );
    const r = await analyticsRunReport(deps(client), {
      last_days: 7,
      dimensions: ["eventName"],
      metrics: ["eventCount"],
      filters: [{ field: "eventName", match: "begins_with", value: "origens_sua_cidade" }, { field: "customEvent:entry_point", value: "landing" }],
      order_by: { field: "eventCount" },
      limit: 999,
    });
    expect(requests[0]).toMatchObject({
      dateRanges: [{ startDate: "2026-11-02", endDate: "2026-11-08" }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: "250",
    });
    expect(requests[0].dimensionFilter).toEqual({
      andGroup: {
        expressions: [
          { filter: { fieldName: "eventName", stringFilter: { matchType: "BEGINS_WITH", value: "origens_sua_cidade", caseSensitive: false } } },
          { filter: { fieldName: "customEvent:entry_point", stringFilter: { matchType: "EXACT", value: "landing", caseSensitive: false } } },
        ],
      },
    });
    expect(r.data.rows).toEqual([{ eventName: "origens_sua_cidade_open", eventCount: 42 }]);
    expect(r.meta).toMatchObject({ source: "ga4_api", coverage: { status: "complete" }, period: { start_date: "2026-11-02", end_date: "2026-11-08" } });
    expect(JSON.stringify(r.data.notes)).toContain("piso");
  });

  test("sampling, thresholding, '(other)' and a cut at the row limit make the coverage partial, and say why", async () => {
    const client = fakeClient({ dimensionHeaders: [], metricHeaders: [{ name: "sessions" }], rows: [{ metricValues: [{ value: "5" }] }], rowCount: 9, metadata: { samplingMetadatas: [{}], subjectToThresholding: true, dataLossFromOtherRow: true } });
    const r = await analyticsRunReport(deps(client), { metrics: ["sessions"], limit: 1 });
    expect(r.meta.coverage.status).toBe("partial");
    for (const word of ["amostrou", "limite mínimo", "(other)", "1 de 9"]) expect(r.meta.coverage.reason).toContain(word);
  });

  test("bad names, too many fields, a field not asked for in order_by and a one-sided date range are refused before Google is called", async () => {
    const requests: Ga4ReportRequest[] = [];
    const d = deps(fakeClient({}, requests));
    expect((await failure(analyticsRunReport(d, { metrics: ["event Count"] })))?.code).toBe("INVALID_INPUT");
    expect((await failure(analyticsRunReport(d, { metrics: ["eventCount"], dimensions: Array.from({ length: 10 }, (_, i) => `d${i}`) })))?.code).toBe("INVALID_INPUT");
    expect((await failure(analyticsRunReport(d, { metrics: ["eventCount"], order_by: { field: "sessions" } })))?.code).toBe("INVALID_INPUT");
    expect((await failure(analyticsRunReport(d, { metrics: ["eventCount"], start_date: "2026-11-01" })))?.code).toBe("INVALID_INPUT");
    expect((await failure(analyticsRunReport(d, { metrics: ["eventCount"], filters: [{ field: "eventName", match: "in_list" }] })))?.code).toBe("INVALID_INPUT");
    expect(requests).toHaveLength(0);
  });
});

describe("GA4 tools through the MCP protocol", () => {
  const GRANT = { subject: "01J00000000000000000000000", email: "dono@example.com", clientId: "mcp_testclient000000000000", scopes: ["origens.read"], expiresAt: 2_000_000_000, resource: "https://www.useorigens.com.br/api/mcp" };
  const connect = async (analytics: Ga4Client | null) => {
    const server = createUseOrigensMcpServer(GRANT, { now: () => NOW, analytics, stores: ["use-sul"], singleStore: true, hasCredential: () => true } as unknown as AllDeps, () => undefined);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(b);
    return client;
  };

  test("the two tools exist only when this server has GA4, both read-only, and a call is answered with the common meta", async () => {
    expect((await (await connect(null)).listTools()).tools.map((t) => t.name)).not.toContain("analytics_run_report");
    const client = await connect(fakeClient({ dimensionHeaders: [], metricHeaders: [{ name: "sessions" }], rows: [{ metricValues: [{ value: "7" }] }], rowCount: 1 }));
    const listed = (await client.listTools()).tools.filter((t) => t.name.startsWith("analytics_"));
    expect(listed.map((t) => t.name).sort()).toEqual(["analytics_capabilities", "analytics_run_report"]);
    for (const t of listed) expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    const r = await client.callTool({ name: "analytics_run_report", arguments: { metrics: ["sessions"], last_days: 3 } });
    expect((r.structuredContent as { data: { rows: unknown[] } }).data.rows).toEqual([{ sessions: 7 }]);
  });
});
