// Equivalence proof between two running storefronts (docs/admin/cms-v1-round2.md §4): the reference (the original home) and the
// candidate (the config-driven home). Same catalog snapshot on both, so any difference is the renderer's.
//
//   npx tsx scripts/verify-home-equivalence.mts <referenceUrl> <candidateUrl> [route=/sul] [outDir]
//
// Checks, in order, and exits non-zero on the first category that differs:
//   1. SSR <body> HTML (normalised only for build-hashed asset URLs and React's `<!-- -->` text separators)
//   2. hydrated DOM after scrolling (lazy images loaded), scripts stripped, same normalisation
//   3. link inventory: every href (text + target) in document order
//   4. pixel identity of full-page screenshots at 375, 390, 768, 1280 and 1920 px (reduced motion, so the entrance
//      animation cannot vary; fonts and product photos are the same files on both sides)
// No tolerance is applied to pixels: identical bytes, or the script reports the differing pixel count.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const [refBase, candBase, route = "/sul", outDir = "/tmp/home-equivalence"] = process.argv.slice(2);
if (!refBase || !candBase) throw new Error("usage: verify-home-equivalence.mts <referenceUrl> <candidateUrl> [route] [outDir]");
await mkdir(outDir, { recursive: true });

const WIDTHS = (process.env.WIDTHS ?? "375,390,768,1280,1920").split(",").map(Number);
let failed = false;
const say = (ok: boolean, msg: string) => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
};

function normalise(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/\/_next\/static\/[^"'\s)]+/g, "/_next/static/X")
    .replace(/<!-- -->/g, "")
    .replace(/>\s+</g, ">\n<");
}

function firstDiff(a: string, b: string): string {
  const al = a.split("\n");
  const bl = b.split("\n");
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return `line ${i + 1}\n  reference: ${(al[i] ?? "<end>").slice(0, 300)}\n  candidate: ${(bl[i] ?? "<end>").slice(0, 300)}`;
  }
  return "none";
}

const bodyOf = (html: string) => html.slice(html.indexOf("<body"), html.lastIndexOf("</body>") + 7);

// 1. SSR HTML
const [refHtml, candHtml] = await Promise.all([refBase, candBase].map(async (b) => (await fetch(`${b}${route}`)).text()));
const refSsr = normalise(bodyOf(refHtml));
const candSsr = normalise(bodyOf(candHtml));
await writeFile(`${outDir}/ssr-reference.html`, refSsr);
await writeFile(`${outDir}/ssr-candidate.html`, candSsr);
say(refSsr === candSsr, `SSR <body> HTML identical (${refSsr.length} chars)`);
if (refSsr !== candSsr) console.log(`      first difference at ${firstDiff(refSsr, candSsr)}`);

// 2-4. Hydrated DOM, links and pixels
const browser = await chromium.launch();
async function capture(base: string, width: number, shots: boolean) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  // Freeze animations and transitions at their end state: text inside an element that is mid-way through (or has just finished) a
  // CSS animation can be rasterised on a promoted layer or not depending on timing, which shifts anti-aliasing by a few pixels.
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  // Settle everything that could otherwise make two captures of the SAME page differ: lazy images (scroll through, then wait
  // until every one has loaded and decoded), web fonts, and the carousels' arrow state (set once Embla has initialised).
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    await document.fonts.ready;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && [...document.images].some((i) => !i.complete)) await new Promise((r) => setTimeout(r, 200));
    // (No named helper here: tsx's keepNames would inject `__name`, which does not exist in the browser.)
    await Promise.all([...document.images].filter((i) => i.complete).map((i) => Promise.race([i.decode().catch(() => undefined), new Promise((r) => setTimeout(r, 3000))])));
    window.scrollTo(0, 0);
  });
  // Embla only re-measures (and so settles the carousel arrows' enabled/disabled state) on a resize: force one, deterministically.
  await page.setViewportSize({ width: width + 1, height: 900 });
  await page.waitForTimeout(400);
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(1500);
  const dom = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script").forEach((s) => s.remove());
    return clone.innerHTML;
  });
  const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => `${(a.textContent ?? "").trim().replace(/\s+/g, " ")} -> ${a.getAttribute("href")}`));
  // (Only images that are actually rendered count: lazy images inside a closed <details> or a display:none tree are never fetched.)
  // An image that never loaded makes a pixel comparison meaningless (one side would show a photo, the other a flat colour). Report it as
  // such instead of as a "difference": see scripts/repro-image-optimizer-hang.mts for a real cause (a hung /_next/image request).
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.getClientRects().length > 0 && (!i.complete || i.naturalWidth === 0)).map((i) => (i.currentSrc || i.src).replace(/^https?:\/\/[^/]+/, "").slice(0, 110)));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // A full-page capture makes Chromium resize the viewport, which lets Embla re-measure AFTER the DOM above was read (the carousel
  // arrows flip to their final state). Capture once to let that happen, then keep the second, settled capture.
  if (shots) {
    await page.screenshot({ fullPage: true });
    await page.waitForTimeout(1200);
  }
  const png = shots ? await page.screenshot({ fullPage: true }) : null;
  await context.close();
  return { dom: normalise(dom), links, overflow, png, broken };
}

