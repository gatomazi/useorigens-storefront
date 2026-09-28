import { expect, test, type APIRequestContext } from "@playwright/test";

// The crawler's view: the INITIAL HTML of the response (no JavaScript), fetched with the canonical Host so nothing marks it noindex.
const HOST = { Host: "www.useorigens.com.br" };
const html = async (request: APIRequestContext, path: string) => {
  const res = await request.get(path, { headers: HOST });
  expect(res.status(), path).toBe(200);
  return res.text();
};
const one = (source: string, re: RegExp) => re.exec(source)?.[1];
const h1s = (source: string) => [...source.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
const jsonLd = (source: string) => [...source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
const breadcrumbNames = (source: string) => {
  const list = jsonLd(source).find((d) => d["@type"] === "BreadcrumbList") as { itemListElement: { name: string; position: number; item: string }[] } | undefined;
  return list?.itemListElement ?? [];
};

test.describe("SEO: what a crawler reads in the initial HTML", () => {
  test("given the Sul home, when fetched, then title, description, canonical, one H1 and site + organisation data are present", async ({ request }) => {
    const source = await html(request, "/sul");
    expect(one(source, /<title>([^<]*)<\/title>/)).toBe("Camisetas do Sul e da Sua Cidade | Use Origens");
    expect(one(source, /<meta name="description" content="([^"]*)"/)).toContain("cidades do Paraná, de Santa Catarina e do Rio Grande do Sul");
    expect(one(source, /<link rel="canonical" href="([^"]*)"/)).toBe("https://www.useorigens.com.br/sul");
    expect(h1s(source)).toHaveLength(1);
    expect(jsonLd(source).map((d) => d["@type"]).sort()).toEqual(["Organization", "WebSite"]);
    expect(one(source, /<meta property="og:site_name" content="([^"]*)"/)).toBe("Use Origens");
  });

  for (const [path, title] of [
    ["/sul/rs", "Camisetas Gaúchas e de Cidades do RS | Use Origens"],
    ["/sul/sc", "Camisetas Catarinenses e de Cidades de SC | Use Origens"],
    ["/sul/pr", "Camisetas Paranaenses e de Cidades do PR | Use Origens"],
  ] as const) {
    test(`given ${path}, when fetched, then it has the reviewed title, real count, visible intro and a breadcrumb equal to the visible one`, async ({ request }) => {
      const source = await html(request, path);
      expect(one(source, /<title>([^<]*)<\/title>/)).toBe(title);
      const description = one(source, /<meta name="description" content="([^"]*)"/) ?? "";
      expect(description).toMatch(/\d+ cidades/);
      expect(source).toContain(description.match(/(\d+) cidades/)![0]);
      expect(h1s(source)).toHaveLength(1);
      expect(breadcrumbNames(source).map((c) => c.name)).toEqual(["Sul", h1s(source)[0]]);
      expect(source).toMatch(/Camisetas (gaúchas|catarinenses|paranaenses) e de cidades d/);
    });
  }

  test("given a city, when fetched, then it keeps its title, lists only its real styles and the intro comes AFTER the styles grid", async ({ request }) => {
    const source = await html(request, "/sul/rs/bage");
    expect(one(source, /<title>([^<]*)<\/title>/)).toBe("Camisetas de Bagé, RS | Use Origens");
    expect(one(source, /<link rel="canonical" href="([^"]*)"/)).toBe("https://www.useorigens.com.br/sul/rs/bage");
    expect(h1s(source)).toEqual(["Bagé"]);
    expect(breadcrumbNames(source).map((c) => c.name)).toEqual(["Sul", "Rio Grande do Sul", "Bagé"]);
    expect(breadcrumbNames(source).map((c) => c.position)).toEqual([1, 2, 3]);
    const intro = source.indexOf("Camisetas de Bagé, no Rio Grande do Sul. Na Use Sul há");
    expect(intro).toBeGreaterThan(source.indexOf('id="styles-title"'));
    expect(intro).toBeGreaterThan(source.indexOf("Contorno do estado"));
  });

  test("given the visible breadcrumb of a city, when compared with the structured one, then names and links agree", async ({ page }) => {
    await page.goto("/sul/rs/bage");
    const visible = await page.locator('nav[aria-label="Você está em"] a, nav[aria-label="Você está em"] [aria-current="page"]').allInnerTexts();
    expect(visible.map((t) => t.trim())).toEqual(["Sul", "Rio Grande do Sul", "Bagé"]);
    const hrefs = await page.locator('nav[aria-label="Você está em"] a').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs).toEqual(["/sul", "/sul/rs"]);
  });

  test("given a design family page, when fetched, then it has exactly ONE H1 and a four-level breadcrumb", async ({ request }) => {
    const source = await html(request, "/sul/rs/bage/ponto-de-origem");
    expect(one(source, /<title>([^<]*)<\/title>/)).toBe("Ponto de Origem de Bagé, RS | Use Origens");
    expect(h1s(source)).toEqual(["Ponto de Origem"]);
    expect(breadcrumbNames(source).map((c) => c.name)).toEqual(["Sul", "Rio Grande do Sul", "Bagé", "Ponto de Origem"]);
    expect(one(source, /<meta property="og:image" content="([^"]*)"/)).toMatch(/^https:\/\//);
  });

  test("given homonymous cities of different states, when their titles are read, then each carries its own UF and canonical", async ({ request }) => {
    const [a, b] = await Promise.all([html(request, "/sul/pr/cruzeiro-do-sul"), html(request, "/sul/rs/cruzeiro-do-sul")]);
    expect(one(a, /<title>([^<]*)<\/title>/)).toBe("Camisetas de Cruzeiro do Sul, PR | Use Origens");
    expect(one(b, /<title>([^<]*)<\/title>/)).toBe("Camisetas de Cruzeiro do Sul, RS | Use Origens");
    expect(one(a, /<link rel="canonical" href="([^"]*)"/)).not.toBe(one(b, /<link rel="canonical" href="([^"]*)"/));
  });

  test("given the indexable pages, when their structured data is read, then no Product, Offer or price is ever claimed and no keywords meta exists", async ({ request }) => {
    for (const path of ["/sul", "/sul/rs", "/sul/rs/bage", "/sul/rs/bage/ponto-de-origem"]) {
      const source = await html(request, path);
      expect(JSON.stringify(jsonLd(source)), path).not.toMatch(/Product|Offer|"price"|availability|aggregateRating/);
      expect(source, path).not.toMatch(/<meta name="keywords"/i);
    }
  });

  test("given a city URL with campaign parameters, when fetched, then the canonical is clean", async ({ request }) => {
    const source = await html(request, "/sul/rs/bage?utm_source=google&utm_medium=cpc&fbclid=abc&gclid=xyz");
    expect(one(source, /<link rel="canonical" href="([^"]*)"/)).toBe("https://www.useorigens.com.br/sul/rs/bage");
  });

  test("given a page that must stay out of the index, when fetched, then it still says noindex and has no breadcrumb data", async ({ request }) => {
    const source = await html(request, "/sul/busca?q=teste");
    expect(source).toContain('name="robots" content="noindex');
    expect(jsonLd(source)).toHaveLength(0);
  });
});
