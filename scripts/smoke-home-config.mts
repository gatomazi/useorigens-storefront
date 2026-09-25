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
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { fixtureSnapshot } from "./fixture-snapshot.mjs";
import { buildSeedBundle } from "../src/lib/site-config/seed";
import { REGIONS, type RegionSlug } from "../src/lib/geo/regions";

const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");
const META = "1558923262073052"; // the public production IDs, used only as env fallback values; every vendor request is aborted
const GA = "G-8GYTEJ1F77";
const servers: { name: string; port: number; env: Record<string, string>; child?: ChildProcess; volume?: string }[] = [
  { name: "flag OFF", port: 3231, env: {} },
  // ADMIN_HOST alone is a PARTIAL admin configuration (no database, no OAuth client, no secret): the admin must stay closed.
  { name: "flag ON ", port: 3232, env: { SITE_CONFIG_HOME: "on", ADMIN_HOST: "www.smoke.test" } },
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

/**
 * Measurement does NOT wait for the cookie banner (owner's decision, src/lib/consent/policy.ts): a brand-new visitor who has clicked nothing,
 * and one who already chose "Rejeitar", both cause the Meta and GA4 requests. Vendor hosts are aborted at the network layer: the request is
 * OBSERVED (that is the proof) but never leaves the machine.
 */
async function trackingProbe(port: number, opts: { rejectedBefore: boolean }) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const seen: string[] = [];
  await context.route(/connect\.facebook\.net|googletagmanager\.com|google-analytics\.com/, (route) => {
    seen.push(route.request().url());
    return route.abort();
  });
  await context.route("**/_next/image**", (route) => route.abort()); // fixture images do not exist; not what is under test
  if (opts.rejectedBefore) await context.addInitScript(() => window.localStorage.setItem("useorigens:consent:marketing", JSON.stringify({ choice: "rejected", version: 2, decidedAt: "2026-09-25T00:00:00.000Z" })));
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/sul`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const bannerShown = await page.getByRole("region", { name: "Preferências de cookies" }).isVisible();
  const withoutAnyClick = [...seen];
  await browser.close();
  return { withoutAnyClick, bannerShown };
}


// ── Launched regions (Norte / Centro-Oeste) ─────────────────────────────────────────────────────────────────────────────
// Two production servers on temporary Volumes with a published.json that marks BOTH new regions launched:
//   "3 stores" has a catalog + collections for every store  → the regions are public, with REAL products linking to their OWN INK store;
//   "Sul only" is today's production (only Sul has a catalog) → the same published.json must NOT make them public (no empty page, no "0 cidades").
const geoRows = JSON.parse(await readFile(path.join(process.cwd(), "data", "geo", "municipios.json"), "utf8")) as [number, string, string, string, string][];
const HOSTS: Record<Exclude<RegionSlug, "sul">, { host: string; path: string; store: "use-norte" | "use-centro"; collectionId: number }> = {
  norte: { host: "usenorte.com.br", path: "usenorte", store: "use-norte", collectionId: 300001 },
  "centro-oeste": { host: "usecentro.com.br", path: "usecentro", store: "use-centro", collectionId: 300002 },
};
function regionCatalog(withNewRegions: boolean) {
  const snap = catalogWithMerch() as { stores: Record<string, unknown> };
  if (!withNewRegions) return snap;
  for (const region of ["norte", "centro-oeste"] as const) {
    const h = HOSTS[region];
    const cities = geoRows.filter((r) => (REGIONS[region].ufs as readonly string[]).includes(r[2])).map((r) => String(r[0]));
    const covered = cities.slice(0, Math.ceil(cities.length * 0.6));
    const merchIds = [1, 2, 3, 4].map((n) => `${h.collectionId}0${n}`);
    snap.stores[h.store] = {
      commerceStoreKey: h.store, syncedAt: new Date().toISOString(), productCount: covered.length + merchIds.length, excluded: [],
      bindings: covered.map((cityId, i) => ({
        cityId, designFamily: "ponto-de-origem", designVariant: "base", isPrimary: true, priority: 0, commerceStoreKey: h.store, inkProductId: String(8_000_000_000 + i), slug: `fixture-${region}-${i}`,
        storeProductUrl: `https://www.${h.host}/${h.path}/product/fixture`, imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/fixture.jpg", price: 109.9, syncedAt: new Date().toISOString(),
      })),
      merch: merchIds.map((id, i) => ({
        inkProductId: id, commerceStoreKey: h.store, regionSlug: region, name: `Camiseta ${region} ${i + 1}`, slug: `teste-${id}`, storeProductUrl: `https://www.${h.host}/${h.path}/product/teste-${id}`,
        imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/fixture.jpg", price: 99.9, totalSalesCount: 0, syncedAt: new Date().toISOString(),
      })),
    };
  }
  return snap;
}
function regionCollections(withNewRegions: boolean) {
  const file = collectionsFixture() as { stores: Record<string, unknown> };
  if (!withNewRegions) return file;
  for (const region of ["norte", "centro-oeste"] as const) {
    const h = HOSTS[region];
    const merchIds = [1, 2, 3, 4].map((n) => `${h.collectionId}0${n}`);
    file.stores[h.store] = { commerceStoreKey: h.store, syncedAt: "t", catalogSyncedAt: "c", totalCount: 1, collections: [rec({ id: h.collectionId, name: `Coleção ${region}`, slug: `colecao-${region}`, memberIds: merchIds, matchedCount: 4, merchCount: 4 })] };
  }
  return file;
}
function launchedBundle() {
  const bundle = buildSeedBundle({ metaPixelId: META, ga4MeasurementId: GA });
  bundle.releaseId = "regions-1";
  const sul = bundle.docs.sul.home!.sections;
  for (const region of ["norte", "centro-oeste"] as const) {
    const h = HOSTS[region];
    bundle.docs[region].home = {
      sections: [
        structuredClone(sul[0]),
        {
          id: "custom-regiao", anchor: "colecao-regiao", headingId: "colecao-regiao-title", template: "product-carousel", active: true, title: `Coleção ${region}`,
          layout: { variant: "standard", tone: "light", surface: "plain" }, source: { kind: "ink-category", store: h.store, collectionId: h.collectionId, order: "category", limit: 6 },
          analyticsSource: "homeCollection", cta: { label: "Ver todos", dest: { kind: "ink-collection", store: h.store, collectionId: h.collectionId } },
          appearance: { fill: { kind: "none" }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } },
        },
        structuredClone(sul[sul.length - 1]),
      ],
    };
    bundle.docs[region].launched = true;
  }
  return bundle;
}
/**
 * `next start` servers of one build share `.next`, so the pre-rendered (ISR) pages one server wrote for /norte or /centro-oeste would be read by the
 * next one. These regions (and Sul, whose header links change with them) are the only routes whose answer differs between the servers below, so their cache entries are removed around each run.
 */
