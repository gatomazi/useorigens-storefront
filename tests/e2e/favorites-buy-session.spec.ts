import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Regression coverage for a real bug caught only by manual QA: "Comprar minha lista" minted a signed session but
 * navigated to the plain product URL, never attaching `?ls=` — meaning list-watch.js on the INK side would never
 * learn a session existed, and "Sua próxima camiseta" would never appear for anyone, on any session, ever. This
 * test asserts on the ACTUAL browser navigation, not just the pure URL-building helper (tests/unit/buy-session-url.test.ts),
 * since the original bug was in the wiring between the API response and the navigation call, not in a pure function.
 */
const FAVORITE = {
  inkProductId: "4969234",
  commerceStoreKey: "use-sul",
  title: "Ponto de Origem",
  context: "Porto Alegre · RS",
  imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/fake.jpg",
  price: 109.9,
  addedAt: Date.now(),
};
const FIRST_PRODUCT_URL = "https://www.usesul.com.br/usesul/product/porto-alegre-origem-rs";
const SESSION_ID = "eyJ2IjoxLCJzIjoidXNlLXN1bCIsInAiOlsiNDk2OTIzNCJdLCJ0IjoxfQ.abcdef0123456789";

async function seedFavorite(page: Page) {
  await page.addInitScript((item) => {
    window.localStorage.setItem("origens:favorites:v1", JSON.stringify({ v: 1, items: [item] }));
  }, FAVORITE);
}

async function mockResolveAndSession(page: Page) {
  const calls: string[] = [];
  await page.route("**/api/favorites/resolve**", async (route: Route) => {
    calls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [{ ...FAVORITE, url: FIRST_PRODUCT_URL, available: true }] }),
    });
  });
  await page.route("**/api/buy-session", async (route: Route) => {
    calls.push(route.request().url());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ sessionId: SESSION_ID, firstProductUrl: FIRST_PRODUCT_URL, total: 1 }),
    });
  });
  return calls;
}

/** Stands in for the real INK page (never actually reached): confirms the exact destination URL Playwright would have navigated to. */
async function interceptInkNavigation(page: Page) {
  await page.route(`${FIRST_PRODUCT_URL}**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>fake INK</title>" });
  });
}

test.describe("Meus Lugares: Comprar minha lista carries the buy-session id to INK", () => {
  test("given one eligible favorite, then the navigation URL includes ?ls=<sessionId> on the very first hop", async ({ page }) => {
    await seedFavorite(page);
    await mockResolveAndSession(page);
    await interceptInkNavigation(page);

    await page.goto("/sul/meus-lugares");
    await expect(page.getByRole("button", { name: "Comprar minha lista" })).toBeEnabled();
    await Promise.all([page.waitForURL(`${FIRST_PRODUCT_URL}**`), page.getByRole("button", { name: "Comprar minha lista" }).click()]);

    const destination = new URL(page.url());
    expect(destination.origin + destination.pathname).toBe(FIRST_PRODUCT_URL);
    expect(destination.searchParams.get("ls")).toBe(SESSION_ID);
  });

  test("given the buy-session request fails, then it falls back to the plain product URL WITHOUT ?ls (never announces a session that isn't active)", async ({ page }) => {
    await seedFavorite(page);
    await page.route("**/api/favorites/resolve**", async (route: Route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ ...FAVORITE, url: FIRST_PRODUCT_URL, available: true }] }) });
    });
    await page.route("**/api/buy-session", async (route: Route) => {
      await route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ error: "not_configured" }) });
    });
    await interceptInkNavigation(page);

    await page.goto("/sul/meus-lugares");
    await expect(page.getByRole("button", { name: "Comprar minha lista" })).toBeEnabled();
    await Promise.all([page.waitForURL(`${FIRST_PRODUCT_URL}**`), page.getByRole("button", { name: "Comprar minha lista" }).click()]);

    const destination = new URL(page.url());
    expect(destination.origin + destination.pathname).toBe(FIRST_PRODUCT_URL);
    expect(destination.searchParams.has("ls")).toBe(false);
  });
});
