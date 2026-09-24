import { describe, expect, test } from "vitest";
import { contrastRatio, readability } from "@/lib/admin/contrast";
import type { Appearance } from "@/lib/site-config/schema";

const base = (fill: Appearance["fill"], overlay: Appearance["overlay"] = { preset: "none" }): Appearance => ({ fill, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay });

describe("readability", () => {
  test("given black on white, when measured, then the ratio is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  test("given white text on the page ground (no fill, no image), when checked, then it is blocking — the text would be invisible", () => {
    const r = readability(base({ kind: "none" }), "dark", false);
    expect(r[0]).toMatchObject({ level: "blocking" });
  });

  test("given dark text on the page ground, when checked, then there is no issue", () => {
    expect(readability(base({ kind: "none" }), "light", false)).toEqual([]);
  });

  test("given white text on the regional green or on near-black, when checked, then there is no issue", () => {
    expect(readability(base({ kind: "solid", color: "token:region-primary" }), "dark", false)).toEqual([]);
    expect(readability(base({ kind: "solid", color: "token:near-black" }), "dark", false)).toEqual([]);
  });

  test("given a gradient, when checked, then the worst end decides", () => {
    expect(readability(base({ kind: "gradient", from: "#000000", to: "#ffffff", angle: 90 }), "dark", false)[0]).toMatchObject({ level: "blocking" });
  });

  test("given white text on a photo, when the overlay is weak or missing, then a warning asks for a stronger dark overlay", () => {
    expect(readability(base({ kind: "none" }, { preset: "none" }), "dark", true)[0]).toMatchObject({ level: "warning" });
    expect(readability(base({ kind: "none" }, { color: "#000000", opacity: 0.2 }), "dark", true)[0]).toMatchObject({ level: "warning" });
    expect(readability(base({ kind: "none" }, { color: "#000000", opacity: 0.6 }), "dark", true)).toEqual([]);
    expect(readability(base({ kind: "none" }, { preset: "regional-wash-dark" }), "dark", true)).toEqual([]);
  });

  test("given dark text on a photo with a light wash, when checked, then it is accepted", () => {
    expect(readability(base({ kind: "none" }, { preset: "regional-wash" }), "light", true)).toEqual([]);
  });
});
