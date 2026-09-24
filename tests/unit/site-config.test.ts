import { describe, expect, test } from "vitest";
import { bundleChecksum, canonicalJson } from "@/lib/site-config/checksum";
import { firstImageSectionId, focalToCss, renderableSections, resolveBackground, resolveTracking } from "@/lib/site-config/resolve";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { validateBundle, validateScopeDoc, type Appearance, type PublishedBundle, type ScopeDoc, type Section } from "@/lib/site-config/schema";
import { destinationHref, resolveSource } from "@/lib/site-config/sources";

const ENV = { metaPixelId: "1558923262073052", ga4MeasurementId: "G-8GYTEJ1F77" };
const seed = () => buildSeedBundle(ENV);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sulSections = (b: PublishedBundle): Section[] => b.docs.sul.home!.sections;

describe("seed", () => {
  test("given the current Sul home, when the seed is built, then the bundle is schema-valid", () => {
    const result = validateBundle(seed());
    expect(result.ok, result.ok ? "" : result.errors.join("\n")).toBe(true);
  });

  test("given the seed, when read, then the sections follow the published Sul order exactly", () => {
    const order = sulSections(seed()).map((s) => s.anchor);
    expect(order).toEqual(["hero", "estilos", "terra", "estados", "redesenhos", "feito-para-voce", "fala", "geografia", "origem", "footer"]);
  });

  test("given the seed, when built twice, then it is byte-identical (deterministic, checksummable)", () => {
    expect(canonicalJson(seed())).toBe(canonicalJson(seed()));
    expect(bundleChecksum(seed())).toBe(bundleChecksum(seed()));
  });

  test("given the seed, when the media table is read, then every referenced image resolves to a real /public banner", () => {
    const bundle = seed();
    for (const s of sulSections(bundle)) {
      for (const ref of [s.appearance.image?.mobile, s.appearance.image?.desktop]) {
        if (ref) expect(bundle.media[ref.assetId]?.src).toMatch(/^\/banners\/sul\/.+\.png$/);
      }
    }
  });

  test("given the seed, when a section keeps a plain ground on purpose (DDD), then it has no image and no 'Ver todos'", () => {
    const ddd = sulSections(seed()).find((s) => s.anchor === "geografia")!;
    expect(ddd.appearance.image).toBeUndefined();
    expect(ddd.cta).toBeUndefined();
  });

  test("given the seed, when hashed, then it matches the pinned checksum — the seed is immutable unless a change is deliberate", () => {
    // If this fails you changed the current Sul home (copy, order, banners, layout or tracking mapping). That is only legitimate
    // together with the hard-coded home in src/app/[region]/page.tsx and a fresh run of scripts/verify-home-equivalence.mts.
    expect(bundleChecksum(seed())).toBe("29c7302fd1c650a3b3e1aaecb1a74f1d6dad5f67afae2fc48070608e2a242a62");
  });

  test("given env without tracking IDs, when seeded, then Sul is disabled rather than inventing an ID", () => {
    const bundle = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
    expect(bundle.docs.sul.tracking).toEqual({ meta: { mode: "disabled" }, ga4: { mode: "disabled" } });
  });
});

