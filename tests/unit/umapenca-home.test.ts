import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { seedForEnv } from "@/lib/admin/publishing";
import { parseSectionForm } from "@/lib/admin/section-form";
import { sourceStatus } from "@/lib/admin/validate-draft";
import { setActiveGa4, setActiveMetaPixel } from "@/lib/analytics/active-ids";
import { SOURCES } from "@/lib/analytics/sources";
import { trackGoToUmaPenca } from "@/lib/analytics/track";
import { validateSection, type ScopeDoc, type Section } from "@/lib/site-config/schema";
import { resolveSource } from "@/lib/site-config/sources";
import { umaPencaLookup } from "@/lib/umapenca/carousel";
import { writeUmaPencaSnapshot } from "@/lib/umapenca/snapshot";
import type { UmaPencaArticle, UmaPencaSnapshot } from "@/lib/umapenca/types";

const consent = vi.hoisted(() => ({ granted: true }));
vi.mock("@/lib/consent/store", () => ({ hasAnalyticsConsent: () => consent.granted }));

const article = (id: string, kind: UmaPencaArticle["kind"], extra: Partial<UmaPencaArticle> = {}): UmaPencaArticle => ({
  id,
  kind,
  title: `${kind === "caneca" ? "Caneca" : "Ecobag"} ${id}`,
  description: "",
  url: `https://artigos.useorigens.com.br/${kind}/${id}.html`,
  imageUrl: `https://umapenca.imgix.net/${id}/x.jpg`,
  additionalImageUrls: [],
  price: 90,
  salePrice: null,
  color: null,
  ...extra,
});
const SNAPSHOT: UmaPencaSnapshot = { version: 1, syncedAt: "2026-10-04T00:00:00.000Z", articles: [article("1", "caneca"), article("2", "ecobag"), article("3", "caneca", { salePrice: 79.9 }), article("4", "caneca")] };
const EDITORIAL = { terra: [], recreations: [], lenda: [], dizeres: [], ddd: [] };
const start = (): ScopeDoc => structuredClone(seedForEnv().docs.sul);
let n = 0;
const ctx = () => ({ newId: () => `h${++n}` });

describe("home carousel from Uma Penca: contract", () => {
  const section = (source: unknown) => ({ id: "custom-x", anchor: "x", headingId: "x-title", template: "product-carousel", active: true, title: "Canecas", layout: { variant: "standard", tone: "light", surface: "plain" }, source, analyticsSource: "homeUmaPenca", appearance: start().home!.sections.find((s) => s.template === "product-carousel")!.appearance });

  test("a list of distinct known kinds and a 3..24 limit is valid; anything else is refused", () => {
    expect(validateSection(section({ kind: "umapenca", articleKinds: ["caneca"], limit: 8 })).ok).toBe(true);
    expect(validateSection(section({ kind: "umapenca", articleKinds: ["caneca", "ecobag"], limit: 3 })).ok).toBe(true);
    for (const bad of [{ articleKinds: [], limit: 8 }, { articleKinds: ["bone"], limit: 8 }, { articleKinds: ["caneca", "caneca"], limit: 8 }, { articleKinds: ["caneca"], limit: 2 }, { articleKinds: ["caneca"], limit: 25 }]) {
      expect(validateSection(section({ kind: "umapenca", ...bad })).ok).toBe(false);
    }
  });

  test("given the admin adds it, then it is a carousel with the Uma Penca analytics origin and a 'Ver todos' to the region's Outros artigos", () => {
    const r = applyOp(start(), { type: "add-carousel", title: "Canecas", source: { kind: "umapenca", articleKinds: ["caneca"], limit: 8 }, cta: { label: "Ver todos", dest: { kind: "route", path: "/sul/outros-artigos" } } }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const created = r.doc.home!.sections.find((s) => s.title === "Canecas")!;
    expect(created).toMatchObject({ template: "product-carousel", analyticsSource: "homeUmaPenca", source: { kind: "umapenca", articleKinds: ["caneca"], limit: 8 }, cta: { dest: { kind: "route", path: "/sul/outros-artigos" } } });
    // An INK collection carousel keeps its own origin.
    const ink = applyOp(start(), { type: "add-carousel", title: "Coleção", source: { kind: "ink-category", store: "use-sul", collectionId: 152188, order: "category", limit: 6 } }, ctx());
    expect(ink.ok && ink.doc.home!.sections.find((s) => s.title === "Coleção")!.analyticsSource).toBe("homeCollection");
  });

  test("the section editor switches a carousel to Uma Penca with the ticked kinds; none ticked keeps the current source", () => {
    const current = start().home!.sections.find((s) => s.template === "product-carousel") as Section;
    const form = (entries: Record<string, string>) => ({ get: (name: string) => (name in entries ? entries[name] : null) });
    expect(parseSectionForm(form({ source_kind: "umapenca", source_up_caneca: "on", source_up_ecobag: "on", source_limit: "10" }), current).source).toEqual({ kind: "umapenca", articleKinds: ["caneca", "ecobag"], limit: 10 });
    expect(parseSectionForm(form({ source_kind: "umapenca", source_limit: "10" }), current).source).toEqual(current.source);
  });
});

describe("home carousel from Uma Penca: rendering", () => {
  test("only the chosen kinds, in feed order, up to the limit; each item opens Uma Penca and says so for tracking", () => {
    const lookup = umaPencaLookup("sul", () => SNAPSHOT);
    const result = resolveSource({ kind: "umapenca", articleKinds: ["caneca"], limit: 2 }, EDITORIAL, undefined, lookup);
    expect(result.status === "ok" && result.items).toEqual([
      { id: "1", name: "Caneca 1", price: "R$ 90,00", rawPrice: 90, imageUrl: "https://umapenca.imgix.net/1/x.jpg", href: "https://artigos.useorigens.com.br/caneca/1.html", umaPenca: { kind: "caneca", region: "sul" } },
      // On sale in the feed (79,90 instead of 90,00): the regular price comes along to be struck through, with the "% OFF" a tag may show.
      { id: "3", name: "Caneca 3", price: "R$ 79,90", listPrice: "R$ 90,00", discount: 11, rawPrice: 79.9, imageUrl: "https://umapenca.imgix.net/3/x.jpg", href: "https://artigos.useorigens.com.br/caneca/3.html", umaPenca: { kind: "caneca", region: "sul" } },
    ].map((i) => ({ ...i, price: i.price.replace(" ", " "), ...(i.listPrice ? { listPrice: i.listPrice.replace(" ", " ") } : {}) })));
    const both = resolveSource({ kind: "umapenca", articleKinds: ["caneca", "ecobag"], limit: 24 }, EDITORIAL, undefined, lookup);
    expect(both.status === "ok" && both.items.map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
  });

  test("no snapshot yet, or no lookup at all: unavailable (the section is hidden), never invented", () => {
    expect(resolveSource({ kind: "umapenca", articleKinds: ["caneca"], limit: 8 }, EDITORIAL, undefined, umaPencaLookup("sul", () => null))).toEqual({ status: "unavailable", reason: "umapenca-not-synced" });
    expect(resolveSource({ kind: "umapenca", articleKinds: ["caneca"], limit: 8 }, EDITORIAL)).toEqual({ status: "unavailable", reason: "umapenca-not-synced" });
  });
});

describe("home carousel from Uma Penca: publish check", () => {
  let dir: string;
  const env = process.env;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "umapenca-home-"));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
  });
  afterEach(() => {
    process.env = env;
    rmSync(dir, { recursive: true, force: true });
  });
  const withSource = (source: Section["source"]) => ({ ...(start().home!.sections.find((s) => s.template === "product-carousel") as Section), source });

  test("an Uma Penca section is never mistaken for an unimplemented manual source; it blocks only while the feed has nothing of its kinds", async () => {
    const doc = start();
    expect(sourceStatus(withSource({ kind: "umapenca", articleKinds: ["caneca"], limit: 8 }), doc)?.problem).toMatch(/ainda não foi sincronizado/);
    await writeUmaPencaSnapshot({ ...SNAPSHOT, articles: [article("2", "ecobag")] }, path.join(dir, "umapenca-snapshot.json"));
    expect(sourceStatus(withSource({ kind: "umapenca", articleKinds: ["caneca"], limit: 8 }), doc)?.problem).toMatch(/não tem produtos desse tipo/);
    expect(sourceStatus(withSource({ kind: "umapenca", articleKinds: ["caneca", "ecobag"], limit: 8 }), doc)).toEqual({ label: "Uma Penca · Canecas e Ecobags", products: 1, problem: null });
  });
});

