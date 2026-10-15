/**
 * INK sends money as decimal strings ("109.90", "-5.00", "0.0"). They become integer cents by reading the digits, never through a binary
 * float, so a sum over thousands of orders is exact. Anything that is not a plain decimal with at most two places is `null` (unknown), never 0.
 */
const DECIMAL = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/;

export function toCents(raw: unknown): number | null {
  const text = typeof raw === "number" ? (Number.isFinite(raw) ? raw.toFixed(2) : "") : typeof raw === "string" ? raw.trim() : "";
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] && cents !== 0 ? -cents : cents;
}

/** Cents as a "1234.50" string (what the tools return, alongside the integer). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export type Money = { cents: number; brl: string };
export const money = (cents: number): Money => ({ cents, brl: centsToDecimal(cents) });
