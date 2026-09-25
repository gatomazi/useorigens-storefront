import { expect, test, type Page, type Route } from "@playwright/test";

const REF = "AbCdEfGhIjKlMnOpQrStUv";
const IMG = "https://gcp-images.majestic.ink.rsvcloud.com/images/product_art/final_image/1880b16e4d326a02dea0508acc56925d.jpg";
const COLORS = ["Preta", "Branca", "Verde", "Cinza", "Marinho", "Vinho", "Areia", "Azul"];
const SIZES = ["P", "M", "G", "GG"];
const EVIDENCE = process.env.CART_MIRROR_EVIDENCE === "1";

type Snap = Record<string, unknown>;
const line = (i: number, over: Record<string, unknown> = {}) => ({
  productId: String(4932916 + i), name: "Serra Catarinense", color: COLORS[i % COLORS.length], size: SIZES[i % SIZES.length],
  variant: `v${i}`, quantity: 1, linePriceText: "R$ 109,90", linePrice: 109.9, image: IMG, ...over,
});
const snap = (n: number, over: Snap = {}): Snap => ({
  v: 1, count: n, items: Array.from({ length: n }, (_, i) => line(i)), subtotal: 109.9 * n, discount: 0, total: 109.9 * n,
  totalText: n === 0 ? undefined : `R$ ${(109.9 * n).toFixed(2).replace(".", ",")}`, ageSeconds: 120, expiresInSeconds: 1680, ...over,
});
const promo = (): Snap => snap(3, {
  items: [0, 1, 2].map((i) => line(i, { linePriceText: "R$ 99,28", listPriceText: "R$ 109,90" })), totalText: "R$ 297,84", ageSeconds: 5,
});

/** Answers the storefront's own route only; the Worker is never contacted from a test. Records what was asked. */
async function mockApi(page: Page, reply: (route: Route) => Promise<void> | void) {
  const requests: string[] = [];
  await page.route("**/api/cart-mirror**", async (route) => {
    requests.push(route.request().url());
    await reply(route);
  });
  return requests;
}
const ok = (body: Snap) => (route: Route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify(body) });
const status = (code: number) => (route: Route) => route.fulfill({ status: code, contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify({ error: code === 404 ? "not_found" : "unavailable" }) });

/** Real INK navigation is prevented (document never unloads), same approach as tracking-and-nav.spec.ts. */
async function blockInkNavigation(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("click", (e) => {
      const link = (e.target as HTMLElement | null)?.closest?.('a[href^="https://www.usesul.com.br"]');
      if (link) e.preventDefault();
    }, true);
  });
}
const storage = (page: Page) => page.evaluate(() => ({ session: { ...window.sessionStorage }, local: { ...window.localStorage } }));
const search = (page: Page) => new URL(page.url()).search;
const trigger = (page: Page) => page.getByTestId("cart-mirror-trigger");
const dialog = (page: Page) => page.getByTestId("cart-mirror-dialog");

