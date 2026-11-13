import type { Page } from "@playwright/test";
import { expect, normalizeFbq, normalizeGtag, test } from "./fixtures";

/**
 * "Quero minha cidade" (src/components/city-finder/CityFinder.tsx): the state, the place, then the place's designs right under them as its own page's
 * cards, with the way to that page. The expectations come from the place's own data (`/api/minha-cidade/…`), never from a list written here.
 */
type City = { place: { name: string; uf: string; slug: string; page: string }; cards: { familyId: string; href: string; direct: boolean }[] };

async function cityOf(page: Page, path: string): Promise<City> {
  const res = await page.request.get(`/api/minha-cidade/${path}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as City;
}

/** Event mocks (same shape as sua-cidade.spec.ts) and an accepted consent; a link to the store is clicked, never followed. */
async function withTracking(page: Page) {
  const meta: unknown[][] = [];
  const ga: unknown[][] = [];
  await page.exposeFunction("__reportFbq", (args: unknown[]) => meta.push(normalizeFbq(args)));
  await page.exposeFunction("__reportGtag", (args: unknown[]) => ga.push(normalizeGtag(args)));
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.fbq = (...args: unknown[]) => (w.__reportFbq as (a: unknown[]) => void)(args);
    w.gtag = (...args: unknown[]) => (w.__reportGtag as (a: unknown[]) => void)(args);
    window.localStorage.setItem("useorigens:consent:marketing", JSON.stringify({ choice: "accepted", version: 2, decidedAt: "2026-09-23T00:00:00.000Z" }));
    document.addEventListener(
      "click",
      (e) => {
        const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (link && link.host !== window.location.host) e.preventDefault();
      },
      true,
    );
  });
  return { meta: (name: string) => meta.filter((c) => c[1] === name), ga: (name: string) => ga.filter((c) => c[0] === "event" && c[1] === name) };
}

test.describe("Quero minha cidade: state, place and its designs on one page", () => {
  test("given the page, when a state and a city are chosen, then the place's designs appear below as its page's cards, a card opens the store, reported as minha_cidade", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const data = await cityOf(page, "sul/sc/florianopolis");
    const track = await withTracking(page);
    await page.goto("/sul/minha-cidade");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quero minha cidade");
    await page.getByTestId("finder-state-sc").click();
    await expect(page).toHaveURL(/\/sul\/minha-cidade\?estado=sc$/);
    await expect(page.getByTestId("finder-state-answer")).toContainText("Santa Catarina");

    const field = page.getByTestId("finder-input");
    await field.fill("Florianópolis");
    await page.getByTestId("finder-places").getByRole("button", { name: "Florianópolis", exact: true }).click();
    await expect(page).toHaveURL(/\?estado=sc&cidade=florianopolis$/);

    // Every design of the place, in its page's order, each card going where the city page's card goes.
    const cards = page.getByTestId("finder-cards").locator("li");
    await expect(cards).toHaveCount(data.cards.length);
    await expect(page.getByRole("heading", { level: 2, name: "Florianópolis" })).toBeVisible();
    await expect(cards.first().locator("a").last()).toHaveAttribute("href", data.cards[0].href);
    await expect(page.getByTestId("finder-all-models")).toHaveAttribute("href", data.place.page);

    const direct = data.cards.findIndex((c) => c.direct);
    test.skip(direct < 0, "no design sold straight from its card in the local snapshot");
    await cards.nth(direct).locator(`a[href="${data.cards[direct].href}"]`).click();
    expect(track.meta("GoToInk")[0]?.[2]).toMatchObject({ source_section: "minha_cidade", city: "Florianópolis", state: "SC", family: data.cards[direct].familyId });
    expect(track.ga("select_city")[0]?.[2]).toMatchObject({ source: "minha_cidade" });
    expect(track.ga("origens_minha_cidade_state")[0]?.[2]).toMatchObject({ uf: "SC" });
  });

  test("given a city typed on the first step, when chosen, then its designs open straight away, and the back button takes back one answer at a time", async ({ page }) => {
    await page.goto("/sul/minha-cidade");
    await page.getByTestId("finder-quick").fill("Florianópolis");
    await page.getByTestId("finder-quick-results").getByRole("button", { name: /Florianópolis/ }).first().click();
    await expect(page).toHaveURL(/\?estado=sc&cidade=florianopolis$/);
    await expect(page.getByTestId("finder-cards")).toBeVisible();

    await page.getByTestId("finder-change-city").click();
    await expect(page).toHaveURL(/\?estado=sc$/);
    await expect(page.getByTestId("finder-places")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\?estado=sc&cidade=florianopolis$/);
    await expect(page.getByTestId("finder-cards")).toBeVisible();
  });

  test("given a shared link to a city, when opened, then the designs are there without choosing again, and an unknown place says so with a way back", async ({ page }) => {
    await page.goto("/sul/minha-cidade?estado=sc&cidade=florianopolis");
    await expect(page.getByTestId("finder-cards")).toBeVisible();
    await page.goto("/sul/minha-cidade?estado=sc&cidade=nao-existe");
    await expect(page.getByText("Essa cidade não está no catálogo de Santa Catarina.")).toBeVisible();
    await page.getByRole("button", { name: "Escolher outra" }).click();
    await expect(page.getByTestId("finder-places")).toBeVisible();
  });

  test("given a phone, when the designs open, then the page is no wider than the screen and the button to every design fits", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sul/minha-cidade?estado=sc&cidade=florianopolis");
    await expect(page.getByTestId("finder-cards")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const all = (await page.getByTestId("finder-all-models").boundingBox())!;
    expect(all.x + all.width).toBeLessThanOrEqual(390);
  });
});

test.describe("Quero minha cidade from the home's state chooser (panel: 'Escolher a cidade aqui')", () => {
  test("given the chooser set to open the window, when a state is tapped, then the window opens on its places, a city shows its designs, and the state stays a link to its page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const track = await withTracking(page);
    await page.goto("/sul");
    const sc = page.locator('#estados a[href="/sul/sc"], section a[href="/sul/sc"][aria-haspopup="dialog"]').first();
    test.skip((await sc.getAttribute("aria-haspopup")) !== "dialog", "the local CMS does not set the state chooser to open the window");

    await sc.click();
    const win = page.getByTestId("city-finder-dialog");
    await expect(win).toBeVisible();
    await expect(page).toHaveURL(/\/sul$/);
    await expect(win.getByTestId("finder-state-answer")).toContainText("Santa Catarina");
    await win.getByTestId("finder-input").fill("Florianópolis");
    await win.getByTestId("finder-places").getByRole("button", { name: "Florianópolis", exact: true }).click();
    await expect(win.getByTestId("finder-cards")).toBeVisible();
    await expect(win.getByTestId("finder-all-models")).toHaveAttribute("href", "/sul/sc/florianopolis");
    expect(track.ga("select_state")[0]?.[2]).toMatchObject({ state: "SC" });
    expect(track.ga("select_city")[0]?.[2]).toMatchObject({ source: "minha_cidade" });

    await win.getByTestId("city-finder-close").click();
    await expect(win).toBeHidden();
    await expect(sc).toHaveAttribute("href", "/sul/sc");
  });
});
