/**
 * Calendar math for the 30-day window, always in America/Sao_Paulo. The offset is read from the platform's time-zone database
 * (`Intl`), never hard-coded, so a future return of daylight saving time would still give real midnights.
 */
export const PODIO_TZ = "America/Sao_Paulo";
export const WINDOW_DAYS = 30;

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: PODIO_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** The São Paulo calendar day of an instant, YYYY-MM-DD. */
export function saoPauloDate(instant: Date): string {
  return ymd.format(instant);
}

/** Pure calendar arithmetic on a YYYY-MM-DD string (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Offset of São Paulo from UTC at `instant`, in minutes (e.g. −180). */
function offsetMinutes(instant: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: PODIO_TZ, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part ?? "");
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** The instant of 00:00 in São Paulo on `date` (YYYY-MM-DD). */
export function saoPauloMidnight(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d);
  // Two passes: the offset at the guessed instant, then at the corrected one (only differs across a DST change).
  let instant = new Date(utcGuess - offsetMinutes(new Date(utcGuess)) * 60_000);
  instant = new Date(utcGuess - offsetMinutes(instant) * 60_000);
  return instant;
}

export type PodioWindow = { referenceDate: string; start: Date; end: Date };

/** The 30 full days before D: [00:00 of D−30, 00:00 of D), São Paulo time. D defaults to "today in São Paulo" at `now`. */
export function windowFor(now: Date, referenceDate: string = saoPauloDate(now)): PodioWindow {
  return { referenceDate, start: saoPauloMidnight(addDays(referenceDate, -WINDOW_DAYS)), end: saoPauloMidnight(referenceDate) };
}

export function inWindow(createdAt: string, window: Pick<PodioWindow, "start" | "end">): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= window.start.getTime() && t < window.end.getTime();
}
