import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { contrastRatio } from "@/lib/site-config/color";
import { DEFAULT_INK_THEME, inkThemeOf, inkThemePayload, inkThemeTokens, validateInkTheme, type InkThemeConfig } from "@/lib/site-config/ink-theme";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { REGION_THEME } from "@/lib/theme/region-theme";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "t1" };
const ok = (d: ScopeDoc, op: Parameters<typeof applyOp>[1]) => {
  const r = applyOp(d, op, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};
const ON: InkThemeConfig = { surfaces: { pdp: true, cart: true, checkout: false }, action: "ink", ground: "branco", corners: "retos", font: "vitrine" };
const HEX = /^#[0-9a-f]{6}$/;

describe("Tema da INK: contract", () => {
  test("given the defaults, then every surface is off and the presets reproduce the storefront product page", () => {
    expect(DEFAULT_INK_THEME.surfaces).toEqual({ pdp: false, cart: false, checkout: false });
    expect(inkThemeOf(undefined)).toBe(DEFAULT_INK_THEME);
    const p = inkThemePayload("sul", undefined);
    expect(p).toMatchObject({ v: 1, region: "sul", surfaces: { pdp: false, cart: false, checkout: false } });
    // Identidade da PDP do storefront (botão preto, cantos retos, Hanken Grotesk, selecionado na cor da região) com a composição da rodada 2: página clara e o
    // cinza das fotos (#e5e5e5) só atrás da camiseta.
    expect(p.tokens).toMatchObject({ action: "#000000", onAction: "#ffffff", ground: "#ffffff", photo: "#e5e5e5", radius: 0, font: "origens", selected: REGION_THEME.sul.primary });
  });

  test("given bad values, when validated, then each is refused (only presets; no free colour, CSS or text) and global has none", () => {
    expect(validateInkTheme(ON, "sul").ok).toBe(true);
    for (const bad of [null, {}, { ...ON, action: "#ff0000" }, { ...ON, ground: "url(x)" }, { ...ON, corners: 12 }, { ...ON, font: "Comic Sans" }, { ...ON, extra: 1 },
      { ...ON, surfaces: { pdp: true, cart: true } }, { ...ON, surfaces: { ...ON.surfaces, home: true } }, { ...ON, surfaces: { ...ON.surfaces, pdp: "on" } }]) {
      expect(validateInkTheme(bad, "sul").ok).toBe(false);
    }
    expect(validateInkTheme(ON, "global").ok).toBe(false);
  });

  test("given every region and preset, then the tokens are #rrggbb with AA text contrast (the Worker refuses anything else)", () => {
    for (const region of ["sul", "norte", "centro-oeste"] as const) {
      for (const action of ["ink", "region"] as const) for (const ground of ["vitrine", "branco"] as const) {
        const { tokens } = inkThemeTokens(region, { ...ON, action, ground });
        for (const k of ["action", "onAction", "selected", "onSelected", "ground", "surface", "paper", "photo", "ink", "inkSoft", "inkMute", "line"] as const) expect(tokens[k]).toMatch(HEX);
        expect(contrastRatio(tokens.action, tokens.onAction)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens.selected, tokens.onSelected)).toBeGreaterThanOrEqual(4.5);
        for (const bg of [tokens.ground, tokens.surface, tokens.paper]) { expect(contrastRatio(tokens.ink, bg)).toBeGreaterThanOrEqual(4.5); expect(contrastRatio(tokens.inkMute, bg)).toBeGreaterThanOrEqual(4.5); }
      }
    }
    expect(inkThemeTokens("norte", { ...ON, action: "region", corners: "suaves", font: "ink" }).tokens).toMatchObject({ action: REGION_THEME.norte.primary, radius: 8, font: "ink" });
  });
});

