// Visual QA: full-page screenshots of a route at the widths required by the spec (§37).
// Usage: npx tsx scripts/screenshots.mts <outDir> <path> [name] [widths comma list]
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const [outDir, route, name = "page", widthsArg = "375,430,768,1280,1440"] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3100";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
for (const width of widthsArg.split(",").map(Number)) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  // Scroll through the page so lazy images load before the full-page capture.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: `${outDir}/${name}-${width}.png`, fullPage: true });
  console.log(`${name} ${width}px: horizontal overflow ${overflow}px`);
  await page.close();
}
await browser.close();
