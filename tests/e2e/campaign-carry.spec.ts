import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * The landing's campaign (utm_*, fbclid…) reaches INK (src/lib/analytics/campaign.ts): kept across the visit's client-side navigation and
 * added to the INK link when it is followed. The INK store is never contacted: its pages are answered here, and what the browser asked
 * for is recorded. This suite runs with the strict consent gate (playwright.config.ts), so "accepted" is set where carrying is expected.
 */
const LANDING_QUERY = "utm_source=meta&utm_medium=paid&utm_campaign=sul-outubro&fbclid=IwAR0abc&q=nao-vai";

async function grantConsent(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("useorigens:consent:marketing", JSON.stringify({ choice: "accepted", version: 2, decidedAt: "2026-10-14T00:00:00.000Z" }));
  });
}

/** Answers every INK page request locally and records the URLs the browser asked for. */
async function fakeInk(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route("https://www.usesul.com.br/**", (route) => {
    if (route.request().resourceType() === "document") asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>INK</title><p>INK</p>" });
  });
  return asked;
}

/** A landing on the home with the campaign, the search to Tijucas (a client-side move: the address bar loses the query), then the buy card. */
async function landThenBuy(page: Page) {
  await page.goto(`/sul?${LANDING_QUERY}`);
  await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Buscar na Use Origens" });
  await dialog.getByRole("combobox").fill("tij");
  await dialog.getByRole("option", { name: /Tijucas/ }).first().click();
  await expect(page).toHaveURL(/\/sul\/sc\/tijucas$/);
  const card = page.getByRole("link", { name: /Comprar Ponto de Origem de Tijucas na loja/ });
  const rendered = await card.getAttribute("href");
  await card.click();
  await page.waitForURL(/^https:\/\/www\.usesul\.com\.br\//);
  return rendered!;
}

test.describe("campaign carried to INK", () => {
  test("given a landing from an ad, when the visitor buys on another page, then INK receives the campaign and the product URL is the same", async ({ page }) => {
    await grantConsent(page);
    const asked = await fakeInk(page);
    const rendered = await landThenBuy(page);
    expect(asked).toHaveLength(1);
    const arrived = new URL(asked[0]);
    expect(arrived.origin + arrived.pathname).toBe(new URL(rendered).origin + new URL(rendered).pathname);
    expect(Object.fromEntries(arrived.searchParams)).toMatchObject({ utm_source: "meta", utm_medium: "paid", utm_campaign: "sul-outubro", fbclid: "IwAR0abc" });
    expect(arrived.searchParams.has("q")).toBe(false);
  });

  test("given the strict consent gate and no acceptance, then INK receives the bare product URL", async ({ page }) => {
    const asked = await fakeInk(page);
    const rendered = await landThenBuy(page);
    expect(asked).toEqual([rendered]);
  });

  test("given a followed INK link, then its href goes back to the rendered one (a copied link never carries the click id)", async ({ page }) => {
    await grantConsent(page);
    // Navigation blocked; a bubble-phase listener on window (after every capture listener) records the href the browser would follow.
    await page.addInitScript(() => {
      const ink = (e: Event) => (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="https://www.usesul.com.br"]');
      document.addEventListener("click", (e) => ink(e) && e.preventDefault(), true);
      window.addEventListener("click", (e) => void ((window as unknown as { __followed?: string }).__followed = ink(e)?.href));
    });
    await page.goto(`/sul/sc/tijucas?${LANDING_QUERY}`);
    const card = page.getByRole("link", { name: /Comprar Ponto de Origem de Tijucas na loja/ });
    const rendered = await card.getAttribute("href");
    await card.click();
    const followed = await page.evaluate(() => (window as unknown as { __followed?: string }).__followed);
    expect(new URL(followed!).searchParams.get("fbclid")).toBe("IwAR0abc");
    await expect(card).toHaveAttribute("href", rendered!);
  });

  test("given the bare domain with a campaign, then the region chooser keeps the whole query when Sul is selected", async ({ page }) => {
    const response = await page.goto(`/?${LANDING_QUERY}`);
    expect(response!.status()).toBe(200);
    await expect(page).toHaveURL(`/?${LANDING_QUERY}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seu lugar começa aqui.");
    await expect(page.getByRole("link", { name: "Explorar Sul", exact: true })).toHaveAttribute("href", `/sul?${LANDING_QUERY}`);
    await expect(page.getByRole("link", { name: "Explorar Norte", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explorar Centro-Oeste", exact: true })).toBeVisible();
    await page.getByRole("heading", { name: "Sul", exact: true }).click();
    await expect(page).toHaveURL(`/sul?${LANDING_QUERY}`);
  });
});
