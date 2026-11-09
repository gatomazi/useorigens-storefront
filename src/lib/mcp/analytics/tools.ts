import { McpToolError } from "../errors";
import { resolvePeriod, describePeriod, TIME_ZONE } from "../period";
import { saoPauloDate } from "../../podio/window";
import { clean, iso, type ToolDeps, type ToolResult } from "../tools";
import type { Ga4Client, Ga4Field, Ga4Report } from "./client";

/**
 * The two Google Analytics tools: what the property can be asked (`analytics_capabilities`) and a report (`analytics_run_report`). Read-only, one
 * property fixed by the environment, bounded (≤ 9 dimensions, ≤ 10 metrics, ≤ 250 rows, ≤ 366 days). GA4 only counts what the browser reports
 * after the visitor accepted cookies, so every number here is a floor: it is never to be divided by the INK's sales.
 */
export type AnalyticsDeps = Pick<ToolDeps, "now" | "analytics">;

export const ANALYTICS_MAX_DAYS = 366;
export const ANALYTICS_MAX_ROWS = 250;
export const ANALYTICS_MAX_DIMENSIONS = 9;
export const ANALYTICS_MAX_METRICS = 10;
export const ANALYTICS_NAME = /^[A-Za-z][A-Za-z0-9_:]{0,80}$/;

export const GA4_NOTES = [
  "O GA4 só conta quem aceitou os cookies de métrica: os números são um piso, nunca o total de visitas ou compras. Não divida por vendas da INK para obter taxa de conversão sem dizer isso.",
  "Dimensões personalizadas (customEvent:<parâmetro>, como entry_point, family, garment_type, city_slug) só existem depois de cadastradas no GA4 (Administrador → Definições personalizadas) e só coletam daquele dia em diante.",
  "'Eventos' não é funil sequencial: origens_sua_cidade_open, select_city, origens_sua_cidade_model e go_to_ink são contagens separadas.",
  "Hoje e ontem podem estar incompletos: o GA4 ainda processa esses dias.",
];

function need(deps: AnalyticsDeps): Ga4Client {
  if (!deps.analytics) throw new McpToolError("MISSING_CREDENTIAL", "O GA4 não está configurado neste servidor (faltam GA4_PROPERTY_ID e GA4_SERVICE_ACCOUNT_JSON_B64). Veja docs/mcp/ga4.md.");
  return deps.analytics;
}

const baseMeta = (deps: AnalyticsDeps, over: Partial<ToolResult["meta"]>): ToolResult["meta"] => ({
  source: "ga4_api",
  generated_at: iso(deps.now()),
  data_as_of: null,
  period: null,
  date_basis: null,
  filters_applied: {},
  coverage: { status: "complete", reason: null },
  unclassified_count: null,
  next_cursor: null,
  ...over,
});

export type CapabilitiesInput = { search?: string; kind?: "dimension" | "metric"; custom_only?: boolean; limit?: number };

const fieldOut = (f: Ga4Field) => clean({ name: f.apiName, label: f.uiName, category: f.category, custom: f.customDefinition ? true : undefined, description: f.description?.slice(0, 160) });

export async function analyticsCapabilities(deps: AnalyticsDeps, input: CapabilitiesInput = {}): Promise<ToolResult> {
  const client = need(deps);
  const meta = await client.getMetadata();
  const limit = Math.min(input.limit ?? 60, 150);
  const term = input.search?.trim().toLowerCase();
  const pick = (list: Ga4Field[] | undefined) =>
    (list ?? [])
      .filter((f) => !input.custom_only || f.customDefinition)
      .filter((f) => !term || f.apiName.toLowerCase().includes(term) || (f.uiName ?? "").toLowerCase().includes(term));
  const dimensions = input.kind === "metric" ? [] : pick(meta.dimensions);
  const metrics = input.kind === "dimension" ? [] : pick(meta.metrics);
  return {
    meta: baseMeta(deps, { filters_applied: clean({ search: term, kind: input.kind, custom_only: input.custom_only }) }),
    data: {
      property_id: client.propertyId,
      totals: { dimensions: dimensions.length, metrics: metrics.length },
      // Custom ones first: they are what this store registered, and what a question about "Sua cidade" needs.
      dimensions: [...dimensions].sort((a, b) => Number(!!b.customDefinition) - Number(!!a.customDefinition)).slice(0, limit).map(fieldOut),
      metrics: [...metrics].sort((a, b) => Number(!!b.customDefinition) - Number(!!a.customDefinition)).slice(0, limit).map(fieldOut),
      truncated: dimensions.length > limit || metrics.length > limit,
      notes: GA4_NOTES,
      limits: { max_days: ANALYTICS_MAX_DAYS, max_rows: ANALYTICS_MAX_ROWS, max_dimensions: ANALYTICS_MAX_DIMENSIONS, max_metrics: ANALYTICS_MAX_METRICS, time_zone_of_dates: "o fuso da propriedade GA4" },
    },
  };
}

export type ReportFilter = { field: string; match?: "exact" | "contains" | "begins_with" | "in_list"; value?: string; values?: string[] };
export type ReportInput = {
  start_date?: string;
  end_date?: string;
  last_days?: number;
  include_today?: boolean;
  dimensions?: string[];
  metrics: string[];
  filters?: ReportFilter[];
  order_by?: { field: string; descending?: boolean };
  limit?: number;
};

