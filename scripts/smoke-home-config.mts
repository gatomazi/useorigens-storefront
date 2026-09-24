// Deterministic smoke of the configurable home (docs/admin/cms-v1-round3.md §4). It needs no INK, no product-image CDN and no
// dev server: it starts TWO production servers from the current `.next` build (run `NEXT_PUBLIC_META_PIXEL_ID=… NEXT_PUBLIC_GA_MEASUREMENT_ID=… npm run build`
// first: the two public IDs are inlined at BUILD time, and the tracking checks below need them) on a temporary Volume that
// holds a FIXTURE catalog — one with SITE_CONFIG_HOME off (the published home) and one with it on — and checks both, side by side.
//
//   npx tsx scripts/smoke-home-config.mts
//
// Covers: readiness, current routes, section structure and order, tracking with the env fallback (consent-gated; the vendor hosts are
// ABORTED at the network layer, so nothing real is ever sent), ISR caching, the collections file being optional/corrupt, and the
// flag being inert, the published.json reader (a published section from a collection shows up with real cards; corrupt / incompatible files fall
// back to the seed), the preview being tracker-free, and the local admin answering 404 on a production build. What it cannot cover yet is printed as SKIP with the reason (upload and preview are not implemented).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { fixtureSnapshot } from "./fixture-snapshot.mjs";
import { buildSeedBundle } from "../src/lib/site-config/seed";

const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");
const META = "1558923262073052"; // the public production IDs, used only as env fallback values; every vendor request is aborted
const GA = "G-8GYTEJ1F77";
const servers: { name: string; port: number; env: Record<string, string>; child?: ChildProcess; volume?: string }[] = [
  { name: "flag OFF", port: 3231, env: {} },
  // ADMIN_HOST alone is a PARTIAL admin configuration (no database, no Google client, no secret): the admin must stay closed.
  { name: "flag ON ", port: 3232, env: { SITE_CONFIG_HOME: "on", ADMIN_HOST: "admin.smoke.test" } },
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

const SYNC_TOKEN = "smoke-home-config-token";
const MERCH_IDS = ["7000001", "7000002", "7000003", "7000004"];
function catalogWithMerch() {
  const snap = fixtureSnapshot(100, 0.6) as { stores: Record<string, { merch: unknown[] }> };
  snap.stores["use-sul"].merch = MERCH_IDS.map((id, i) => ({
    inkProductId: id, commerceStoreKey: "use-sul", regionSlug: "sul", name: `Camiseta de teste ${i + 1}`, slug: `teste-${id}`,
    storeProductUrl: `https://www.usesul.com.br/usesul/product/teste-${id}`,
    imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/fixture.jpg", price: 99.9, totalSalesCount: 0, syncedAt: new Date().toISOString(),
  }));
  return snap;
}
const rec = (o: Record<string, unknown>) => ({ position: 1, isAvailable: true, reportedProductCount: 133, matchedCount: MERCH_IDS.length, merchCount: MERCH_IDS.length, cityDesignCount: 0, memberIds: MERCH_IDS, ...o });
const collectionsFixture = () => ({
  version: 2,
  stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 2, collections: [
    rec({ id: 152188, name: "Da Nossa Terra", slug: "da-nossa-terra", position: 3 }),
    rec({ id: 152999, name: "Interna do smoke", slug: "interna-smoke", position: 4, isAvailable: false }), // hidden on INK: needs explicit CMS enablement
  ] } },
});
const publishedWith = (releaseId: string, mutate?: (b: ReturnType<typeof buildSeedBundle>) => void) => {
  const bundle = buildSeedBundle({ metaPixelId: META, ga4MeasurementId: GA });
  bundle.releaseId = releaseId;
  const sections = bundle.docs.sul.home!.sections;
  sections.splice(sections.length - 2, 0, {
    id: "custom-smoke", anchor: "colecao-smoke", headingId: "colecao-smoke-title", template: "product-carousel", active: true, title: "Coleção do smoke",
    layout: { variant: "standard", tone: "dark", surface: "plain" }, source: { kind: "ink-category", store: "use-sul", collectionId: 152188, order: "category", limit: 6 },
    analyticsSource: "homeCollection", cta: { label: "Ver todos", dest: { kind: "ink-collection", store: "use-sul", collectionId: 152188 } },
    appearance: { fill: { kind: "solid", color: "token:region-primary" }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } },
  });
  mutate?.(bundle);
  return bundle;
};