describe("tracking resolution (D5)", () => {
  test("given no published bundle, when resolved, then the current env values are returned untouched", () => {
    expect(resolveTracking(null, "sul", ENV)).toEqual({ metaPixelId: "1558923262073052", ga4MeasurementId: "G-8GYTEJ1F77", source: "env" });
  });

  test("given the seed, when Sul is resolved, then it matches today's IDs", () => {
    expect(resolveTracking(seed(), "sul", { metaPixelId: null, ga4MeasurementId: null })).toEqual({ metaPixelId: "1558923262073052", ga4MeasurementId: "G-8GYTEJ1F77", source: "published" });
  });

  test("given the seed, when a region inherits and the global is off, then nothing is enabled", () => {
    expect(resolveTracking(seed(), "norte", ENV)).toEqual({ metaPixelId: null, ga4MeasurementId: null, source: "published" });
  });

  test("given a global Meta ID, when a region inherits Meta but overrides GA4, then each vendor resolves independently", () => {
    const bundle = clone(seed());
    bundle.docs.global.tracking.meta = { mode: "override", id: "1111111111111111" };
    bundle.docs.norte.tracking = { meta: { mode: "inherit" }, ga4: { mode: "override", id: "G-NORTE0001" } };
    expect(resolveTracking(bundle, "norte", ENV)).toEqual({ metaPixelId: "1111111111111111", ga4MeasurementId: "G-NORTE0001", source: "published" });
  });

  test("given a region that disables a vendor, when the global has an ID, then the region still gets none", () => {
    const bundle = clone(seed());
    bundle.docs.global.tracking.ga4 = { mode: "override", id: "G-GLOBAL0001" };
    bundle.docs.norte.tracking.ga4 = { mode: "disabled" };
    expect(resolveTracking(bundle, "norte", ENV).ga4MeasurementId).toBeNull();
  });
});

describe("background fallback", () => {
  const media = seed().media;
  const both: Appearance = {
    fill: { kind: "solid", color: "#112233" },
    image: { mobile: { assetId: "legacy:sul/hero-mobile", alt: "", decorative: true }, desktop: { assetId: "legacy:sul/hero-desktop", alt: "", decorative: true } },
    focal: { mobile: { x: 30, y: 35 }, desktop: { x: 30, y: 35 } },
    overlay: { preset: "regional-wash" },
  };

  test("given both images published, when resolved, then both breakpoints carry their image", () => {
    const bg = resolveBackground(both, media);
    expect(bg.images.mobile?.src).toBe("/banners/sul/hero-mobile.png");
    expect(bg.images.desktop?.src).toBe("/banners/sul/hero-desktop.png");
  });

  test("given only a mobile image, when resolved, then desktop shows the fill — a mobile crop is never reused implicitly", () => {
    const bg = resolveBackground({ ...both, image: { mobile: both.image!.mobile } }, media);
    expect(bg.images.mobile).not.toBeNull();
    expect(bg.images.desktop).toBeNull();
    expect(bg.fill).toEqual({ kind: "solid", color: "#112233" });
  });

  test("given only a mobile image and reuse opted in, when resolved, then desktop reuses it", () => {
    const bg = resolveBackground({ ...both, image: { mobile: both.image!.mobile, reuseMobileOnDesktop: true } }, media);
    expect(bg.images.desktop?.src).toBe("/banners/sul/hero-mobile.png");
  });

  test("given an asset id that is not in the media table, when resolved, then it is 'no image', never a broken picture", () => {
    const bg = resolveBackground({ ...both, image: { mobile: { assetId: "01JMISSING", alt: "", decorative: true }, desktop: { assetId: "01JMISSING2", alt: "", decorative: true } } }, media);
    expect(bg.images).toEqual({ mobile: null, desktop: null });
  });

  test("given no image config at all, when resolved, then only the fill remains", () => {
    const bg = resolveBackground({ fill: { kind: "gradient", from: "#000000", to: "token:ground", angle: 180 }, focal: both.focal, overlay: { preset: "none" } }, media);
    expect(bg.images).toEqual({ mobile: null, desktop: null });
    expect(bg.fill.kind).toBe("gradient");
  });

  test("given a focal point, when serialised, then it matches the CSS the original banners used", () => {
    expect(focalToCss({ x: 30, y: 35 })).toBe("30% 35%");
    expect(focalToCss({ x: 50, y: 50 })).toBe("50% 50%");
  });

  test("given the seed, when the LCP candidate is chosen, then it is the hero (first active section with an image)", () => {
    const bundle = seed();
    expect(firstImageSectionId(renderableSections(bundle.docs.sul), bundle.media)).toBe("seed-hero");
  });

  test("given an inactive hero, when the LCP candidate is chosen, then the next section with an image gets it", () => {
    const bundle = clone(seed());
    sulSections(bundle)[0].active = false;
    expect(firstImageSectionId(renderableSections(bundle.docs.sul), bundle.media)).toBe("seed-fala");
  });
});

