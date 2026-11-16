import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setActiveGa4, setActiveMetaPixel } from "@/lib/analytics/active-ids";
import { rememberEntryPoint, visitEntryPoint } from "@/lib/analytics/entry-point";
import { trackGoToInk, trackSelectCity } from "@/lib/analytics/track";

const consent = vi.hoisted(() => ({ granted: true }));
vi.mock("@/lib/consent/store", () => ({ hasAnalyticsConsent: () => consent.granted }));

const GA = "G-8GYTEJ1F77";
function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

beforeEach(() => {
  consent.granted = true;
  setActiveMetaPixel(null);
  setActiveGa4(GA);
});
afterEach(() => vi.unstubAllGlobals());

describe("entry_point da visita", () => {
  test("o primeiro clique vence: uma busca posterior não troca a origem", () => {
    vi.stubGlobal("window", { sessionStorage: memoryStorage() });
    rememberEntryPoint("header_search_bar");
    rememberEntryPoint("hero_search");
    expect(visitEntryPoint()).toBe("header_search_bar");
  });

  test("valor fora do formato é ignorado (nada de texto livre)", () => {
    vi.stubGlobal("window", { sessionStorage: memoryStorage() });
    rememberEntryPoint("Texto digitado pelo cliente");
    expect(visitEntryPoint()).toBeNull();
  });

  test("sem storage (janela privada) não lança e não grava", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    vi.stubGlobal("window", { sessionStorage: broken });
    expect(() => rememberEntryPoint("landing")).not.toThrow();
    expect(visitEntryPoint()).toBeNull();
  });

  test("select_city, select_item e go_to_ink levam o entry_point da visita", () => {
    const calls: [string, string, Record<string, unknown>][] = [];
    vi.stubGlobal("window", { sessionStorage: memoryStorage(), gtag: (...a: unknown[]) => calls.push(a as never) });
    rememberEntryPoint("auto_ads");
    trackSelectCity({ city: "Tijucas", state: "SC", region: "sul", source: "sua_cidade" });
    trackGoToInk({ productId: "9", sourceSection: "sua_cidade" });
    const byName = (n: string) => calls.find((c) => c[1] === n)?.[2];
    expect(byName("select_city")).toMatchObject({ entry_point: "auto_ads", source_section: "sua_cidade" });
    expect(byName("select_item")).toMatchObject({ entry_point: "auto_ads" });
    expect(byName("go_to_ink")).toMatchObject({ entry_point: "auto_ads" });
    expect(byName("select_city")).not.toHaveProperty("source");
  });

  test("sem entry_point guardado, os eventos saem como sempre", () => {
    const calls: [string, string, Record<string, unknown>][] = [];
    vi.stubGlobal("window", { sessionStorage: memoryStorage(), gtag: (...a: unknown[]) => calls.push(a as never) });
    trackSelectCity({ city: "Tijucas", state: "SC", region: "sul" });
    expect(calls[0][2]).not.toHaveProperty("entry_point");
  });
});
