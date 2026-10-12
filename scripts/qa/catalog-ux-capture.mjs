// Usage: node capture.mjs <baseUrl> <outDir> [label]
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [base, outDir, label = ""] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
// PAGES (JSON, optional): [["name", "/path"], ...]; VIEWPORTS (optional): comma-separated subset of desktop-1440, mobile-390, mobile-375, mobile-430.
const pages = process.env.PAGES
  ? JSON.parse(process.env.PAGES)
  : [
      ["home-sul", "/sul"],
      ["cidade-floripa", "/sul/sc/florianopolis"],
      ["cidade-floripa-oversized", "/sul/sc/florianopolis?peca=oversized"],
      ["colecao-da-nossa-terra", "/sul/colecoes/da-nossa-terra"],
    ];
const ALL_VIEWPORTS = [
  ["desktop-1440", { viewport: { width: 1440, height: 900 } }],
  ["mobile-390", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }],
  ["mobile-375", { ...devices["iPhone 13"], viewport: { width: 375, height: 812 } }],
  ["mobile-430", { ...devices["iPhone 13"], viewport: { width: 430, height: 932 } }],
];
const wanted = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(",") : ["desktop-1440", "mobile-390", "mobile-375"];
const viewports = ALL_VIEWPORTS.filter(([name]) => wanted.includes(name));
const browser = await chromium.launch();
for (const [vpName, ctxOpts] of viewports) {
  for (const [name, p] of pages) {
    const url = p.startsWith("http") ? p : base + p;
    const ctx = await browser.newContext({ ...ctxOpts, locale: "pt-BR" });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(1500);
      const file = path.join(outDir, `${name}-${vpName}${label}`);
      await page.screenshot({ path: `${file}.png` });
      await page.screenshot({ path: `${file}-full.png`, fullPage: true });
      // SCROLL=<px>: one more viewport capture after scrolling the page (sticky bars, overlays over the grid).
      if (process.env.SCROLL) {
        await page.evaluate((y) => window.scrollTo({ top: Number(y), behavior: "instant" }), process.env.SCROLL);
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${file}-scrolled.png` });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      }
      const metrics = await page.evaluate(() => {
        const firstCard = document.querySelector("ul li a .photo, ul li a span.photo, .photo");
        const r = firstCard?.getBoundingClientRect();
        return { docH: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, firstPhotoTop: r ? Math.round(r.top + window.scrollY) : null, html: document.documentElement.outerHTML.length, h1: document.querySelector("h1")?.textContent?.trim() };
      });
      console.log(vpName, name, JSON.stringify(metrics));
    } catch (e) {
      console.log(vpName, name, "ERROR", e.message);
    }
    await ctx.close();
  }
}
await browser.close();