describe("GoToPenca", () => {
  const PIXEL = "1558923262073052";
  const GA = "G-8GYTEJ1F77";
  let calls: unknown[][];
  beforeEach(() => {
    consent.granted = true;
    setActiveMetaPixel(PIXEL);
    setActiveGa4(GA);
    calls = [];
    vi.stubGlobal("window", {
      fbq: (method: string, id: string, ...rest: unknown[]) => calls.push(["fbq", method, id, ...rest]),
      gtag: (command: string, name: string, params: Record<string, unknown>) => calls.push(["gtag", command, name, params]),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  test("a click to Uma Penca fires the Meta custom event GoToPenca (never GoToInk) and GA4's select_item + go_to_umapenca, tagged with where it happened", () => {
    trackGoToUmaPenca({ productId: "426949", productName: "Caneca Lá de Aceguá", kind: "caneca", region: "sul", sourceSection: SOURCES.homeUmaPenca, value: 90, destinationUrl: "https://artigos.useorigens.com.br/caneca/la-de-acegua-426949.html" });
    expect(calls[0]).toEqual(["fbq", "trackSingleCustom", PIXEL, "GoToPenca", { product_id: "426949", source_section: "home_umapenca", article_kind: "caneca", region: "sul", currency: "BRL", value: 90 }]);
    expect(calls.slice(1).map((c) => c[2])).toEqual(["select_item", "go_to_umapenca"]);
    expect(calls[1][3]).toMatchObject({ item_list_name: "home_umapenca", send_to: GA });
    expect(calls[2][3]).toMatchObject({ source_section: "home_umapenca", destination_url: "https://artigos.useorigens.com.br/caneca/la-de-acegua-426949.html", value: 90, currency: "BRL" });
    expect(calls.some((c) => c[3] === "GoToInk")).toBe(false);
  });

  test("without consent nothing is sent", () => {
    consent.granted = false;
    trackGoToUmaPenca({ productId: "1", productName: "x", kind: "caneca", region: "sul", sourceSection: SOURCES.outrosArtigos, destinationUrl: "https://artigos.useorigens.com.br/caneca/1.html" });
    expect(calls).toEqual([]);
  });
});
