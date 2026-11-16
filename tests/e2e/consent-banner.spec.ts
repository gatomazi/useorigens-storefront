import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * The cookie bar (src/components/consent/ConsentBanner.tsx) off the home never covers a way forward: over a store button or an open dialog's controls it
 * folds into a "Cookies" tab on the left edge, which brings the full bar back. On the home it stays the full bar. Folded is not a decision.
 */
const overlaps = async (a: Locator, b: Locator) => {
  const [x, y] = [(await a.boundingBox())!, (await b.boundingBox())!];
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
};
const PHONE = { width: 390, height: 664 };

async function openPiece(page: Page) {
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Qual é a sua cidade?" }).click();
  const journey = page.getByRole("dialog", { name: "Sua cidade" });
  await journey.getByTestId("journey-picks").getByRole("button", { name: /Florianópolis/ }).click();
  await journey.locator("[data-model]").first().click();
  return journey;
}

test.describe("Cookie bar: never on a way forward", () => {
  test("given the home on a phone, when the bar shows, then it is the full bar with both choices", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/sul");
    const bar = page.locator("[data-consent-banner]");
    await expect(bar).toBeVisible();
    await expect(bar).not.toHaveAttribute("data-folded", "");
    await expect(bar.getByRole("button", { name: "Aceitar cookies" })).toBeVisible();
  });

  test("given the 'Sua cidade' purchase bar on a city page, when it opens, then the bar folds into a tab that covers no control, and the tab brings the choices back", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/sul/sc/florianopolis");
    const journey = await openPiece(page);
    const cta = journey.getByTestId("journey-cta");
    await expect(cta).toBeVisible();

    const tab = page.getByTestId("consent-tab");
    await expect(tab).toBeVisible();
    expect(await overlaps(tab, cta)).toBe(false);
    await expect(page.locator("[data-consent-banner] >> text=Aceitar cookies")).toHaveCount(0);

    // Folded is still undecided: back on the page (the journey and the phone menu closed), the tab opens the full bar and its choice counts.
    while ((await page.locator("dialog[open]").count()) > 0) await page.keyboard.press("Escape");
    await page.getByTestId("consent-tab").click();
    const bar = page.locator("[data-consent-banner]");
    await bar.getByRole("button", { name: "Rejeitar" }).click();
    await expect(bar).toHaveCount(0);
  });

  test("given a design page whose purchase button reaches the bottom of the screen, when the bar would cover it, then it folds away from the button", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/sul/sc/florianopolis/feito-em");
    const button = page.locator("a.btn").first();
    await button.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight + el.getBoundingClientRect().height + 8));
    await expect(page.getByTestId("consent-tab")).toBeVisible();
    await expect.poll(() => overlaps(page.getByTestId("consent-tab"), button)).toBe(false);
  });
});
