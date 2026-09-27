import { describe, expect, test } from "vitest";
import { initialValues, lineLabelOf, normalizeValue, snapshotOf, summaryOf, validateSubmission } from "@/lib/customization/validate";
import type { Customizer } from "@/lib/site-config/schema";

const base = { id: "cz-1", slug: "x", name: "X", source: { store: "use-sul", collectionId: 1 }, previewMode: "mockupWithTextSummary", active: false, version: 3 } as const;
/** Model A: four lines to start, up to six, no separate fields. */
const pai: Customizer = { ...base, name: "Pai Paranaense", fields: [], lineGroup: { key: "linhas", label: "Linhas da camiseta", lineLabel: "Linha {n}", min: 1, initial: 4, max: 6, maxLength: 16, defaults: ["PAI", "PARANAENSE", "CHURRASQUEIRO", "LENDA"] } };
/** Model B: city (required), locality and caption (optional). */
const santiago: Customizer = {
  ...base, name: "Lá de Santiago", version: 2,
  fields: [
    { key: "cidade", label: "Cidade", required: true, maxLength: 30, position: 1, type: "text", placeholder: "Santiago" },
    { key: "localidade", label: "Localidade", required: false, maxLength: 30, position: 2, type: "text" },
    { key: "legenda", label: "Legenda", required: false, maxLength: 40, position: 3, type: "text", defaultValue: "" },
  ],
};

describe("model A: four lines, up to six (data, not code)", () => {
  test("given the model, when the form starts, then four lines with the model's defaults are shown", () => {
    expect(initialValues(pai)).toEqual({ fields: {}, lines: ["PAI", "PARANAENSE", "CHURRASQUEIRO", "LENDA"] });
  });

  test("given four lines, when submitted, then it is valid and the summary keeps the model's order and labels", () => {
    const r = validateSubmission(pai, { lines: ["PAI", "PARANAENSE", "CHURRASQUEIRO", "LENDA"] });
    expect(r.ok && r.summary).toEqual([{ label: "Linha 1", value: "PAI" }, { label: "Linha 2", value: "PARANAENSE" }, { label: "Linha 3", value: "CHURRASQUEIRO" }, { label: "Linha 4", value: "LENDA" }]);
  });

  test("given six lines, when submitted, then it is valid; seven is not; fewer than min is not; a blank visible line must be filled or removed", () => {
    const six = ["A", "B", "C", "D", "E", "F"];
    expect(validateSubmission(pai, { lines: six }).ok).toBe(true);
    expect(validateSubmission(pai, { lines: [...six, "G"] }).ok).toBe(false);
    expect(validateSubmission(pai, { lines: [] }).ok).toBe(false);
    const blank = validateSubmission(pai, { lines: ["PAI", "", "X"] });
    expect(!blank.ok && blank.errors).toEqual([{ key: "lines.1", message: "Linha 2: preencha ou remova a linha" }]);
    expect(validateSubmission(pai, { lines: ["PAI"] }).ok).toBe(true); // one line is within min
  });

  test("given a line over the limit, markup, control characters or a line break, when submitted, then each is refused with its own message; accents and spaces are accepted", () => {
    const r = validateSubmission(pai, { lines: ["X".repeat(17), "<b>oi</b>", "quebra\nde linha", "zero​width", "  São   Tomé  "] });
    expect(r.ok).toBe(false);
    const keys = !r.ok ? r.errors.map((e) => e.key) : [];
    expect(keys).toEqual(["lines.0", "lines.1", "lines.2", "lines.3"]);
    const ok = validateSubmission(pai, { lines: ["  São   Tomé  ", "AÇAÍ", "ÁGUA PÉ-DE-MOLE"] });
    expect(ok.ok && ok.values.lines).toEqual(["São Tomé", "AÇAÍ", "ÁGUA PÉ-DE-MOLE"]);
    expect(normalizeValue("é")).toBe("é"); // NFC
  });

  test("given labels in the model, when the line label template changes, then the summary follows the model (no hard-coded words)", () => {
    const other = { ...pai, lineGroup: { ...pai.lineGroup!, lineLabel: "Texto nº {n}" } };
    expect(lineLabelOf(other, 1)).toBe("Texto nº 2");
  });
});

describe("model B: city, locality and caption", () => {
  test("given only the required city, when submitted, then it is valid without locality or caption and the summary lists only what was filled", () => {
    const r = validateSubmission(santiago, { fields: { cidade: "Santiago" } });
    expect(r.ok && r.summary).toEqual([{ label: "Cidade", value: "Santiago" }]);
  });

  test("given a missing city, when submitted, then only the city is reported; unknown keys and non-text values are refused (whitelist)", () => {
    const r = validateSubmission(santiago, { fields: { localidade: "Centro" } });
    expect(!r.ok && r.errors.map((e) => e.key)).toEqual(["cidade"]);
    const strange = validateSubmission(santiago, { fields: { cidade: "X", cpf: "123", legenda: 7 } });
    expect(!strange.ok && strange.errors.map((e) => e.key).sort()).toEqual(["cpf", "legenda"]);
  });

  test("given a city change, when submitted with all three, then the values follow the fields in their configured order, and a locality outside any catalog is accepted", () => {
    const r = validateSubmission(santiago, { fields: { legenda: "Nunca esqueça", cidade: "São Borja", localidade: "Rincão dos Padres" } });
    expect(r.ok && r.summary.map((s) => s.label)).toEqual(["Cidade", "Localidade", "Legenda"]);
  });
});

describe("the snapshot freezes labels and version with the request", () => {
  test("given a request made with version 2, when the model is edited later, then the stored request still reads with the old labels and values", () => {
    const snap = snapshotOf(santiago);
    const r = validateSubmission(santiago, { fields: { cidade: "Santiago", legenda: "Meu lugar" } });
    if (!r.ok) throw new Error("invalid");
    const edited: Customizer = { ...santiago, version: 3, fields: santiago.fields.map((f) => ({ ...f, label: `${f.label} (novo)` })) };
    expect(snapshotOf(edited).version).toBe(3);
    expect(summaryOf(snap, r.values)).toEqual([{ label: "Cidade", value: "Santiago" }, { label: "Legenda", value: "Meu lugar" }]);
    expect(snap.version).toBe(2);
  });
});
