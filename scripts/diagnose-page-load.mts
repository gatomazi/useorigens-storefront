// Diagnostic (docs/admin/cms-v1-round3.md §4): where does `page.goto(..., "load")` spend its time on a city page?
//   npx tsx scripts/diagnose-page-load.mts <baseUrl> <route> [route...]
// For each route it measures, in a fresh browser context each time: TTFB of the document, `domcontentloaded`, `load`, how many image
// requests the page made and how long the slowest took, and the system load average at that moment — so a slow run can be
// attributed to the machine (load), to image optimisation (slowest /_next/image), or to the page itself. Read-only; sends no events.
import os from "node:os";
import { chromium } from "@playwright/test";

const [base, ...routes] = process.argv.slice(2);
if (!base || routes.length === 0) throw new Error("usage: diagnose-page-load.mts <baseUrl> <route> [route...]");
const browser = await chromium.launch();
for (const route of routes) {
  for (const mode of ["images", "no-images"] as const) {
    for (const pass of ["cold", "warm"] as const) {
      if (mode === "no-images" && pass === "cold") continue; // "cold" only means something for the optimiser cache
      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      const page = await context.newPage();
      const imageTimes: number[] = [];
      const starts = new Map<string, number>();
      const inflight = new Set<string>();
      page.on("request", (r) => inflight.add(r.url()));
      page.on("requestfinished", (r) => inflight.delete(r.url()));
      page.on("requestfailed", (r) => inflight.delete(r.url()));
      page.on("request", (r) => r.url().includes("/_next/image") && starts.set(r.url(), Date.now()));
      page.on("requestfinished", (r) => starts.has(r.url()) && imageTimes.push(Date.now() - starts.get(r.url())!));
      if (mode === "no-images") await page.route("**/_next/image**", (route) => route.abort());
      const t0 = Date.now();
      let dcl = -1;
      let load = -1;
      page.on("domcontentloaded", () => (dcl = Date.now() - t0));
      let outcome = "ok";
      try {
        await page.goto(`${base}${route}`, { waitUntil: "load", timeout: 120_000 });
        load = Date.now() - t0;
      } catch (e) {
        outcome = `TIMEOUT/ERR: ${String(e).slice(0, 60)}`;
        // What was the page still waiting for? (the request URLs are shortened; no secrets are involved)
        for (const u of [...inflight].slice(0, 12)) console.log(`     in flight at timeout: ${u.replace(/^https?:\/\/[^/]+/, "").slice(0, 150)}`);
      }
      const slowest = imageTimes.length ? Math.max(...imageTimes) : 0;
      console.log(`${route.padEnd(18)} ${mode.padEnd(9)} ${pass.padEnd(4)} dcl=${String(dcl).padStart(6)}ms load=${String(load).padStart(6)}ms imgReq=${String(starts.size).padStart(2)} slowestImg=${String(slowest).padStart(6)}ms loadavg=${os.loadavg()[0].toFixed(0)} ${outcome}`);
      await context.close();
    }
  }
}
await browser.close();