describe("renderable sections", () => {
  test("given the seed, when listed, then the footer (owned by the layout) is not a home section", () => {
    expect(renderableSections(seed().docs.sul).map((s) => s.template)).not.toContain("footer");
  });

  test("given an inactive section, when listed, then it is skipped", () => {
    const bundle = clone(seed());
    sulSections(bundle).find((s) => s.anchor === "terra")!.active = false;
    expect(renderableSections(bundle.docs.sul).map((s) => s.anchor)).not.toContain("terra");
  });
});

describe("validation", () => {
  const docOf = (mutate: (d: ScopeDoc) => void): ScopeDoc => {
    const d = clone(seed().docs.sul);
    mutate(d);
    return d;
  };
  const errorsOf = (d: ScopeDoc): string => {
    const r = validateScopeDoc(d);
    return r.ok ? "" : r.errors.join("\n");
  };

  test("given a Meta Pixel ID with letters, when validated, then it is rejected", () => {
    expect(errorsOf(docOf((d) => (d.tracking.meta = { mode: "override", id: "12ab" })))).toContain("tracking.meta.id");
  });

  test("given a malformed GA4 ID, when validated, then it is rejected", () => {
    expect(errorsOf(docOf((d) => (d.tracking.ga4 = { mode: "override", id: "UA-123" })))).toContain("tracking.ga4.id");
  });

  test("given a global scope that inherits, when validated, then it is rejected (nothing above it)", () => {
    const g = clone(seed().docs.global);
    g.tracking.meta = { mode: "inherit" };
    expect(validateScopeDoc(g).ok).toBe(false);
  });

  test("given a CTA to a host outside the allowlist, when validated, then it is rejected", () => {
    const d = docOf((doc) => (doc.home!.sections.find((s) => s.anchor === "terra")!.cta = { label: "Ver", dest: { kind: "external", url: "https://evil.example/collections/x" } }));
    expect(errorsOf(d)).toContain("cta.dest.url");
  });

  test("given a CTA over http, when validated, then it is rejected", () => {
    const d = docOf((doc) => (doc.home!.sections.find((s) => s.anchor === "terra")!.cta = { label: "Ver", dest: { kind: "external", url: "http://www.usesul.com.br/x" } }));
    expect(errorsOf(d)).toContain("cta.dest.url");
  });

  test("given an internal route with traversal or a scheme, when validated, then it is rejected", () => {
    for (const path of ["/sul/../admin", "//evil.example", "javascript:alert(1)", "/Sul/SC"]) {
      const d = docOf((doc) => (doc.home!.sections.find((s) => s.anchor === "terra")!.cta = { label: "Ver", dest: { kind: "route", path } }));
      expect(errorsOf(d), path).toContain("cta.dest.path");
    }
  });

  test("given a meaningful image without alt text, when validated, then it is rejected; decorative must be empty", () => {
    const noAlt = docOf((d) => (d.home!.sections[0].appearance.image!.mobile = { assetId: "legacy:sul/hero-mobile", alt: "", decorative: false }));
    expect(errorsOf(noAlt)).toContain("required unless decorative");
    const decorativeWithAlt = docOf((d) => (d.home!.sections[0].appearance.image!.mobile = { assetId: "legacy:sul/hero-mobile", alt: "foto", decorative: true }));
    expect(errorsOf(decorativeWithAlt)).toContain("must be empty when decorative");
  });

  test("given an overlay opacity above the cap or a bad colour, when validated, then it is rejected", () => {
    expect(errorsOf(docOf((d) => (d.home!.sections[0].appearance.overlay = { color: "#000000", opacity: 0.95 })))).toContain("overlay.opacity");
    expect(errorsOf(docOf((d) => (d.home!.sections[0].appearance.overlay = { color: "red" as `#${string}`, opacity: 0.5 })))).toContain("overlay.color");
  });

  test("given a focal point outside 0..100, when validated, then it is rejected", () => {
    expect(errorsOf(docOf((d) => (d.home!.sections[0].appearance.focal.mobile = { x: 120, y: 50 })))).toContain("focal.mobile");
  });

  test("given duplicated anchors, when validated, then it is rejected", () => {
    expect(errorsOf(docOf((d) => (d.home!.sections[2].anchor = "estilos")))).toContain("duplicate anchor");
  });

  test("given a hero that is not first, or a footer that is not last, when validated, then it is rejected", () => {
    expect(errorsOf(docOf((d) => d.home!.sections.reverse()))).toContain("must be the hero");
  });

  test("given an unknown analytics origin, when validated, then it is rejected (no free-form strings into Meta/GA4)", () => {
    const d = docOf((doc) => ((doc.home!.sections.find((s) => s.anchor === "terra")! as { analyticsSource: string }).analyticsSource = "home_custom"));
    expect(errorsOf(d)).toContain("analyticsSource");
  });

  test("given an ink-category source with a limit outside 3..24, when validated, then it is rejected", () => {
    const d = docOf((doc) => (doc.home!.sections.find((s) => s.anchor === "terra")!.source = { kind: "ink-category", store: "use-sul", collectionId: 1, order: "category", limit: 40 }));
    expect(errorsOf(d)).toContain("source.limit");
  });

  test("given a bundle whose section references an unknown media id, when validated, then it is rejected", () => {
    const bundle = clone(seed());
    delete bundle.media["legacy:sul/hero-mobile"];
    const r = validateBundle(bundle);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join("\n")).toContain("not in the media table");
  });

  test("given a media entry with a traversal path, when validated, then it is rejected", () => {
    const bundle = clone(seed());
    bundle.media["legacy:sul/hero-mobile"].src = "/banners/../../etc/passwd";
    expect(validateBundle(bundle).ok).toBe(false);
  });

  test("given non-object input, when validated, then it returns errors instead of throwing", () => {
    for (const bad of [null, 42, "x", [], { schemaVersion: 2 }]) {
      expect(validateScopeDoc(bad).ok).toBe(false);
      expect(validateBundle(bad).ok).toBe(false);
    }
  });
});