async function start(s: (typeof servers)[number]) {
  s.volume = await mkdtemp(path.join(tmpdir(), "smoke-home-"));
  tmpDirs.push(s.volume);
  await writeFile(path.join(s.volume, "catalog-snapshot.json"), JSON.stringify(catalogWithMerch()));
  await writeFile(path.join(s.volume, "collections-snapshot.json"), JSON.stringify(collectionsFixture()));
  s.child = spawn(nextBin, ["start", "-p", String(s.port)], {
    cwd: process.cwd(),
    env: { ...process.env, CATALOG_SNAPSHOT_DIR: s.volume, SITE_CONFIG_DIR: path.join(s.volume, "site-config"), NODE_ENV: "production", ADMIN_SYNC_TOKEN: SYNC_TOKEN, ALLOW_FIXTURE_SYNC: "true", NEXT_PUBLIC_META_PIXEL_ID: META, NEXT_PUBLIC_GA_MEASUREMENT_ID: GA, ...s.env },
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
    ["valid but empty file", JSON.stringify({ version: 2, stores: {} })],
    ["older v1 file", JSON.stringify({ version: 1, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 1, collections: [{ id: 152188, name: "Da Nossa Terra", slug: "da-nossa-terra", position: 3, isAvailable: true, reportedProductCount: 133, merchProductIds: ["1"], bindingProductCount: 0 }] } } })],
    ["valid file with a Sul collection", JSON.stringify({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 1, collections: [rec({ id: 152188, name: "Da Nossa Terra", slug: "da-nossa-terra", memberIds: ["1"], matchedCount: 1, merchCount: 1 })] } } })],
  ] as const) {
    await writeFile(file, body);
    const r = await fetch(`${base}/sul?cachebust=${Math.random()}`);
    const h = await r.text();
    check(`${label}: /sul -> 200 and same sections`, r.status === 200 && JSON.stringify(sectionIds(h)) === JSON.stringify(sectionIds(off)), r.status);
  }

  await writeFile(file, JSON.stringify(collectionsFixture())); // back to the fixture the published-section checks rely on

  console.log("\n=== published.json reader (flag ON, reading a temp site-config dir) ===");
  const cfgDir = path.join(on2.volume!, "site-config");
  await mkdir(cfgDir, { recursive: true });
  const cfg = path.join(cfgDir, "published.json");
  // Pages are ISR-cached (revalidate = 3600): like the real publisher, a change to published.json is followed by an on-demand revalidation. The
  // fixture-sync route performs exactly that `revalidatePath("/[region]", "layout")`, so it stands in for the publisher's cache step here.
  const revalidate = async () => {
    const post = await fetch(`${base}/api/admin/catalog-sync`, { method: "POST", headers: { Authorization: `Bearer ${SYNC_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ fixtureSnapshot: catalogWithMerch() }) });
    for (let i = 0; i < 100 && post.status === 202; i++) {
      const job = (await (await fetch(`${base}/api/admin/catalog-sync`, { headers: { Authorization: `Bearer ${SYNC_TOKEN}` } })).json()) as { status: string };
      if (job.status === "succeeded" || job.status === "failed") return;
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  const write = async (body: string) => {
    await writeFile(cfg, body);
    await revalidate();
  };
  const home = async () => (await fetch(`${base}/sul`)).text();
  check("no published.json: the home is the seed (no extra section)", !(await home()).includes('id="colecao-smoke"'));
  await write(JSON.stringify(publishedWith("smoke-1")));
  const withSection = await home();
  check("published section from a collection renders with real cards from the local snapshot", withSection.includes('id="colecao-smoke"') && (withSection.match(/href="https:\/\/www\.usesul\.com\.br\/usesul\/product\/teste-70000/g) ?? []).length >= 3);
  check("its 'Ver todos' points to the real store collection URL", withSection.includes("https://www.usesul.com.br/usesul/collections/da-nossa-terra"));
  // (The fixture catalog has no products matching the curated name rules, so the curated carousels are legitimately hidden here; the structural
  // sections around the new one must all be present, in order.)
  check("the structural sections around it are unchanged and in order", sectionIds(withSection).join(">") === "estilos>estados>colecao-smoke>origem", sectionIds(withSection));
  await write(JSON.stringify(publishedWith("smoke-2", (b) => { (b.docs.sul.home!.sections.find((x) => x.id === "custom-smoke") as { cta?: unknown }).cta = { label: "x", dest: { kind: "external", url: "https://evil.example/" } }; })));
  const dropped = await home();
  check("an invalid optional section is dropped, the rest of the home stays", !dropped.includes('id="colecao-smoke"') && dropped.includes('id="hero-title"') && dropped.includes('id="origem"'));
  // A collection that is gone (or hidden) must not leave an empty carousel behind: the section is simply not rendered.
  await write(JSON.stringify(publishedWith("smoke-gone", (b) => { (b.docs.sul.home!.sections.find((x) => x.id === "custom-smoke") as { source: { collectionId: number } }).source.collectionId = 999999; })));
  const gone = await home();
  check("a section whose collection no longer exists is omitted (no empty carousel), the home stays whole", !gone.includes('id="colecao-smoke"') && gone.includes('id="hero-title"') && gone.includes('id="origem"'));
  // An INTERNAL (hidden on INK) collection feeds a section only when the published document enables it — and never gets a "Ver todos".
  const internalSection = (enable: boolean) => publishedWith(enable ? "smoke-int-on" : "smoke-int-off", (b) => {
    const sec = b.docs.sul.home!.sections.find((x) => x.id === "custom-smoke") as { source: { collectionId: number }; cta?: unknown };
    sec.source.collectionId = 152999;
    delete sec.cta;
    if (enable) (b.docs.sul as { collections?: unknown }).collections = { enabled: [{ store: "use-sul", collectionId: 152999 }] };
  });
  await write(JSON.stringify(internalSection(false)));
  const notEnabled = await home();
  check("an internal collection that is NOT enabled in the published document renders no section", !notEnabled.includes('id="colecao-smoke"') && notEnabled.includes('id="origem"'));
  await write(JSON.stringify(internalSection(true)));
  const enabled = await home();
  check("an enabled internal collection renders real products from the same store's snapshot", enabled.includes('id="colecao-smoke"') && (enabled.match(/href="https:\/\/www\.usesul\.com\.br\/usesul\/product\/teste-70000/g) ?? []).length >= 3);
  check("...and gets no 'Ver todos' link to a collection page that INK does not expose", !enabled.includes("/collections/interna-smoke"));
  for (const [label, body] of [["corrupt file", "{oops"], ["incompatible version", JSON.stringify({ ...publishedWith("v9"), schemaVersion: 9 })], ["empty object", "{}"]] as const) {
    await write(body);
    const h = await home();
    check(`${label}: falls back to the seed and the home is whole`, h.includes('id="hero-title"') && h.includes('id="origem"') && !h.includes('id="colecao-smoke"'));
  }
  await write(JSON.stringify(publishedWith("smoke-3")));
  const offHome = await (await fetch(`http://localhost:${servers[0].port}/sul`)).text();
  check("flag OFF ignores published.json entirely", !offHome.includes('id="colecao-smoke"'));

  console.log("\n=== local admin on a production build ===");
  for (const s of servers) {
    for (const p of ["/admin", "/admin/home", "/admin/publicar", "/admin/midia", "/admin/preview", "/admin/preview?ADMIN_DEV_MODE=true&source=published", "/admin/media/aaaaaaaaaaaaaaaaaaaaaaaa.webp"]) {
      const r = await fetch(`http://localhost:${s.port}${p}`, { headers: { "X-Admin-Dev-Mode": "true" }, redirect: "manual" });
      check(`${s.name.trim()}: ${p} -> 404`, r.status === 404, r.status);
    }
    for (const p of ["/admin", "/admin/login", "/admin/auth/start", "/admin/home"]) {
      const r = await fetch(`http://127.0.0.1:${s.port}${p}`, { headers: { Host: "admin.smoke.test" }, redirect: "manual" });
      check(`${s.name.trim()}: ${p} on the admin host WITHOUT a complete admin configuration -> 404`, r.status === 404, r.status);
    }
    const post = await fetch(`http://localhost:${s.port}/admin/home`, { method: "POST", headers: { "Next-Action": "abc", "Content-Type": "text/plain" }, body: "[]" });
    check(`${s.name.trim()}: a server-action POST to /admin -> 404`, post.status === 404, post.status);
  }
  const previewLess = await (await fetch(`${base}/sul`)).text();
  check("the storefront never links to or loads anything from /admin", !previewLess.includes("/admin"));

  console.log("\n=== not testable yet ===");
  skip("media upload", "dev-only upload is covered by `npm run test:admin`; production storage (R2) is not provisioned");
  skip("draft preview in a browser", "covered by `npm run test:admin` (needs a development server: the admin does not exist on a production build)");
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