let domChecked = false;
for (const width of WIDTHS) {
  const [ref, cand] = [await capture(refBase, width, true), await capture(candBase, width, true)];
  say(ref.dom === cand.dom, `hydrated DOM identical at ${width}px (${ref.dom.length} chars)`);
  if (ref.dom !== cand.dom) console.log(`      first difference at ${firstDiff(ref.dom, cand.dom)}`);
  if (!domChecked) {
    domChecked = true;
    await writeFile(`${outDir}/dom-reference.html`, ref.dom);
    await writeFile(`${outDir}/dom-candidate.html`, cand.dom);
    const same = JSON.stringify(ref.links) === JSON.stringify(cand.links);
    say(same, `link inventory identical (${ref.links.length} links)`);
    if (!same) console.log(`      first difference at ${firstDiff(ref.links.join("\n"), cand.links.join("\n"))}`);
  }
  // Images that stay unloaded on BOTH sides (lazy images far off-screen inside a carousel) are the same on both and change nothing. What
  // makes a pixel comparison meaningless is an ASYMMETRY: one side showing a photo the other never loaded.
  const refBroken = new Set(ref.broken);
  const candBroken = new Set(cand.broken);
  const asymmetric = [...refBroken].filter((u) => !candBroken.has(u)).map((u) => `reference-only: ${u}`).concat([...candBroken].filter((u) => !refBroken.has(u)).map((u) => `candidate-only: ${u}`));
  if (asymmetric.length > 0) say(false, `INCONCLUSIVE at ${width}px: ${asymmetric.length} image(s) loaded on one side only (${asymmetric.join(" | ")}) — restart the servers and retry; not a renderer difference`);
  else if (ref.broken.length > 0) console.log(`INFO  ${ref.broken.length} lazy image(s) stay unloaded on both sides at ${width}px (identical sets)`);
  say(ref.overflow === cand.overflow && ref.overflow <= 0, `no horizontal overflow at ${width}px (reference ${ref.overflow}, candidate ${cand.overflow})`);
  await writeFile(`${outDir}/reference-${width}.png`, ref.png!);
  await writeFile(`${outDir}/candidate-${width}.png`, cand.png!);
  const identical = ref.png!.equals(cand.png!);
  let detail = "";
  if (!identical) {
    try {
      const sharp = (await import("sharp")).default;
      const [a, b] = await Promise.all([ref.png!, cand.png!].map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      if (a.info.width !== b.info.width || a.info.height !== b.info.height) detail = ` (sizes differ: ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height})`;
      else {
        let n = 0;
        for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) n++;
        detail = ` (${n} of ${a.info.width * a.info.height} pixels differ)`;
      }
    } catch {
      detail = " (bytes differ; sharp unavailable for a pixel count)";
    }
  }
  say(identical, `full-page screenshot pixel-identical at ${width}px${detail}`);
}
await browser.close();
console.log(failed ? "\nRESULT: DIFFERENCES FOUND" : "\nRESULT: EQUIVALENT");
process.exit(failed ? 1 : 0);