describe("checksum", () => {
  test("given two objects with the same content in another key order, when hashed, then the checksum is equal", () => {
    expect(bundleChecksum({ a: 1, b: { c: [1, 2], d: null } })).toBe(bundleChecksum({ b: { d: null, c: [1, 2] }, a: 1 }));
  });

  test("given a one-character change, when hashed, then the checksum changes", () => {
    const a = seed();
    const b = clone(a);
    b.docs.sul.home!.sections[0].title = "O seu lugar,\ndo seu jeito!";
    expect(bundleChecksum(a)).not.toBe(bundleChecksum(b));
  });
});

describe("section sources", () => {
  const items = { terra: [{ id: "1" }], recreations: [], lenda: [], dizeres: [], ddd: [] } as unknown as Parameters<typeof resolveSource>[1];

  test("given an editorial-module source, when resolved, then it yields that module's items", () => {
    expect(resolveSource({ kind: "editorial-module", key: "terra" }, items)).toEqual({ status: "ok", items: items.terra });
  });

  test("given an ink-category source, when resolved, then it is explicitly unavailable — categories are never guessed", () => {
    expect(resolveSource({ kind: "ink-category", store: "use-sul", collectionId: 1, order: "category", limit: 6 }, items)).toEqual({ status: "unavailable", reason: "ink-collections-not-synced" });
  });

  test("given destinations, when turned into hrefs, then an unresolved INK collection yields null", () => {
    expect(destinationHref({ kind: "route", path: "/sul/sc" })).toBe("/sul/sc");
    expect(destinationHref({ kind: "external", url: "https://www.usesul.com.br/usesul/collections/x" })).toBe("https://www.usesul.com.br/usesul/collections/x");
    expect(destinationHref({ kind: "ink-collection", store: "use-sul", collectionId: 5 })).toBeNull();
  });
});
