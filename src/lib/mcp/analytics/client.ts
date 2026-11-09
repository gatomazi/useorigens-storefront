import { createSign } from "node:crypto";
import { McpToolError } from "../errors";

/**
 * The Google Analytics 4 Data API, read-only, for ONE property (the store's own, fixed by the environment: no tool lets the caller pick another).
 * A service account signs a JWT (RS256), trades it for an access token at Google's token endpoint and calls `runReport` / `getMetadata` over REST.
 * No Google library: `node:crypto` and `fetch` are enough, and nothing here is ever logged (the key least of all).
 *
 * Environment: `GA4_PROPERTY_ID` (the numeric property id, not the "G-" measurement id) and `GA4_SERVICE_ACCOUNT_JSON_B64` (the key file, base64:
 * the `\n` of its private key survive a variable that way). Either one missing → no client, and the tools answer MISSING_CREDENTIAL.
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const TIMEOUT_MS = 20_000;

export type Ga4Row = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] };
export type Ga4Report = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string; type?: string }[];
  rows?: Ga4Row[];
  rowCount?: number;
  metadata?: {
    dataLossFromOtherRow?: boolean;
    samplingMetadatas?: { samplesReadCount?: string; samplingSpaceSize?: string }[];
    subjectToThresholding?: boolean;
    timeZone?: string;
    currencyCode?: string;
    emptyReason?: string;
  };
};
export type Ga4Field = { apiName: string; uiName?: string; description?: string; customDefinition?: boolean; category?: string };
export type Ga4Metadata = { dimensions?: Ga4Field[]; metrics?: Ga4Field[] };
export type Ga4ReportRequest = {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions: { name: string }[];
  metrics: { name: string }[];
  dimensionFilter?: unknown;
  orderBys?: unknown[];
  limit: string;
};

export type Ga4Client = {
  propertyId: string;
  runReport: (request: Ga4ReportRequest) => Promise<Ga4Report>;
  getMetadata: () => Promise<Ga4Metadata>;
};

type Env = Record<string, string | undefined>;
type Key = { clientEmail: string; privateKey: string };

function readKey(b64: string): Key | null {
  try {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { client_email?: unknown; private_key?: unknown };
    return typeof json.client_email === "string" && typeof json.private_key === "string" ? { clientEmail: json.client_email, privateKey: json.private_key } : null;
  } catch {
    return null;
  }
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function signAssertion(key: Key, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: key.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.privateKey);
  return `${header}.${claims}.${b64url(signature)}`;
}

/** The client for this environment, or null when it is not configured (or the key is not a service account key). */
export function ga4FromEnv(env: Env = process.env, fetchFn: typeof fetch = fetch, now: () => number = Date.now): Ga4Client | null {
  const propertyId = (env.GA4_PROPERTY_ID ?? "").trim();
  const key = env.GA4_SERVICE_ACCOUNT_JSON_B64 ? readKey(env.GA4_SERVICE_ACCOUNT_JSON_B64.trim()) : null;
  if (!/^\d{1,15}$/.test(propertyId) || !key) return null;

  let token: { value: string; expiresAt: number } | null = null;
  const accessToken = async (): Promise<string> => {
    if (token && token.expiresAt > now() + 60_000) return token.value;
    const body = new URLSearchParams({ grant_type: GRANT, assertion: signAssertion(key, Math.floor(now() / 1000)) });
    const res = await timed(fetchFn, TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!res.ok) throw new McpToolError("UPSTREAM_UNAVAILABLE", `O Google recusou a conta de serviço do GA4 (HTTP ${res.status}). Confira a chave e se a Analytics Data API está ativada no projeto.`);
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new McpToolError("UPSTREAM_UNAVAILABLE", "O Google não devolveu um token de acesso para o GA4.");
    token = { value: json.access_token, expiresAt: now() + (json.expires_in ?? 3600) * 1000 };
    return token.value;
  };

  const call = async <T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> => {
    const res = await timed(fetchFn, `${DATA_API}/properties/${propertyId}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 403) throw new McpToolError("FORBIDDEN", "A conta de serviço não tem acesso a esta propriedade do GA4. Adicione o e-mail dela como Leitor em Administrador → Gerenciamento de acesso à propriedade.");
    if (res.status === 400) throw new McpToolError("INVALID_INPUT", `O GA4 recusou a consulta: ${await googleMessage(res)}`);
    if (res.status === 429) throw new McpToolError("RATE_LIMITED", "O GA4 limitou as consultas (cota). Tente de novo em alguns minutos.");
    if (!res.ok) throw new McpToolError("UPSTREAM_UNAVAILABLE", `O GA4 não respondeu (HTTP ${res.status}). Tente de novo.`);
    return (await res.json()) as T;
  };

  return {
    propertyId,
    runReport: (request) => call<Ga4Report>(":runReport", { method: "POST", body: request }),
    getMetadata: () => call<Ga4Metadata>("/metadata", { method: "GET" }),
  };
}

async function timed(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new McpToolError("UPSTREAM_UNAVAILABLE", "Não foi possível falar com o Google agora. Tente de novo.");
  }
}

/** Google's own message of a 400 (a bad dimension or metric name…): about the request, never about credentials. */
async function googleMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { message?: string } };
    return (json.error?.message ?? "consulta inválida").slice(0, 300);
  } catch {
    return "consulta inválida";
  }
}

let shared: Ga4Client | null | undefined;
/** The process-wide client (its access token is cached between requests). */
export function ga4(): Ga4Client | null {
  if (shared === undefined) shared = ga4FromEnv();
  return shared;
}
