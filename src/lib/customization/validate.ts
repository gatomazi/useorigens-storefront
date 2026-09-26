/**
 * Validation and summary of a customer's personalization input against a model (`Customizer`). Pure and shared: the browser form uses it for
 * the live summary and inline errors, and the server runs the SAME function again on submit (the browser is never trusted). Everything a model
 * defines (labels, limits, required, the repeatable line group) is DATA: nothing here knows about "PAI" or a city.
 */
import type { Customizer } from "../site-config/schema";

export type FieldError = { key: string; message: string };
export type SummaryLine = { label: string; value: string };
export type Values = { fields: Record<string, string>; lines: string[] };
export type SubmissionResult = { ok: true; values: Values; summary: SummaryLine[] } | { ok: false; errors: FieldError[] };

/** The line-group key is reserved in error reports: `lines.<index>`. */
export const lineErrorKey = (i: number) => `lines.${i}`;

/** Unicode-normalised, single-spaced, trimmed. Accents and spaces are kept; nothing is upper-cased (the model decides the print style). */
export function normalizeValue(raw: string): string {
  return raw.normalize("NFC").replace(/[ \t]+/g, " ").trim();
}

const CONTROL = /[\p{C}\u2028\u2029]/u; // control, format, private-use and unassigned characters, plus line/paragraph separators
const MARKUP = /[<>]/;

/** Why a single value is not acceptable, or null. */
export function problemWith(value: string, maxLength: number): string | null {
  if (CONTROL.test(value)) return "use só letras, números, espaços e pontuação comum (sem quebras de linha nem caracteres invisíveis)";
  if (MARKUP.test(value)) return "os sinais < e > não são aceitos";
  if ([...value].length > maxLength) return `no máximo ${maxLength} caracteres`;
  return null;
}

export const lineLabelOf = (m: Customizer, i: number): string => (m.lineGroup ? m.lineGroup.lineLabel.replace("{n}", String(i + 1)) : "");

/** What the form starts with: every field's default and the initial number of lines (with their defaults). */
export function initialValues(m: Customizer): Values {
  const fields: Record<string, string> = {};
  for (const f of m.fields) fields[f.key] = f.defaultValue ?? "";
  const g = m.lineGroup;
  return { fields, lines: g ? Array.from({ length: g.initial }, (_, i) => g.defaults?.[i] ?? "") : [] };
}

export const orderedFields = (m: Customizer) => [...m.fields].sort((a, b) => a.position - b.position);

export function validateSubmission(m: Customizer, input: { fields?: unknown; lines?: unknown }): SubmissionResult {
  const errors: FieldError[] = [];
  const raw = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? (input.fields as Record<string, unknown>) : {};
  const known = new Set(m.fields.map((f) => f.key));
  for (const key of Object.keys(raw)) if (!known.has(key)) errors.push({ key, message: "campo desconhecido" });
  const fields: Record<string, string> = {};
  const summary: SummaryLine[] = [];
  for (const f of orderedFields(m)) {
    const v = raw[f.key];
    if (v !== undefined && typeof v !== "string") {
      errors.push({ key: f.key, message: "valor inválido" });
      continue;
    }
    const value = normalizeValue(v ?? "");
    if (value === "") {
      if (f.required) errors.push({ key: f.key, message: `${f.label}: preencha este campo` });
      fields[f.key] = "";
      continue;
    }
    const problem = problemWith(value, f.maxLength);
    if (problem) errors.push({ key: f.key, message: `${f.label}: ${problem}` });
    fields[f.key] = value;
    summary.push({ label: f.label, value });
  }
  const g = m.lineGroup;
  let lines: string[] = [];
  if (g) {
    const rawLines = Array.isArray(input.lines) ? input.lines : input.lines === undefined ? [] : null;
    if (rawLines === null) errors.push({ key: "lines", message: "linhas inválidas" });
    else {
      if (rawLines.length < g.min || rawLines.length > g.max) errors.push({ key: "lines", message: `${g.label}: use de ${g.min} a ${g.max} linhas` });
      lines = rawLines.slice(0, g.max).map((l, i) => {
        if (typeof l !== "string") {
          errors.push({ key: lineErrorKey(i), message: `${lineLabelOf(m, i)}: valor inválido` });
          return "";
        }
        const value = normalizeValue(l);
        if (value === "") errors.push({ key: lineErrorKey(i), message: `${lineLabelOf(m, i)}: preencha ou remova a linha` });
        else {
          const problem = problemWith(value, g.maxLength);
          if (problem) errors.push({ key: lineErrorKey(i), message: `${lineLabelOf(m, i)}: ${problem}` });
        }
        return value;
      });
      lines.forEach((value, i) => { if (value) summary.push({ label: lineLabelOf(m, i), value }); });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, values: { fields, lines }, summary };
}

/** The model as it was when a request was made: labels and limits are frozen with the request, later edits of the model never change it. */
export type ModelSnapshot = {
  id: string;
  slug: string;
  name: string;
  version: number;
  fields: Customizer["fields"];
  lineGroup?: Customizer["lineGroup"];
};
export const snapshotOf = (m: Customizer): ModelSnapshot => ({ id: m.id, slug: m.slug, name: m.name, version: m.version, fields: structuredClone(m.fields), ...(m.lineGroup ? { lineGroup: structuredClone(m.lineGroup) } : {}) });

/** The summary of stored values against the frozen snapshot (labels come from the snapshot, never from the current model). */
export function summaryOf(snapshot: ModelSnapshot, values: Values): SummaryLine[] {
  const out: SummaryLine[] = [];
  for (const f of [...snapshot.fields].sort((a, b) => a.position - b.position)) if (values.fields[f.key]) out.push({ label: f.label, value: values.fields[f.key] });
  const g = snapshot.lineGroup;
  if (g) values.lines.forEach((value, i) => { if (value) out.push({ label: g.lineLabel.replace("{n}", String(i + 1)), value }); });
  return out;
}
