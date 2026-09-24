// Deterministic smoke of the configurable home (docs/admin/cms-v1-round3.md §4). It needs no INK, no product-image CDN and no
// dev server: it starts TWO production servers from the current `.next` build (run `npm run build` first) on a temporary Volume that
// holds a FIXTURE catalog — one with SITE_CONFIG_HOME off (the published home) and one with it on — and checks both, side by side.
//
//   npx tsx scripts/smoke-home-config.mts
//
// Covers: readiness, current routes, section structure and order, tracking with the env fallback (consent-gated; the vendor hosts are
// ABORTED at the network layer, so nothing real is ever sent), ISR caching, the collections file being optional/corrupt, and the
// flag being inert. What it cannot cover yet is printed as SKIP with the reason (upload and preview are not implemented).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { fixtureSnapshot } from "./fixture-snapshot.mjs";

const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");
const META = "1558923262073052"; // the public production IDs, used only as env fallback values; every vendor request is aborted
const GA = "G-8GYTEJ1F77";
const servers: { name: string; port: number; env: Record<string, string>; child?: ChildProcess; volume?: string }[] = [
  { name: "flag OFF", port: 3231, env: {} },
  { name: "flag ON ", port: 3232, env: { SITE_CONFIG_HOME: "on" } },
];
const tmpDirs: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
};
const skip = (label: string, why: string) => console.log(`  SKIP ${label} — ${why}`);

const sectionIds = (html: string) => [...html.matchAll(/<section[^>]*?\bid="([^"]+)"/g)].map((m) => m[1]);

async function waitHealthy(port: number) {
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/api/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server on ${port} did not become healthy`);
}

async function start(s: (typeof servers)[number]) {
  s.volume = await mkdtemp(path.join(tmpdir(), "smoke-home-"));
  tmpDirs.push(s.volume);
  await writeFile(path.join(s.volume, "catalog-snapshot.json"), JSON.stringify(fixtureSnapshot(100, 0.6)));
  s.child = spawn(nextBin, ["start", "-p", String(s.port)], {
    cwd: process.cwd(),
    env: { ...process.env, CATALOG_SNAPSHOT_DIR: s.volume, NEXT_PUBLIC_META_PIXEL_ID: META, NEXT_PUBLIC_GA_MEASUREMENT_ID: GA, ...s.env },
    stdio: "ignore",
    detached: true,
  });
  await waitHealthy(s.port);
}

async function trackingProbe(port: number) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const seen: string[] = [];
  // Vendor hosts are aborted: the request is OBSERVED (that is the proof) but never leaves the machine.
  await context.route(/connect\.facebook\.net|googletagmanager\.com|google-analytics\.com/, (route) => {
    seen.push(route.request().url());
    return route.abort();
  });
  await context.route("**/_next/image**", (route) => route.abort()); // fixture images do not exist; not what is under test
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/sul`, { waitUntil: "domcontentloaded" });
  await page.getByRole("region", { name: "Preferências de cookies" }).waitFor();
  await page.waitForTimeout(1500);
  const beforeConsent = [...seen];
  await page.getByRole("button", { name: /Aceitar/ }).click();
  await page.waitForTimeout(2500);
  const afterConsent = [...seen];
  await browser.close();
  return { beforeConsent, afterConsent };
}