const MATCH = { exact: "EXACT", contains: "CONTAINS", begins_with: "BEGINS_WITH" } as const;

function filterOf(f: ReportFilter) {
  if (!ANALYTICS_NAME.test(f.field)) throw new McpToolError("INVALID_INPUT", `Nome de dimensão inválido no filtro: ${f.field}.`);
  if (f.match === "in_list") {
    if (!f.values?.length) throw new McpToolError("INVALID_INPUT", "O filtro in_list precisa de values (lista não vazia).");
    return { filter: { fieldName: f.field, inListFilter: { values: f.values, caseSensitive: false } } };
  }
  if (!f.value) throw new McpToolError("INVALID_INPUT", `O filtro de ${f.field} precisa de value.`);
  // matchType is always sent: Google's page does not name a default.
  return { filter: { fieldName: f.field, stringFilter: { matchType: MATCH[f.match ?? "exact"], value: f.value, caseSensitive: false } } };
}

const number = (raw: string | undefined): number | string | null => {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

export async function analyticsRunReport(deps: AnalyticsDeps, input: ReportInput): Promise<ToolResult> {
  const client = need(deps);
  const dimensions = input.dimensions ?? [];
  const metrics = input.metrics;
  if (metrics.length === 0) throw new McpToolError("INVALID_INPUT", "Informe ao menos uma métrica (ex.: eventCount, activeUsers, sessions).");
  if (dimensions.length > ANALYTICS_MAX_DIMENSIONS) throw new McpToolError("INVALID_INPUT", `No máximo ${ANALYTICS_MAX_DIMENSIONS} dimensões por consulta.`);
  if (metrics.length > ANALYTICS_MAX_METRICS) throw new McpToolError("INVALID_INPUT", `No máximo ${ANALYTICS_MAX_METRICS} métricas por consulta.`);
  for (const name of [...dimensions, ...metrics]) if (!ANALYTICS_NAME.test(name)) throw new McpToolError("INVALID_INPUT", `Nome inválido: ${name}. Use os nomes da API (analytics_capabilities lista).`);
  if (new Set([...dimensions, ...metrics]).size !== dimensions.length + metrics.length) throw new McpToolError("INVALID_INPUT", "Há nomes repetidos entre dimensões e métricas.");

  const now = deps.now();
  const period = resolvePeriod(input, now, ANALYTICS_MAX_DAYS);
  const limit = Math.min(input.limit ?? 50, ANALYTICS_MAX_ROWS);
  const order = input.order_by;
  let orderBys: unknown[] | undefined;
  if (order) {
    if (dimensions.includes(order.field)) orderBys = [{ dimension: { dimensionName: order.field }, desc: !!order.descending }];
    else if (metrics.includes(order.field)) orderBys = [{ metric: { metricName: order.field }, desc: order.descending ?? true }];
    else throw new McpToolError("INVALID_INPUT", "order_by.field precisa ser uma das dimensões ou métricas pedidas.");
  }
  const expressions = (input.filters ?? []).slice(0, 5).map(filterOf);
  const report: Ga4Report = await client.runReport({
    dateRanges: [{ startDate: period.startDate, endDate: period.endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    ...(expressions.length ? { dimensionFilter: expressions.length === 1 ? expressions[0] : { andGroup: { expressions } } } : {}),
    ...(orderBys ? { orderBys } : {}),
    limit: String(limit),
  });

  const dims = (report.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (report.metricHeaders ?? []).map((h) => h.name);
  const rows = (report.rows ?? []).map((r) => ({
    ...Object.fromEntries(dims.map((name, i) => [name, r.dimensionValues?.[i]?.value ?? null])),
    ...Object.fromEntries(mets.map((name, i) => [name, number(r.metricValues?.[i]?.value)])),
  }));

  const reasons: string[] = [];
  const m = report.metadata;
  if (m?.samplingMetadatas?.length) reasons.push("o GA4 amostrou os dados (os números são estimativas)");
  if (m?.subjectToThresholding) reasons.push("o GA4 aplicou limite mínimo de agregação e omitiu linhas pequenas");
  if (m?.dataLossFromOtherRow) reasons.push("há linhas agrupadas em '(other)' (combinação de dimensões demais)");
  const total = report.rowCount ?? rows.length;
  if (total > rows.length) reasons.push(`mostrando ${rows.length} de ${total} linhas (limit)`);
  const recent = period.endDate >= (saoPauloDate(new Date(now.getTime() - 86_400_000)));

  return {
    meta: baseMeta(deps, {
      data_as_of: iso(now),
      period: describePeriod(period),
      date_basis: `dia no fuso da propriedade GA4${m?.timeZone ? ` (${m.timeZone})` : ""}; o período foi calculado no fuso ${TIME_ZONE}`,
      filters_applied: clean({ dimensions, metrics, filters: input.filters, order_by: order, limit }),
      coverage: reasons.length ? { status: "partial", reason: reasons.join("; ") } : { status: "complete", reason: null },
      next_cursor: null,
    }),
    data: { property_id: client.propertyId, row_count: total, rows, ...(m?.emptyReason && rows.length === 0 ? { empty_reason: m.emptyReason } : {}), notes: recent ? GA4_NOTES : GA4_NOTES.slice(0, 3) },
  };
}