async function purgeRegionCache() {
  const app = path.join(process.cwd(), ".next", "server", "app");
  for (const base of [app, path.join(app, "api", "cidades")]) {
    for (const entry of await readdir(base).catch(() => [] as string[])) {
      if (/^(sul|norte|centro-oeste)(\.|$)/.test(entry)) await rm(path.join(base, entry), { recursive: true, force: true });
    }
  }
}
async function stopServer(child: ChildProcess) {
  if (!child.pid) return;
  for (const sig of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(-child.pid, sig);
    } catch {
      /* gone */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}
async function startRegionServer(port: number, withNewRegions: boolean, extraEnv: Record<string, string> = {}) {
  const volume = await mkdtemp(path.join(tmpdir(), "smoke-regions-"));
  tmpDirs.push(volume);
  await writeFile(path.join(volume, "catalog-snapshot.json"), JSON.stringify(regionCatalog(withNewRegions)));
  await writeFile(path.join(volume, "collections-snapshot.json"), JSON.stringify(regionCollections(withNewRegions)));
  const cfgDir = path.join(volume, "site-config");
  await mkdir(cfgDir, { recursive: true });
  await writeFile(path.join(cfgDir, "published.json"), JSON.stringify(launchedBundle()));
  const child = spawn(nextBin, ["start", "-p", String(port)], {
    cwd: process.cwd(), env: { ...process.env, CATALOG_SNAPSHOT_DIR: volume, SITE_CONFIG_DIR: cfgDir, NODE_ENV: "production", SITE_CONFIG_HOME: "on", NEXT_PUBLIC_META_PIXEL_ID: META, NEXT_PUBLIC_GA_MEASUREMENT_ID: GA, ...extraEnv }, stdio: "ignore", detached: true,
  });
  extra.push(child);
  await waitHealthy(port);
  return child;
}
const extra: ChildProcess[] = [];

async function regionsScenario() {
  console.log("\n=== launched regions: three stores (Norte and Centro-Oeste have their own catalog) ===");
  await purgeRegionCache();
  const three = await startRegionServer(3233, true);
  const base = "http://localhost:3233";
  const sulHome = await (await fetch(`${base}/sul`)).text();
  for (const region of ["norte", "centro-oeste"] as const) {
    const h = HOSTS[region];
    const r = await fetch(`${base}/${region}`);
    const html = await r.text();
    check(`/${region} (launched, own catalog) -> 200`, r.status === 200, { status: r.status, snippet: html.slice(0, 200) });
    const own = html.match(new RegExp(`href="https://www\\.${h.host.replace(".", "\\.")}/${h.path}/product/teste-`, "g")) ?? [];
    check(`/${region}: REAL products of its own INK store (>= 3 links to ${h.host})`, own.length >= 3, own.length);
    check(`/${region}: no link to another region's INK store`, !/usesul\.com\.br\/usesul\/product|usenorte\.com\.br\/usenorte\/product\/teste-70|usecentro\.com\.br\/usecentro\/product\/teste-70/.test(html.replace(new RegExp(`https://www\\.${h.host.replace(".", "\\.")}/${h.path}/product/teste-`, "g"), "")), undefined);
    check(`/${region}: "Ver todos" points to its own store's collection`, html.includes(`https://www.${h.host}/${h.path}/collections/colecao-${region}`));
    check(`/${region}: never an empty count ("0 cidades")`, !/\b0 cidades\b/.test(html.replaceAll("<!-- -->", "")));
    check(`/${region}: the hero and the configured section render in order`, sectionIds(html).includes("colecao-regiao") && html.includes('id="hero-title"'));
    check(`/${region}/privacidade -> 200`, (await fetch(`${base}/${region}/privacidade`)).status === 200);
    check(`/api/cidades/${region} -> 200 with cities`, (await (await fetch(`${base}/api/cidades/${region}`)).text()).length > 100);
  }
  const sulAgain = await (await fetch(`${base}/sul`)).text();
  check("Sul is unchanged by the launch of the other regions (same sections, still its own store)", JSON.stringify(sectionIds(sulAgain)) === JSON.stringify(sectionIds(sulHome)) && !sulAgain.includes("usenorte.com.br/usenorte/product"));
  check("Sul now links to the launched regions on this site (not to the legacy INK stores)", sulAgain.includes('href="/norte"') && sulAgain.includes('href="/centro-oeste"'));
  const notLaunched = launchedBundle();
  notLaunched.docs.norte.launched = false;
  check("(the same bundle with Norte recalled is what a recall publishes: covered by the CMS E2E and unit tests)", notLaunched.docs.norte.launched === false);

  await stopServer(three);
  await purgeRegionCache();
  console.log("\n=== launched regions: today's production (only Sul has a catalog) ===");
  const sulOnlyServer = await startRegionServer(3234, false);
  const only = "http://localhost:3234";
  const onlyNorte = (await fetch(`${only}/norte`)).status;
  check("published.json marks Norte/Centro launched, but without their catalog: /norte -> 404", onlyNorte === 404, onlyNorte);
  check("...and /centro-oeste -> 404 (never an empty page)", (await fetch(`${only}/centro-oeste`)).status === 404);
  const sulOnly = await (await fetch(`${only}/sul`)).text();
  check("...Sul is untouched and still links to the legacy INK stores for the other regions", sulOnly.includes("https://www.usenorte.com.br") && !sulOnly.includes('href="/norte"'));
  check("...and the city-search API of a non-public region is 404", (await fetch(`${only}/api/cidades/norte`)).status === 404);
  await stopServer(sulOnlyServer);
  await purgeRegionCache();
}

async function main() {
  if (process.env.SMOKE_REGIONS_ONLY) {
    await regionsScenario();
    console.log(failures === 0 ? "\nSMOKE (regions only) PASSED" : `\nSMOKE (regions only) FAILED (${failures})`);
    return;
  }
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
    check("tracking: the server HTML carries no vendor script tag (the tools load client-side)", !/fbevents|googletagmanager|connect\.facebook\.net/.test(html));
    const fresh = await trackingProbe(s.port, { rejectedBefore: false });
    check("tracking: a new visitor who clicked nothing already loads Meta (banner does not gate it)", fresh.withoutAnyClick.some((u) => u.includes("connect.facebook.net")), fresh.withoutAnyClick);
    check(`tracking: ...and GA4 with the env-fallback ID (${GA})`, fresh.withoutAnyClick.some((u) => u.includes("googletagmanager.com") && u.includes(GA)), fresh.withoutAnyClick);
    check("tracking: the cookie banner is still shown for that visitor", fresh.bannerShown);
    const rejected = await trackingProbe(s.port, { rejectedBefore: true });
    check("tracking: a visitor who already chose Rejeitar is still measured (same as the INK store)", rejected.withoutAnyClick.some((u) => u.includes("connect.facebook.net")) && rejected.withoutAnyClick.some((u) => u.includes("googletagmanager.com") && u.includes(GA)), rejected.withoutAnyClick);
    check("tracking: ...and the banner does not reappear for them", !rejected.bannerShown);
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
      const r = await fetch(`http://127.0.0.1:${s.port}${p}`, { headers: { Host: "www.smoke.test" }, redirect: "manual" });
      check(`${s.name.trim()}: ${p} on the admin host WITHOUT a complete admin configuration -> 404`, r.status === 404, r.status);
    }
    const publicOnAdminHost = await fetch(`http://127.0.0.1:${s.port}/sul`, { headers: { Host: "www.smoke.test" } });
    check(`${s.name.trim()}: the storefront on that same host is untouched (/sul -> 200)`, publicOnAdminHost.status === 200, publicOnAdminHost.status);
    const post = await fetch(`http://localhost:${s.port}/admin/home`, { method: "POST", headers: { "Next-Action": "abc", "Content-Type": "text/plain" }, body: "[]" });
    check(`${s.name.trim()}: a server-action POST to /admin -> 404`, post.status === 404, post.status);
  }
  console.log("\n=== /media (CMS images) ===");
  for (const s of servers) {
    for (const p of [`/media/${"a".repeat(64)}/640.webp`, "/media/../etc/passwd", "/media/x/y.webp", "/media/", `/media/${"a".repeat(64)}/640.svg`]) {
      const r = await fetch(`http://127.0.0.1:${s.port}${p}`); // (a trailing-slash redirect is followed: the end state must be a 404)
      check(`${s.name.trim()}: ${p.slice(0, 40)} -> 404 (nothing published, no bucket, no traversal)`, r.status === 404, r.status);
    }
  }
  const previewLess = await (await fetch(`${base}/sul`)).text();
  check("the storefront never links to or loads anything from /admin", !previewLess.includes("/admin"));

  await regionsScenario();

  console.log("\n=== not testable yet ===");
  skip("media upload", "dev-only upload is covered by `npm run test:admin`; production storage (R2) is not provisioned");
  skip("draft preview in a browser", "covered by `npm run test:admin` (needs a development server: the admin does not exist on a production build)");
    console.log("(build without Volume, bootstrap and sync-driven ISR invalidation: `npm run verify:prerender` and `npm run verify:bootstrap`)");

  console.log(failures === 0 ? "\nSMOKE PASSED" : `\nSMOKE FAILED (${failures})`);
}

async function cleanup() {
  for (const c of extra) {
    if (c.pid) {
      for (const sig of ["SIGTERM", "SIGKILL"] as const) {
        try {
          process.kill(-c.pid, sig);
        } catch {
          /* gone */
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
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
