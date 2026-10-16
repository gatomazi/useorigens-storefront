import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The single store's domain switch (src/lib/ink/sul-domain.ts): every link follows NEXT_PUBLIC_INK_SUL_DOMAIN, and a URL INK sent on EITHER domain
// is accepted, so a sync that runs between the INK switch and the flag never drops a piece.
const load = async (value?: string) => {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("NEXT_PUBLIC_INK_SUL_DOMAIN", "");
  else vi.stubEnv("NEXT_PUBLIC_INK_SUL_DOMAIN", value);
  return {
    domain: await import("@/lib/ink/sul-domain"),
    config: await import("@/lib/ink/config"),
    index: await import("@/lib/catalog/garment-index-file"),
    cart: await import("@/lib/cart-mirror/constants"),
    sources: await import("@/lib/site-config/sources"),
    editorial: await import("@/lib/editorial/collections"),
    site: await import("@/lib/site"),
  };
};
afterEach(() => vi.unstubAllEnvs());

const OLD = "https://www.usesul.com.br/usesul/product/florianopolis-origem-sc";
const NEW = "https://loja.useorigens.com.br/useorigens/product/florianopolis-origem-sc";

describe("single store domain", () => {
  it("today (unset or any other value): every Sul link is www.usesul.com.br/usesul", async () => {
    for (const value of [undefined, "current", "proxima"]) {
      const m = await load(value);
      expect(m.config.STORE_PRODUCT_URL_BASE["use-sul"]).toBe("https://www.usesul.com.br/usesul/product");
      expect(m.cart.inkCartUrlFor("sul")).toBe("https://www.usesul.com.br/usesul/product/serra-catarinense?origens_open_cart=1");
      expect(m.sources.collectionUrl("use-sul", "fala-daqui")).toBe("https://www.usesul.com.br/usesul/collections/fala-daqui");
      expect(m.editorial.REAL_COLLECTIONS.fala).toBe("https://www.usesul.com.br/usesul/collections/fala-daqui");
      expect(m.site.LEGACY_STORE_URLS.sul).toBe("https://www.usesul.com.br");
      expect(m.config.INK_STORES["use-sul"]?.expectedStoreSlug).toBe("usesul");
    }
  });

  it("with next: every Sul link is loja.useorigens.com.br/useorigens; the other stores do not change", async () => {
    const m = await load("next");
    expect(m.config.STORE_PRODUCT_URL_BASE["use-sul"]).toBe("https://loja.useorigens.com.br/useorigens/product");
    expect(m.cart.inkCartUrlFor("sul")).toBe("https://loja.useorigens.com.br/useorigens/product/serra-catarinense?origens_open_cart=1");
    expect(m.cart.upstreamCartRefUrlFor("sul")).toBe("https://loja.useorigens.com.br/__origens/cart-ref/");
    expect(m.sources.collectionUrl("use-sul", "fala-daqui")).toBe("https://loja.useorigens.com.br/useorigens/collections/fala-daqui");
    expect(m.editorial.REAL_COLLECTIONS.terra).toBe("https://loja.useorigens.com.br/useorigens/collections/da-nossa-terra");
    expect(m.site.LEGACY_STORE_URLS.sul).toBe("https://loja.useorigens.com.br");
    expect(m.config.STORE_PRODUCT_URL_BASE["use-norte"]).toBe("https://www.usenorte.com.br/usenorte/product");
    expect(m.sources.collectionUrl("use-norte", "fala-de-onde")).toBe("https://www.usenorte.com.br/usenorte/collections/fala-de-onde");
    // Every host the storefront builds is one a purchase link may point to.
    expect(m.config.ALLOWED_COMMERCE_HOSTS.has("loja.useorigens.com.br")).toBe(true);
  });

  it("a URL INK sent on either domain is the store's own (both ways), and the index rebuilds it with the active domain", async () => {
    for (const value of [undefined, "next"]) {
      const m = await load(value);
      expect(m.index.urlMatchesShape("use-sul", "florianopolis-origem-sc", OLD)).toBe(true);
      expect(m.index.urlMatchesShape("use-sul", "florianopolis-origem-sc", NEW)).toBe(true);
      expect(m.index.urlMatchesShape("use-sul", "florianopolis-origem-sc", "https://evil.example/useorigens/product/florianopolis-origem-sc")).toBe(false);
      expect(m.index.urlMatchesShape("use-norte", "florianopolis-origem-sc", NEW)).toBe(false);
      expect(m.config.storeSlugMatches("use-sul", "usesul")).toBe(true);
      expect(m.config.storeSlugMatches("use-sul", "useorigens")).toBe(true);
      expect(m.config.storeSlugMatches("use-norte", "useorigens")).toBe(false);
      const piece = m.index.expandTuple("use-sul", [1, "123", "florianopolis-origem-sc", "x.jpg", 109.9]);
      expect(piece?.storeProductUrl).toBe(value === "next" ? NEW : OLD);
    }
  });
});