async function main() {
  for (const s of servers) await start(s);

  const bodies: Record<string, string> = {};
  for (const s of servers) {
    const base = `http://localhost:${s.port}`;
    console.log(`\n=== ${s.name} (port ${s.port}) ===`);

    const ready = await fetch(`${base}/api/ready`);
    check("GET /api/ready -> 200", ready.status === 200, ready.status);

    for (const route of ["/sul", "/sul/privacidade", "/sul/sc", "/sul/sc/tijucas", "/api/cidades/sul"]) {
      const r = await fetch(`${base}${route}`);
      check(`GET ${route} -> 200`, r.status === 200, r.status);
    }
    check("/norte still 404 (region not enabled)", (await fetch(`${base}/norte`)).status === 404);

    const home = await (await fetch(`${base}/sul`)).text();
    bodies[s.name] = home;
    check("home has the hero headline", home.includes('id="hero-title"'));
    check("home has the styles section with the showcase city", home.includes('id="estilos"') && home.replaceAll("<!-- -->", "").includes("O exemplo aqui é"));
    check("home has the states chooser and the closing campaign", home.includes('id="estados"') && home.includes('id="origem"'));
    check("hero background image keeps LCP priority (fetchpriority=high)", /fetchPriority="high"|fetchpriority="high"/.test(home));

    const before = (await fetch(`${base}/sul`)).headers.get("x-nextjs-cache");
    const after = (await fetch(`${base}/sul`)).headers.get("x-nextjs-cache");
    check(`ISR: repeated request is served from cache (x-nextjs-cache=${after})`, after === "HIT", { before, after });

    const nosniff = await fetch(`${base}/sul`, { method: "GET" });
    check("no HTML from a foreign host: document is text/html", (nosniff.headers.get("content-type") ?? "").startsWith("text/html"));

    const html = home;
    check("tracking: no vendor script/hosts in the server HTML before consent", !/fbevents|googletagmanager|connect\.facebook\.net/.test(html));
    const t = await trackingProbe(s.port);
    check("tracking: ZERO vendor requests before consent", t.beforeConsent.length === 0, t.beforeConsent);
    check("tracking: after consent Meta loads with the env-fallback Pixel base", t.afterConsent.some((u) => u.includes("connect.facebook.net")), t.afterConsent);
    check(`tracking: after consent GA4 loads with the env-fallback ID (${GA})`, t.afterConsent.some((u) => u.includes("googletagmanager.com") && u.includes(GA)), t.afterConsent);
  }

  console.log("\n=== flag OFF vs flag ON ===");
  const off = bodies["flag OFF"];
  const on = bodies["flag ON "];
  check(`section ids and order identical (${sectionIds(off).join(" > ")})`, JSON.stringify(sectionIds(off)) === JSON.stringify(sectionIds(on)), { off: sectionIds(off), on: sectionIds(on) });
  const norm = (h: string) => h.replace(/\/_next\/static\/[^"'\s)]+/g, "X").replaceAll("<!-- -->", "").replace(/<script\b[\s\S]*?<\/script>/g, "");
  check("home <body> HTML identical on the fixture catalog", norm(off.slice(off.indexOf("<body"))) === norm(on.slice(on.indexOf("<body"))));

  console.log("\n=== collections file is optional and cannot break the home (flag ON) ===");
  const on2 = servers[1];
  const base = `http://localhost:${on2.port}`;
  const file = path.join(on2.volume!, "collections-snapshot.json");
  for (const [label, body] of [
    ["corrupt file", "{not json"],
    ["valid but empty file", JSON.stringify({ version: 1, stores: {} })],
    ["valid file with a Sul collection", JSON.stringify({ version: 1, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 1, collections: [{ id: 152188, name: "Da Nossa Terra", slug: "da-nossa-terra", position: 3, isAvailable: true, reportedProductCount: 133, merchProductIds: ["1"], bindingProductCount: 0 }] } } })],
  ] as const) {
    await writeFile(file, body);
    const r = await fetch(`${base}/sul?cachebust=${Math.random()}`);
    const h = await r.text();
    check(`${label}: /sul -> 200 and same sections`, r.status === 200 && JSON.stringify(sectionIds(h)) === JSON.stringify(sectionIds(off)), r.status);
  }

  console.log("\n=== not testable yet ===");
  skip("media upload", "not implemented (needs R2, auth and Postgres — not provisioned)");
  skip("draft preview", "not implemented (admin surface does not exist)");
  skip("published.json reader", "not implemented; the flag renders the immutable seed");
  console.log("(build without Volume, bootstrap and sync-driven ISR invalidation: `npm run verify:prerender` and `npm run verify:bootstrap`)");

  console.log(failures === 0 ? "\nSMOKE PASSED" : `\nSMOKE FAILED (${failures})`);
}

async function cleanup() {
  for (const s of servers) {
    if (s.child?.pid) {
      for (const sig of ["SIGTERM", "SIGKILL"] as const) {
        try {
          process.kill(-s.child.pid, sig);
        } catch {
          /* gone */
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
  for (const d of tmpDirs) await rm(d, { recursive: true, force: true });
}

main()
  .catch((e) => {
    console.error("smoke crashed:", e);
    failures++;
  })
  .finally(async () => {
    await cleanup();
    process.exit(failures === 0 ? 0 : 1);
  });
