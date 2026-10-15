import { addDays, PODIO_TZ, saoPauloDate, saoPauloMidnight } from "../podio/window";
import { McpToolError } from "./errors";

/**
 * A period of São Paulo calendar days, both ends inclusive for the person (`start_date`..`end_date`), kept internally as the half-open
 * instant range [00:00 of start, 00:00 of the day after end). INK filters orders by creation DAY in an undocumented time zone, so the INK
 * query is padded by one day on each side (`inkRange`) and the exact instants are filtered here — the same rule the pódio uses.
 */
export const TIME_ZONE = PODIO_TZ;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Period = {
  startDate: string;
  endDate: string;
  start: Date;
  endExclusive: Date;
  days: number;
  inkRange: { beginDate: string; endDate: string };
};

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  return addDays(value, 0) === value; // rejects 2026-02-30 and friends
}

/**
 * `start_date`/`end_date` (YYYY-MM-DD, inclusive) or `last_days` (the N full days before today, today excluded unless `include_today`).
 * Nothing given = the last 30 full days. A future end is clamped to today; the period may not exceed `maxDays`.
 */
export function resolvePeriod(input: { start_date?: string; end_date?: string; last_days?: number; include_today?: boolean }, now: Date, maxDays: number): Period {
  const today = saoPauloDate(now);
  let startDate: string;
  let endDate: string;
  if (input.start_date || input.end_date) {
    if (input.last_days !== undefined) throw new McpToolError("INVALID_INPUT", "Use start_date/end_date OU last_days, não os dois.");
    if (!input.start_date || !input.end_date) throw new McpToolError("INVALID_INPUT", "start_date e end_date vão juntos (YYYY-MM-DD, ambos inclusivos).");
    if (!validDate(input.start_date) || !validDate(input.end_date)) throw new McpToolError("INVALID_INPUT", "As datas precisam ser dias reais no formato YYYY-MM-DD.");
    startDate = input.start_date;
    endDate = input.end_date > today ? today : input.end_date;
  } else {
    const n = input.last_days ?? 30;
    endDate = input.include_today ? today : addDays(today, -1);
    startDate = addDays(endDate, -(n - 1));
  }
  if (startDate > endDate) throw new McpToolError("INVALID_INPUT", `O período começa (${startDate}) depois de terminar (${endDate}).`);
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > maxDays) throw new McpToolError("INVALID_INPUT", `O período tem ${days} dias; o máximo desta ferramenta é ${maxDays}. Divida em períodos menores.`);
  return {
    startDate,
    endDate,
    start: saoPauloMidnight(startDate),
    endExclusive: saoPauloMidnight(addDays(endDate, 1)),
    days,
    inkRange: { beginDate: addDays(startDate, -1), endDate: addDays(endDate, 1) },
  };
}

export function inPeriod(createdAt: string, period: Pick<Period, "start" | "endExclusive">): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= period.start.getTime() && t < period.endExclusive.getTime();
}

export const describePeriod = (p: Period) => ({ start_date: p.startDate, end_date: p.endDate, days: p.days, time_zone: TIME_ZONE, end_inclusive: true });
