import { test, expect } from "./fixtures";

/**
 * "Compartilhar" + "Guia de medidas" on a city page (Florianópolis/SC, Sul). The native share sheet is stubbed per test: a real one would
 * block the run, and what matters is the contract around it (payload, cancel, fallback menu, copy feedback, focus and Escape).
 */
const CITY = "/sul/sc/florianopolis";

test.describe("share", () => {
  test("given native share, then it gets the clean canonical URL and a cancel opens nothing else", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shared: ShareData[] }).__shared = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: (data: ShareData) => {
          (window as unknown as { __shared: ShareData[] }).__shared.push(data);
          return Promise.reject(new DOMException("cancelled", "AbortError"));
        },
      });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    });
    await page.goto(`${CITY}?peca=oversized&cart_ref=abc&utm_source=x`);
    await page.getByRole("button", { name: "Compartilhar", exact: true }).click();
    const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0].url).toMatch(/^https:\/\/[^/]+\/sul\/sc\/florianopolis$/);
    expect(shared[0].text).toBe("Olha o que encontrei na Use Origens: Camisetas de Florianópolis, SC");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("given no native share, then the menu opens; copy confirms only after success; Escape closes and the button reopens it", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
    await page.goto(CITY);
    const trigger = page.getByRole("button", { name: "Compartilhar", exact: true });
    await trigger.click();
    const menu = page.locator("dialog[open]");
    await expect(menu.getByRole("heading", { name: "Compartilhar" })).toBeVisible();
    const wa = menu.getByRole("link", { name: "WhatsApp" });
    expect(await wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=Olha%20o%20que%20encontrei/);
    expect(await wa.getAttribute("rel")).toBe("noopener noreferrer");
    await menu.getByRole("button", { name: "Copiar link" }).click();
    await expect(menu.getByRole("status")).toHaveText("Link copiado!");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/sul\/sc\/florianopolis$/);

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await expect(page.locator("dialog[open]").getByRole("status")).toHaveText("");
  });

  test("given copying fails, then no success message and the link is shown to copy by hand", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
      document.execCommand = () => false;
    });
    await page.goto(CITY);
    await page.getByRole("button", { name: "Compartilhar", exact: true }).click();
    const menu = page.locator("dialog[open]");
    await menu.getByRole("button", { name: "Copiar link" }).click();
    await expect(menu.getByRole("status")).toHaveText("Selecione e copie o link");
    await expect(menu.getByRole("textbox", { name: "Link para compartilhar" })).toHaveValue(/\/sul\/sc\/florianopolis$/);
  });

  test("given a product card, then its share button is a sibling of the link and sharing never navigates", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
    await page.goto(CITY);
    const card = page.getByTestId("share-button").nth(1);
    expect(await card.evaluate((el) => el.closest("a"))).toBeNull();
    const box = await card.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await card.click();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe(CITY);
    const href = await page.locator("dialog[open]").getByRole("link", { name: "WhatsApp" }).getAttribute("href");
    const text = new URL(href!).searchParams.get("text")!;
    expect(text).toMatch(/^Olha (essa camiseta da Use Origens|o que encontrei na Use Origens): .+ https:\/\/www\.use(sul|norte|centro)\.com\.br\/[a-z]+\/product\/[a-z0-9-]+$/);
  });
});

test.describe("size guide", () => {
  test("given the city page, then the guide opens on the classic tee, switches model without stale values, and reopens after Escape", async ({ page }) => {
    await page.goto(CITY);
    const trigger = page.getByTestId("size-guide-button");
    await trigger.click();
    const guide = page.locator("dialog[open]");
    await expect(guide.getByRole("heading", { name: "Guia de medidas" })).toBeVisible();
    await expect(guide.getByText("Camiseta clássica (unissex)", { exact: true })).toBeVisible();
    await expect(guide.locator("tbody tr").first()).toHaveText(/^P\s*69\s*52\s*48\s*19$/);
    await guide.getByRole("button", { name: "Baby look" }).click();
    await expect(guide.locator("thead")).toContainText("Busto");
    await expect(guide.locator("tbody tr").first()).toHaveText(/^PP\s*65\s*41\s*40\s*36\s*14$/);
    await expect(guide.getByText("+/- 1 cm")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    // Reopens on the piece in context (the classic one), not on the model last viewed.
    await expect(page.locator("dialog[open]").getByText("Camiseta clássica (unissex)", { exact: true })).toBeVisible();
  });

  test("given a phone, then the guide is a bottom sheet without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(CITY);
    await page.getByTestId("size-guide-button").click();
    const box = await page.locator("dialog[open]").boundingBox();
    expect(Math.round(box!.y + box!.height)).toBe(740);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Every column is readable without sideways scrolling, even the widest official table (Baby Look, 6 columns).
    await page.locator("dialog[open]").getByRole("button", { name: "Baby look" }).click();
    const table = page.locator("dialog[open] table");
    expect(await table.evaluate((t) => t.parentElement!.scrollWidth <= t.parentElement!.clientWidth)).toBe(true);
  });
});
