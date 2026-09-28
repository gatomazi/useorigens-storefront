import { describe, expect, test } from "vitest";
import { STATE_NAMES } from "@/lib/geo/regions";
import { GRAMMAR_UFS, joinStatesOf, stateDemonym, stateIn, stateOf } from "@/lib/seo/state-copy";

describe("state grammar (one map for every title, description and visible text)", () => {
  test("given the approved Sul states, when the preposition is asked, then it is do Paraná, do Rio Grande do Sul and de Santa Catarina", () => {
    expect(stateOf("PR")).toBe("do Paraná");
    expect(stateOf("RS")).toBe("do Rio Grande do Sul");
    expect(stateOf("SC")).toBe("de Santa Catarina");
  });

  test("given the Sul states, when the locative is asked, then it is no Paraná, no Rio Grande do Sul and em Santa Catarina", () => {
    expect(stateIn("PR")).toBe("no Paraná");
    expect(stateIn("RS")).toBe("no Rio Grande do Sul");
    expect(stateIn("SC")).toBe("em Santa Catarina");
  });

  test("given the Sul states, when the demonym is asked, then only the three approved ones exist", () => {
    expect(stateDemonym("PR")).toBe("paranaenses");
    expect(stateDemonym("RS")).toBe("gaúchas");
    expect(stateDemonym("SC")).toBe("catarinenses");
  });

  test("given a state outside the Sul, when the demonym is asked, then there is none (no unreviewed wording)", () => {
    for (const uf of ["AC", "AM", "AP", "PA", "RO", "RR", "TO", "DF", "GO", "MS", "MT"]) expect(stateDemonym(uf), uf).toBeUndefined();
  });

  test("given every state the storefront knows, when its phrases are built, then both end with the real state name", () => {
    expect(GRAMMAR_UFS.length).toBe(Object.keys(STATE_NAMES).length);
    for (const uf of GRAMMAR_UFS) {
      expect(stateOf(uf).endsWith(STATE_NAMES[uf]), uf).toBe(true);
      expect(stateIn(uf).endsWith(STATE_NAMES[uf]), uf).toBe(true);
    }
  });

  test("given lower case, when the grammar is asked, then it still resolves", () => {
    expect(stateOf("pr")).toBe("do Paraná");
  });

  test("given an unknown state, when the grammar is asked, then it fails loudly instead of printing a wrong phrase", () => {
    expect(() => stateOf("XX")).toThrow();
  });

  test("given the three Sul states, when they are joined, then each keeps its own preposition", () => {
    expect(joinStatesOf(["PR", "SC", "RS"])).toBe("do Paraná, de Santa Catarina e do Rio Grande do Sul");
    expect(joinStatesOf(["DF"])).toBe("do Distrito Federal");
    expect(joinStatesOf([])).toBe("");
  });
});
