import { describe, expect, test } from "vitest";
import { breadcrumbList, organization, serializeJsonLd, webSite } from "@/lib/seo/jsonld";

const SITE = "https://www.useorigens.com.br";

describe("JSON-LD builders", () => {
  test("given a breadcrumb trail, when built, then positions start at 1 and every item is an absolute canonical URL", () => {
    const data = breadcrumbList(SITE, [
      { name: "Sul", path: "/sul" },
      { name: "Rio Grande do Sul", path: "/sul/rs" },
      { name: "Bagé", path: "/sul/rs/bage" },
    ]);
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Sul", item: "https://www.useorigens.com.br/sul" },
      { "@type": "ListItem", position: 2, name: "Rio Grande do Sul", item: "https://www.useorigens.com.br/sul/rs" },
      { "@type": "ListItem", position: 3, name: "Bagé", item: "https://www.useorigens.com.br/sul/rs/bage" },
    ]);
  });

  test("given a site URL with a trailing slash, when built, then URLs never contain a double slash", () => {
    expect(JSON.stringify(breadcrumbList(`${SITE}/`, [{ name: "Sul", path: "/sul" }]))).not.toContain(".br//");
  });

  test("given the site and the organisation, when built, then they carry only verifiable facts", () => {
    expect(webSite(SITE)).toEqual({ "@context": "https://schema.org", "@type": "WebSite", name: "Use Origens", url: "https://www.useorigens.com.br/", inLanguage: "pt-BR" });
    expect(organization(SITE, { logoPath: "/brand/logo-sul.png", sameAs: ["https://www.instagram.com/usesul.oficial"] })).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Use Origens",
      url: "https://www.useorigens.com.br/",
      logo: "https://www.useorigens.com.br/brand/logo-sul.png",
      sameAs: ["https://www.instagram.com/usesul.oficial"],
    });
  });

  test("given no profile links, when the organisation is built, then sameAs is omitted", () => {
    expect(organization(SITE, { logoPath: "/brand/logo-sul.png", sameAs: [] })).not.toHaveProperty("sameAs");
  });

  test("given every builder, when serialised, then no Product, Offer, price, stock or rating is ever emitted", () => {
    const all = [breadcrumbList(SITE, [{ name: "Sul", path: "/sul" }]), webSite(SITE), organization(SITE, { logoPath: "/x.png", sameAs: [] })].map(serializeJsonLd).join("");
    expect(all).not.toMatch(/Product|Offer|price|availability|aggregateRating|review/i);
  });
});

describe("JSON-LD serialisation", () => {
  test("given a name that tries to close the script tag, when serialised, then no raw angle bracket or ampersand remains", () => {
    const text = serializeJsonLd(breadcrumbList(SITE, [{ name: "</script><script>alert(1)</script> & <!--", path: "/sul" }]));
    expect(text).not.toMatch(/[<>&]/);
    expect(JSON.parse(text).itemListElement[0].name).toBe("</script><script>alert(1)</script> & <!--");
  });

  test("given line and paragraph separators, when serialised, then they are escaped and still round-trip", () => {
    const value = `a b c`;
    const text = serializeJsonLd({ name: value });
    expect(text).not.toContain(" ");
    expect(text).not.toContain(" ");
    expect(JSON.parse(text).name).toBe(value);
  });

  test("given accents and apostrophes, when serialised, then they round-trip untouched", () => {
    const name = "Sant'Ana do Livramento – São José d’Oeste";
    expect(JSON.parse(serializeJsonLd({ name })).name).toBe(name);
  });
});