test.describe("Cart mirror consumer: without a cart_ref the storefront is untouched", () => {
  test("given no cart_ref, then no trigger, no API request and no storage entry", async ({ page }) => {
    const requests = await mockApi(page, ok(snap(2)));
    await page.goto("/sul");
    await page.waitForTimeout(1500);
    await expect(trigger(page)).toHaveCount(0);
    expect(requests).toHaveLength(0);
    const { session, local } = await storage(page);
    expect(Object.keys(session).filter((k) => k.startsWith("origens"))).toEqual([]);
    expect(JSON.stringify(local)).not.toContain(REF);
  });

  test("given cart-mirror OFF at the Worker (real upstream 404), then the page stays neutral with no error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const requests = await mockApi(page, status(404));
    await page.goto(`/sul?cart_ref=${REF}`);
    await expect.poll(() => requests.length).toBe(1); // the token was captured and asked about …
    await expect.poll(async () => (await storage(page)).session["origens:cart_ref"]).toBeUndefined(); // … and then dropped
    await expect(trigger(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("Cart mirror consumer: capturing cart_ref", () => {
  test("given /sul?cart_ref=<valid>&utm=a, then the token is stored alone, the URL loses only cart_ref and the API is asked once", async ({ page }) => {
    const requests = await mockApi(page, ok(snap(2)));
    await page.goto(`/sul?utm_source=x&cart_ref=${REF}&q=1`);
    await expect(trigger(page)).toBeVisible();
    expect(search(page)).toBe("?utm_source=x&q=1");
    expect(page.url()).not.toContain(REF);
    const { session, local } = await storage(page);
    expect(session).toEqual({ "origens:cart_ref": REF });
    expect(Object.keys(local).filter((k) => !k.startsWith("useorigens:consent"))).toEqual([]);
    expect(JSON.stringify(session) + JSON.stringify(local)).not.toContain("Serra Catarinense"); // never the snapshot
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]).searchParams.get("ref")).toBe(REF);
  });

  test("given a deep /sul route, then capture works there too and the path and hash are preserved", async ({ page }) => {
    await mockApi(page, ok(snap(1)));
    await page.goto(`/sul/sc?cart_ref=${REF}#estados`);
    await expect(trigger(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/sul/sc");
    expect(new URL(page.url()).hash).toBe("#estados");
    expect(search(page)).toBe("");
  });

  test("given a malformed token, then it is removed from the URL, not stored and no request is made", async ({ page }) => {
    const requests = await mockApi(page, ok(snap(2)));
    await page.goto("/sul?cart_ref=not-a-valid-token&keep=1");
    await expect.poll(() => search(page)).toBe("?keep=1");
    expect((await storage(page)).session["origens:cart_ref"]).toBeUndefined();
    await page.waitForTimeout(800);
    expect(requests).toHaveLength(0);
    await expect(trigger(page)).toHaveCount(0);
  });

  test("given a stored token, when the page is refreshed, then the token is recovered and the summary comes back", async ({ page }) => {
    const requests = await mockApi(page, ok(snap(2)));
    await page.goto(`/sul?cart_ref=${REF}`);
    await expect(trigger(page)).toBeVisible();
    await page.reload();
    await expect(trigger(page)).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(search(page)).toBe("");
  });

  test("given a stored token, when the visitor navigates within /sul, then the token survives and the summary stays available", async ({ page }) => {
    await mockApi(page, ok(snap(2)));
    await page.goto(`/sul?cart_ref=${REF}`);
    await expect(trigger(page)).toBeVisible();
    await page.goto("/sul/sc");
    await expect(trigger(page)).toBeVisible();
  });

  test("given an expired token (404), then items are hidden, the token is dropped and no further request is made", async ({ page }) => {
    const requests = await mockApi(page, status(404));
    await page.goto(`/sul?cart_ref=${REF}`);
    await expect.poll(() => requests.length).toBe(1);
    await expect.poll(async () => (await storage(page)).session["origens:cart_ref"]).toBeUndefined();
    await expect(trigger(page)).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(800);
    expect(requests).toHaveLength(1);
  });

  test("given a snapshot older than 30 minutes, then the neutral state applies", async ({ page }) => {
    const requests = await mockApi(page, ok(snap(2, { ageSeconds: 1801, expiresInSeconds: 0 })));
    await page.goto(`/sul?cart_ref=${REF}`);
    await expect.poll(() => requests.length).toBe(1);
    await expect.poll(async () => (await storage(page)).session["origens:cart_ref"]).toBeUndefined();
    await expect(trigger(page)).toHaveCount(0);
  });
});

test.describe("Cart mirror consumer: analytics never see the token", () => {
  test("given accepted consent and both providers mocked, then no fbq/gtag call carries the token and there is exactly one PageView/page_view for the clean URL", async ({ page }) => {
    const fbq: unknown[][] = [];
    const gtag: unknown[][] = [];
    await page.exposeFunction("__reportFbq", (a: unknown[]) => fbq.push(a));
    await page.exposeFunction("__reportGtag", (a: unknown[]) => gtag.push(a));
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.fbq = (...a: unknown[]) => (w.__reportFbq as (a: unknown[]) => void)(a);
      w.gtag = (...a: unknown[]) => (w.__reportGtag as (a: unknown[]) => void)(a);
      window.localStorage.setItem("useorigens:consent:marketing", JSON.stringify({ choice: "accepted", version: 2, decidedAt: "2026-09-23T00:00:00.000Z" }));
    });
    await page.route(/connect\.facebook\.net|googletagmanager\.com/, (route) => route.abort());
    await mockApi(page, ok(snap(2)));
    await page.goto(`/sul?utm=a&cart_ref=${REF}`);
    await expect(trigger(page)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(JSON.stringify(fbq) + JSON.stringify(gtag)).not.toContain(REF);
    expect(fbq.filter((c) => c[1] === "PageView")).toHaveLength(1);
    const pageViews = gtag.filter((c) => c[0] === "event" && c[1] === "page_view");
    expect(pageViews).toHaveLength(1);
    expect((pageViews[0][2] as Record<string, string>).page_path).toBe("/sul?utm=a");
    expect((pageViews[0][2] as Record<string, string>).page_location).not.toContain("cart_ref");
  });
});

const SLUG = "paranaense-essencia";
async function mockAnalytics(page: Page, { consent = true, throwing = false }: { consent?: boolean; throwing?: boolean } = {}) {
  const gtag: unknown[][] = [];
  await page.exposeFunction("__reportGtag", (a: unknown[]) => gtag.push(a));
  await page.addInitScript(({ consent, throwing }) => {
    const w = window as unknown as Record<string, unknown>;
    w.fbq = () => undefined;
    w.gtag = (...a: unknown[]) => {
      if (throwing) throw new Error("blocked");
      (w.__reportGtag as (a: unknown[]) => void)(a);
    };
    if (consent) window.localStorage.setItem("useorigens:consent:marketing", JSON.stringify({ choice: "accepted", version: 2, decidedAt: "2026-09-23T00:00:00.000Z" }));
  }, { consent, throwing });
  await page.route(/connect\.facebook\.net|googletagmanager\.com/, (route) => route.abort());
  return gtag;
}
const custom = (gtag: unknown[][], name: string) => gtag.filter((c) => c[0] === "event" && c[1] === name).map((c) => c[2] as Record<string, string>);

test.describe("Origens events v1: arrival from the INK, mirror view and go-to-cart click", () => {
  test("given a landing from an INK link with consent, then ONE arrival event, the markers and the token are gone from the URL before any analytics payload", async ({ page }) => {
    const gtag = await mockAnalytics(page);
    await mockApi(page, ok(snap(2)));
    await page.goto(`/sul?utm=a&origens_src=ink_cart_drawer&origens_p=${SLUG}&cart_ref=${REF}`);
    await expect(trigger(page)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(search(page)).toBe("?utm=a");
    expect(custom(gtag, "origens_storefront_arrived")).toEqual([{ entry_point: "ink_cart_drawer", region: "sul", product_slug: SLUG }]);
    expect(JSON.stringify(gtag)).not.toContain(REF);
    expect(JSON.stringify(gtag)).not.toContain("origens_src");
    expect(JSON.stringify(gtag)).not.toContain("origens_p");
    const pageViews = custom(gtag, "page_view");
    expect(pageViews).toHaveLength(1);
    expect(pageViews[0].page_location).not.toMatch(/cart_ref|origens_/);
    await page.reload();
    await page.waitForTimeout(800);
    expect(custom(gtag, "origens_storefront_arrived")).toHaveLength(1); // the reload has no marker: consumed once
  });

  test("given no consent, then no custom event is sent but the URL is still cleaned", async ({ page }) => {
    const gtag = await mockAnalytics(page, { consent: false });
    await mockApi(page, ok(snap(1)));
    await page.goto(`/sul?origens_src=ink_post_add&origens_p=${SLUG}&cart_ref=${REF}`);
    await page.waitForTimeout(1500);
    expect(search(page)).toBe("");
    expect(gtag).toEqual([]);
  });

  test("given an unknown entry point or slug, then nothing is sent and both markers are removed", async ({ page }) => {
    const gtag = await mockAnalytics(page);
    await page.goto("/sul?origens_src=https%3A%2F%2Fevil.example&origens_p=not-one-of-five");
    await page.waitForTimeout(1200);
    expect(search(page)).toBe("");
    expect(custom(gtag, "origens_storefront_arrived")).toHaveLength(0);
  });

  test("given the panel is opened twice and the link clicked, then one view per opening and ONE click event with a bucket, no token", async ({ page }) => {
    const gtag = await mockAnalytics(page);
    await blockInkNavigation(page);
    await mockApi(page, ok(snap(2)));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(custom(gtag, "origens_cart_mirror_view")).toEqual([{ entry_point: "storefront_cart_mirror", region: "sul", cart_items_bucket: "2", mirror_age_bucket: "1_5m" }]);
    await dialog(page).getByTestId("cart-mirror-go").click();
    expect(custom(gtag, "origens_go_to_cart_click")).toEqual([{ entry_point: "storefront_cart_mirror", region: "sul", cart_items_bucket: "2", transport_type: "beacon" }]);
    await dialog(page).getByTestId("cart-mirror-continue").click();
    await trigger(page).click();
    await page.waitForTimeout(400);
    expect(custom(gtag, "origens_cart_mirror_view")).toHaveLength(2);
    expect(JSON.stringify(gtag)).not.toContain(REF);
    expect(gtag.filter((c) => c[1] === "begin_checkout" || c[1] === "purchase")).toHaveLength(0);
  });

  test("given an unavailable snapshot (error/neutral), then no view event is sent", async ({ page }) => {
    const gtag = await mockAnalytics(page);
    await mockApi(page, status(500));
    await page.goto(`/sul?cart_ref=${REF}`);
    await page.waitForTimeout(1200);
    expect(custom(gtag, "origens_cart_mirror_view")).toHaveLength(0);
  });

  test("given gtag throws on every call, then the click on Ir para meu carrinho is still a normal link click", async ({ page }) => {
    await mockAnalytics(page, { throwing: true });
    await mockApi(page, ok(snap(1)));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    const go = dialog(page).getByTestId("cart-mirror-go");
    await expect(go).toHaveAttribute("href", "https://www.usesul.com.br/usesul/product/serra-catarinense?origens_open_cart=1");
    const navigation = page.waitForRequest((request) => request.url().startsWith("https://www.usesul.com.br/usesul/product/serra-catarinense"), { timeout: 8000 }).catch(() => null);
    await page.route("https://www.usesul.com.br/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html>INK stub</html>" }));
    await go.click();
    expect(await navigation).not.toBeNull();
  });
});

test.describe("Cart mirror consumer: UI", () => {
  test("given 2 items, then count, lines, detail, prices, total, age and the snapshot notice are shown; no checkout, no editing", async ({ page }) => {
    await mockApi(page, ok(snap(2, { items: [line(0, { color: "Marinho", size: "M" }), line(1)] })));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole("heading", { name: "Meu carrinho" })).toBeVisible();
    await expect(d.getByTestId("cart-mirror-count")).toHaveText("2 produtos na INK");
    await expect(d.getByTestId("cart-mirror-item")).toHaveCount(2);
    await expect(d.getByTestId("cart-mirror-item").first()).toContainText("Serra Catarinense");
    await expect(d.getByTestId("cart-mirror-item").first()).toContainText("Marinho · M · 1 un.");
    await expect(d.getByTestId("cart-mirror-line-price").first()).toHaveText("R$ 109,90");
    await expect(d.getByTestId("cart-mirror-list-price")).toHaveCount(0);
    await expect(d.getByTestId("cart-mirror-total")).toHaveText("R$ 219,80");
    await expect(d.getByTestId("cart-mirror-age")).toHaveText("Última atualização há 2 min");
    await expect(d).toContainText("Este resumo pode estar desatualizado.");
    await expect(d).toContainText("O carrinho oficial é o da INK.");
    await expect(d).not.toContainText(/finalizar compra/i);
    await expect(d).not.toContainText(/tempo real/i);
    await expect(d.locator("input, select, textarea")).toHaveCount(0);
    await expect(d.getByRole("button")).toHaveCount(2); // only Fechar and Continuar escolhendo: no quantity or remove controls
    await expect(d.getByRole("link")).toHaveCount(1);
  });

  test("given 1 item, then the count reads in the singular", async ({ page }) => {
    await mockApi(page, ok(snap(1)));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    await expect(dialog(page).getByTestId("cart-mirror-count")).toHaveText("1 produto na INK");
  });

  test("given an empty snapshot, then a discreet empty state shows and the way to INK stays", async ({ page }) => {
    await mockApi(page, ok(snap(0, { totalText: undefined })));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    await expect(dialog(page).getByTestId("cart-mirror-empty")).toBeVisible();
    await expect(dialog(page).getByTestId("cart-mirror-go")).toBeVisible();
    await expect(dialog(page).getByTestId("cart-mirror-item")).toHaveCount(0);
  });

  test("given 8 items, then all 8 lines are reachable by scrolling inside the panel and the actions stay visible", async ({ page }) => {
    await mockApi(page, ok(snap(8)));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    const d = dialog(page);
    await expect(d.getByTestId("cart-mirror-item")).toHaveCount(8);
    await d.getByTestId("cart-mirror-item").last().scrollIntoViewIfNeeded();
    await expect(d.getByTestId("cart-mirror-item").last()).toBeInViewport();
    await expect(d.getByTestId("cart-mirror-go")).toBeInViewport();
    await expect(d.getByTestId("cart-mirror-continue")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("given a promotional cart, then the struck list price, the effective price and INK's total are shown exactly as received", async ({ page }) => {
    await mockApi(page, ok(promo()));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    const d = dialog(page);
    await expect(d.getByTestId("cart-mirror-list-price").first()).toHaveText(/R\$ 109,90/);
    expect(await d.getByTestId("cart-mirror-list-price").first().evaluate((el) => el.tagName)).toBe("S");
    await expect(d.getByTestId("cart-mirror-line-price").first()).toHaveText("R$ 99,28");
    await expect(d.getByTestId("cart-mirror-total")).toHaveText("R$ 297,84");
    await expect(d.getByTestId("cart-mirror-age")).toHaveText("Atualizado há poucos segundos");
  });

  test.describe("age label", () => {
    for (const [seconds, label] of [[0, "Atualizado há poucos segundos"], [30, "Atualizado há poucos segundos"], [31, "Última atualização há 1 min"], [600, "Última atualização há 10 min"]] as const) {
      test(`given ageSeconds=${seconds}, then "${label}"`, async ({ page }) => {
        await mockApi(page, ok(snap(1, { ageSeconds: seconds })));
        await page.goto(`/sul?cart_ref=${REF}`);
        await trigger(page).click();
        await expect(dialog(page).getByTestId("cart-mirror-age")).toHaveText(label);
      });
    }
  });

  test("given an upstream failure (502), then the page does not break, a short fallback shows and 'Ir para meu carrinho' remains", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mockApi(page, status(502));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    await expect(dialog(page).getByTestId("cart-mirror-error")).toBeVisible();
    await expect(dialog(page)).toContainText("O carrinho oficial é o da INK.");
    await expect(dialog(page).getByTestId("cart-mirror-go")).toBeVisible();
    await expect(dialog(page).getByTestId("cart-mirror-item")).toHaveCount(0);
    expect(errors).toEqual([]);
    expect((await storage(page)).session["origens:cart_ref"]).toBe(REF); // an outage is not an expiry: the token survives
  });

  test("given a network timeout, then the same graceful fallback applies", async ({ page }) => {
    await mockApi(page, (route) => route.abort("timedout"));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    await expect(dialog(page).getByTestId("cart-mirror-error")).toBeVisible();
  });

  test("given an error first, when the panel is reopened after the outage, then the summary loads", async ({ page }) => {
    let fail = true;
    await mockApi(page, (route) => (fail ? status(502)(route) : ok(snap(2))(route)));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    await expect(dialog(page).getByTestId("cart-mirror-error")).toBeVisible();
    fail = false;
    await dialog(page).getByTestId("cart-mirror-continue").click();
    await trigger(page).click();
    await expect(dialog(page).getByTestId("cart-mirror-item")).toHaveCount(2);
  });
});

test.describe("Cart mirror consumer: actions", () => {
  test("given the panel, then 'Continuar escolhendo' closes it and keeps the visitor on the same storefront page", async ({ page }) => {
    await mockApi(page, ok(snap(2)));
    await page.goto(`/sul/sc?cart_ref=${REF}`);
    await trigger(page).click();
    await dialog(page).getByTestId("cart-mirror-continue").click();
    await expect(dialog(page)).toBeHidden();
    expect(new URL(page.url()).pathname).toBe("/sul/sc");
    await expect(page.getByRole("link", { name: /Use Origens/ }).first()).toBeVisible();
    await page.getByRole("link", { name: /Use Origens/ }).first().click(); // still navigable
    await expect(page).toHaveURL(/\/sul$/);
  });

  test("given the panel, then Esc closes it", async ({ page }) => {
    await mockApi(page, ok(snap(2)));
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
  });

  test("given the panel, then 'Ir para meu carrinho' points exactly at the Serra page with origens_open_cart=1, in the same tab and without the token", async ({ page }) => {
    await mockApi(page, ok(snap(2)));
    await blockInkNavigation(page);
    await page.goto(`/sul?cart_ref=${REF}`);
    await trigger(page).click();
    const go = dialog(page).getByTestId("cart-mirror-go");
    await expect(go).toHaveAttribute("href", "https://www.usesul.com.br/usesul/product/serra-catarinense?origens_open_cart=1");
    expect(await go.getAttribute("target")).toBeNull();
    expect((await go.getAttribute("href")) ?? "").not.toContain(REF);
  });
});

test.describe("Cart mirror consumer: evidence and layout by viewport", () => {
  const viewports = [
    { name: "w1440", width: 1440, height: 900 }, { name: "w1280", width: 1280, height: 800 }, { name: "w768", width: 768, height: 1024 },
    { name: "w440", width: 440, height: 900 }, { name: "w390", width: 390, height: 844 }, { name: "w320", width: 320, height: 640 },
  ];
  for (const vp of viewports) {
    test(`given ${vp.name}, then the header keeps working with the trigger, the panel fits, nothing overflows`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await mockApi(page, ok(snap(2)));
      await page.goto(`/sul?cart_ref=${REF}`);
      await expect(trigger(page)).toBeVisible();

      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      const boxes = await page.evaluate(() => {
        const rect = (el: Element | null) => (el ? el.getBoundingClientRect().toJSON() : null);
        const header = document.querySelector("header")!;
        return {
          trigger: rect(document.querySelector('[data-testid="cart-mirror-trigger"]')),
          search: rect([...header.querySelectorAll("button")].find((b) => /Buscar cidade/.test(b.textContent ?? ""))!),
          menu: rect([...header.querySelectorAll("button")].find((b) => /menu/i.test((b.getAttribute("aria-label") ?? "") + b.textContent)) ?? null),
          logo: rect(header.querySelector("a")),
          vw: window.innerWidth,
        };
      });
      const t = boxes.trigger!, s = boxes.search!;
      expect(t.left).toBeGreaterThanOrEqual(0);
      expect(s.right).toBeLessThanOrEqual(boxes.vw);
      expect(t.right).toBeLessThanOrEqual(s.left + 1); // no overlap with the search button
      expect(t.width).toBeGreaterThanOrEqual(44);
      expect(t.height).toBeGreaterThanOrEqual(44);
      if (boxes.logo) expect(boxes.logo.right).toBeLessThanOrEqual(t.left + 1); // and none with the logo

      if (EVIDENCE) await page.screenshot({ path: `docs/evidence/cart-mirror/header-${vp.name}.jpg`, type: "jpeg", quality: 80 });

      await trigger(page).click();
      const d = dialog(page);
      await expect(d.getByTestId("cart-mirror-item")).toHaveCount(2);
      await expect(d.getByTestId("cart-mirror-go")).toBeInViewport();
      await expect(d.getByTestId("cart-mirror-continue")).toBeInViewport();
      const box = await d.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
      expect(await overflow()).toBeLessThanOrEqual(0);
      if (EVIDENCE) await page.screenshot({ path: `docs/evidence/cart-mirror/panel-2-${vp.name}.jpg`, type: "jpeg", quality: 80 });
    });
  }

  for (const [label, n, reply] of [["8", 8, () => ok(snap(8))], ["promo", 3, () => ok(promo())], ["empty", 0, () => ok(snap(0, { totalText: undefined }))], ["error", 0, () => status(502)]] as const) {
    for (const vp of [viewports[1], viewports[4], viewports[5]]) {
      test(`given the ${label} state at ${vp.name}, then it renders and (with EVIDENCE=1) is captured`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await mockApi(page, reply());
        await page.goto(`/sul?cart_ref=${REF}`);
        await trigger(page).click();
        if (n > 0) await expect(dialog(page).getByTestId("cart-mirror-item")).toHaveCount(n);
        await expect(dialog(page).getByTestId("cart-mirror-go")).toBeInViewport();
        await page.waitForTimeout(700); // thumbnails
        if (EVIDENCE) await page.screenshot({ path: `docs/evidence/cart-mirror/panel-${label}-${vp.name}.jpg`, type: "jpeg", quality: 80 });
      });
    }
  }

  test("given the home without a cart_ref, then it is captured as the untouched baseline", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sul");
    await expect(trigger(page)).toHaveCount(0);
    if (EVIDENCE) await page.screenshot({ path: "docs/evidence/cart-mirror/no-cart-ref-w390.jpg", type: "jpeg", quality: 80 });
  });
});
