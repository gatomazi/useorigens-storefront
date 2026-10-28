import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readTracked, track, untrack, updateTracked } from "@/lib/customization/product-tracker";
import { getFavorites } from "@/lib/favorites/store";

const A = "01M606P9RVCKGWG44QFM8VZCNW";
const B = "01M606P9RVCKGWG44QFM8VZCNX";
let written: string[];
let jar: Map<string, string>;

/** A browser of `host`: storage in a Map, `document.cookie` as a tiny jar that records every write. */
function browser(host: string) {
  const store = new Map<string, string>();
  jar = new Map();
  written = [];
  vi.stubGlobal("location", { hostname: host, pathname: "/sul/personalizar/natal-em-familia" });
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.stubGlobal("window", { location: { pathname: "/sul/personalizar/natal-em-familia" }, dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("document", {
    get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); },
    set cookie(line: string) {
      written.push(line);
      const [pair] = line.split("; ");
      const [k, v] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
      if (/Max-Age=0/.test(line)) jar.delete(k); else jar.set(k, v);
    },
  });
}
const job = (id: string, status: "queued" | "ready" = "queued") => (status === "ready"
  ? { id, label: "Universitário", status, url: "https://loja.useorigens.com.br/useorigens/product/silva", image: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/silva.jpg", inkProductId: "5143876", store: "use-sul" as const }
  : { id, label: "Universitário", status, url: null, image: null, inkProductId: null, store: null });

beforeEach(() => browser("www.useorigens.com.br"));
afterEach(() => vi.unstubAllGlobals());

describe("pending products shared with the INK store", () => {
  test("tracking writes the ids to the cookie of the shared domain", () => {
    track([job(A), job(B)], "Silva");
    expect(written.at(-1)).toBe(`uo_produtos=${A}.${B}; Domain=.useorigens.com.br; Path=/; Max-Age=86400; SameSite=Lax; Secure`);
    expect(readTracked().map((p) => p.id)).toEqual([A, B]);
    expect(readTracked()[0]).toMatchObject({ surname: "Silva", page: "/sul/personalizar/natal-em-familia" });
  });
  test("a job removed on the INK side (cookie without it) disappears here too", () => {
    track([job(A), job(B)], "Silva");
    jar.set("uo_produtos", B);
    expect(readTracked().map((p) => p.id)).toEqual([B]);
    jar.delete("uo_produtos");
    expect(readTracked()).toEqual([]);
  });
  test("untracking the last one deletes the cookie", () => {
    track([job(A)], "Silva");
    untrack(A);
    expect(written.at(-1)).toMatch(/^uo_produtos=; .*Max-Age=0/);
    expect(readTracked()).toEqual([]);
  });
  test("a ready shirt goes into Minhas Estampas once; one still being made does not", () => {
    track([job(A)], "Silva");
    expect(getFavorites().filter((f) => f.inkProductId === "5143876")).toHaveLength(0);
    updateTracked(job(A, "ready"));
    updateTracked({ ...job(A, "ready"), image: "https://img.example/outra.jpg" });
    expect(getFavorites().filter((f) => f.inkProductId === "5143876")).toEqual([expect.objectContaining({ commerceStoreKey: "use-sul", title: "Silva · Universitário", context: "Personalizada", imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/silva.jpg" })]);
  });
  test("a photo from anywhere but INK's CDN is saved as the plain shirt (the page shows it with next/image)", () => {
    track([{ ...job(B, "ready"), inkProductId: "5143877", image: "https://elsewhere.example/x.jpg" }], "Souza");
    expect(getFavorites().find((f) => f.inkProductId === "5143877")?.imageUrl).toBe("/personalizacao/camisetas/preta.webp");
  });
  test("a local server keeps its own list and writes no cookie", () => {
    browser("127.0.0.1");
    track([job(A)], "Silva");
    expect(written).toEqual([]);
    expect(readTracked().map((p) => p.id)).toEqual([A]);
  });
});
