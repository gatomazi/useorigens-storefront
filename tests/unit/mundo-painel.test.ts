import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { modoEfetivo, mundoModoOf, validateMundo } from "@/lib/site-config/mundo-schema";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "t1" };
const ok = (d: ScopeDoc, op: Parameters<typeof applyOp>[1]) => {
  const r = applyOp(d, op, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};

describe("Meu Pequeno Mundo switch in the panel (global scope)", () => {
  test("given the env as the ceiling, then the panel can only narrow it, and no choice follows the env", () => {
    expect(modoEfetivo("on", undefined)).toBe("on");
    expect(modoEfetivo("on", "pagina")).toBe("pagina");
    expect(modoEfetivo("on", "off")).toBe("off");
    expect(modoEfetivo("pagina", "on")).toBe("pagina");
    expect(modoEfetivo("off", "on")).toBe("off");
    expect(modoEfetivo("pagina", undefined)).toBe("pagina");
  });

  test("given the global document, when the switch is set and cleared, then only `mundo` changes and the document stays valid", () => {
    const global = structuredClone(seed().docs.global);
    const pagina = ok(global, { type: "set-mundo", modo: "pagina" });
    expect(pagina.mundo).toEqual({ modo: "pagina" });
    expect(validateScopeDoc(pagina).ok).toBe(true);
    const segue = ok(pagina, { type: "set-mundo", modo: null });
    expect("mundo" in segue).toBe(false);
    expect(segue).toEqual(global);
  });

  test("given a region document, then the switch is refused (it belongs to the global scope)", () => {
    const sul = structuredClone(seed().docs.sul);
    expect(applyOp(sul, { type: "set-mundo", modo: "on" }, ctx).ok).toBe(false);
    expect(validateMundo({ modo: "on" }, "sul").ok).toBe(false);
  });

  test("given invalid values, then the validator refuses them", () => {
    expect(validateMundo({ modo: "talvez" }, "global").ok).toBe(false);
    expect(validateMundo({ modo: "on", extra: 1 }, "global").ok).toBe(false);
    expect(validateMundo("on", "global").ok).toBe(false);
    for (const modo of ["off", "pagina", "on"]) expect(validateMundo({ modo }, "global").ok).toBe(true);
  });

  test("given a published bundle, then a valid choice is read and an invalid one is dropped (the env alone decides)", () => {
    const bundle = seed();
    expect(mundoModoOf(bundle)).toBeUndefined();
    const valido = structuredClone(bundle) as unknown as { docs: { global: Record<string, unknown> } };
    valido.docs.global.mundo = { modo: "pagina" };
    expect(mundoModoOf(sanitizeBundle(valido, bundle).bundle)).toBe("pagina");
    const invalido = structuredClone(bundle) as unknown as { docs: { global: Record<string, unknown> } };
    invalido.docs.global.mundo = { modo: "sempre" };
    const lido = sanitizeBundle(invalido, bundle);
    expect(lido.bundle).not.toBeNull();
    expect(mundoModoOf(lido.bundle)).toBeUndefined();
  });

  test("given a change in the draft, then the publish summary says it", () => {
    const global = structuredClone(seed().docs.global);
    const off = ok(global, { type: "set-mundo", modo: "off" });
    const mudancas = diffDocs(global, off);
    expect(mudancas.some((m) => m.sectionId === "mundo" && m.text.includes("segue o servidor → desligado"))).toBe(true);
  });
});