describe("Tema da INK: draft, publication and diff", () => {
  test("given a region, when the theme is saved, then only `inkTheme` changes; global refuses it; an invalid value is refused by the op", () => {
    const sul = structuredClone(seed().docs.sul);
    const next = ok(sul, { type: "set-ink-theme", inkTheme: ON });
    expect(next.inkTheme).toEqual(ON);
    expect({ ...next, inkTheme: undefined }).toEqual({ ...sul, inkTheme: undefined });
    expect(validateScopeDoc(next).ok).toBe(true);
    expect(applyOp(structuredClone(seed().docs.global), { type: "set-ink-theme", inkTheme: ON }, ctx).ok).toBe(false);
    expect(applyOp(sul, { type: "set-ink-theme", inkTheme: { ...ON, action: "red" } as unknown as InkThemeConfig }, ctx).ok).toBe(false);
  });

  test("given a published bundle, then the payload comes from THAT region only; an invalid setting is dropped (INK stays native) without losing the region", () => {
    const bundle = seed();
    const raw = { ...bundle, releaseId: "r1", docs: { ...bundle.docs, sul: { ...bundle.docs.sul, inkTheme: ON } } };
    const read = sanitizeBundle(raw, bundle).bundle!;
    expect(inkThemePayload("sul", read.docs.sul.inkTheme).surfaces).toEqual({ pdp: true, cart: true, checkout: false });
    expect(inkThemePayload("norte", read.docs.norte.inkTheme).surfaces).toEqual({ pdp: false, cart: false, checkout: false });
    const bad = { ...raw, docs: { ...raw.docs, sul: { ...raw.docs.sul, inkTheme: { ...ON, font: "Arial" } } } };
    const r = sanitizeBundle(bad, bundle);
    expect(r.bundle?.docs.sul.inkTheme).toBeUndefined();
    expect(r.bundle?.docs.sul.home).toEqual(bundle.docs.sul.home);
    expect(r.diagnostics.some((d) => d.includes("inkTheme is invalid"))).toBe(true);
  });

  test("given a change, then the publish screen lists each surface switched and each preset changed, in Portuguese", () => {
    const sul = structuredClone(seed().docs.sul);
    const on = ok(sul, { type: "set-ink-theme", inkTheme: ON });
    expect(diffDocs(sul, on).map((c) => c.text)).toEqual([
      "Tema da INK, página de produto: ligado",
      "Tema da INK, carrinho e confirmação de adição: ligado",
    ]);
    const changed = ok(on, { type: "set-ink-theme", inkTheme: { ...ON, surfaces: { ...ON.surfaces, cart: false }, corners: "suaves" } });
    expect(diffDocs(on, changed).map((c) => c.text)).toEqual([
      "Tema da INK, carrinho e confirmação de adição: desligado (volta ao visual da INK)",
      "Tema da INK: Retos (como o site) → Levemente arredondados",
    ]);
    expect(diffDocs(on, on)).toEqual([]);
  });
});

describe("Tema da INK: incentivo de frete no carrinho", () => {
  const RULE = { enabled: true, confirmed: true, kind: "free-shipping" as const, unit: "items" as const, threshold: 2, ufs: ["RS", "PR", "SC"] };

  test("given the defaults, then there is no incentive: no rule is invented and the payload has no `incentive` key", () => {
    expect(DEFAULT_INK_THEME.incentive).toBeUndefined();
    expect("incentive" in inkThemePayload("sul", undefined)).toBe(false);
    expect("incentive" in inkThemePayload("sul", ON)).toBe(false);
  });

  test("given a confirmed rule switched on, then the payload carries it in the region's order; off or unconfirmed, it does not", () => {
    expect(inkThemePayload("sul", { ...ON, incentive: RULE }).incentive).toEqual({ enabled: true, kind: "free-shipping", unit: "items", threshold: 2, ufs: ["PR", "SC", "RS"] });
    expect(inkThemePayload("sul", { ...ON, incentive: { ...RULE, enabled: false } }).incentive).toBeUndefined();
    expect(inkThemePayload("sul", { ...ON, incentive: { ...RULE, confirmed: false, enabled: false } }).incentive).toBeUndefined();
  });

  test("given an invalid rule, then the validator refuses it with a Portuguese message the owner can act on", () => {
    const errs = (incentive: unknown) => {
      const r = validateInkTheme({ ...ON, incentive }, "sul");
      return r.ok ? [] : r.errors;
    };
    expect(errs(RULE)).toEqual([]);
    expect(errs({ ...RULE, enabled: false, confirmed: false })).toEqual([], "a rule kept off without confirmation is fine");
    expect(errs({ ...RULE, confirmed: false }).join(" ")).toMatch(/para ligar, confirme que a regra está cadastrada e ativa na INK/);
    expect(errs({ ...RULE, threshold: 1 }).join(" ")).toMatch(/mínimo de peças, de 2 a 20/);
    expect(errs({ ...RULE, threshold: Number.NaN }).join(" ")).toMatch(/mínimo de peças/);
    expect(errs({ ...RULE, ufs: [] }).join(" ")).toMatch(/ao menos um estado/);
    expect(errs({ ...RULE, ufs: ["SP"] }).join(" ")).toMatch(/desta região/);
    expect(errs({ ...RULE, unit: "value" }).join(" ")).toMatch(/quantidade de peças/);
    expect(errs({ ...RULE, extra: 1 }).join(" ")).toMatch(/campo desconhecido/);
    const norte = validateInkTheme({ ...ON, incentive: RULE }, "norte");
    expect(norte.ok).toBe(false);
  });

  test("given a change of the rule, then the publish screen says what the cart will show", () => {
    const sul = structuredClone(seed().docs.sul);
    const off = ok(sul, { type: "set-ink-theme", inkTheme: { ...ON, incentive: { ...RULE, enabled: false, confirmed: false } } });
    const on = ok(off, { type: "set-ink-theme", inkTheme: { ...ON, incentive: RULE } });
    expect(diffDocs(off, on).map((c) => c.text)).toContain("Tema da INK, incentivo de frete no carrinho: ligado: frete grátis a partir de 2 peças (RS, PR, SC)");
    expect(diffDocs(on, ok(on, { type: "set-ink-theme", inkTheme: ON })).map((c) => c.text)).toContain("Tema da INK, incentivo de frete no carrinho: sem regra");
  });
});
