import { artworkFields, fieldAnswer } from "./artwork";
import type { PrintProject } from "../print-studio/model";

/**
 * The live banner's examples (`LiveBanner.examples`) as answers for a base: each line split on "|", one answer per field in the base's order, each
 * made to fit its field (`fieldAnswer`). A line with the wrong number of answers, or an answer that does not fit, is skipped whole.
 */
export function liveExamples(base: PrintProject, lines: readonly string[]): Record<string, string>[] {
  const fields = artworkFields(base);
  return lines.flatMap((line) => {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length !== fields.length) return [];
    const answers = fields.map((f, i) => [f.id, fieldAnswer(f, parts[i])] as const);
    return answers.every(([, v]) => v !== null) ? [Object.fromEntries(answers) as Record<string, string>] : [];
  });
}

/** What the visitor wrote in a live banner, carried to the model's page in the tab's session (never in the address: analytics read it). */
const PREFILL_KEY = (slug: string) => `uo:personalizar:${slug}`;
const PREFILL_TTL = 30 * 60_000;

export function savePrefill(slug: string, values: Record<string, string>, now = Date.now()): void {
  try { sessionStorage.setItem(PREFILL_KEY(slug), JSON.stringify({ at: now, values })); } catch { /* private mode: the page just starts empty */ }
}

/** The carried answers that still fit the base's fields (each through `fieldAnswer`), read once; {} when there are none. */
export function takePrefill(slug: string, base: PrintProject, now = Date.now()): Record<string, string> {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PREFILL_KEY(slug));
    sessionStorage.removeItem(PREFILL_KEY(slug));
  } catch { return {}; }
  if (!raw) return {};
  try {
    const { at, values } = JSON.parse(raw) as { at?: unknown; values?: unknown };
    if (typeof at !== "number" || now - at > PREFILL_TTL || !values || typeof values !== "object") return {};
    const out: Record<string, string> = {};
    for (const f of artworkFields(base)) {
      const v = (values as Record<string, unknown>)[f.id];
      const answer = typeof v === "string" ? fieldAnswer(f, v) : null;
      if (answer) out[f.id] = answer;
    }
    return out;
  } catch { return {}; }
}
