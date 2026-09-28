// Production-mode proof that promoting a new garment-index.json reaches city pages that are ALREADY in the ISR
// cache, without waiting for `revalidate = 3600`, and that a missing/corrupt index always falls back to the classic
// grid. Dev mode cannot show this (no ISR cache), so it runs `next start` against a fixture (never real INK data).
//
// Usage: npm run verify:garment-revalidation [-- --skip-build]
// Without --skip-build it runs its own `next build` (with an EMPTY snapshot dir, like verify-prerender), which
// replaces the current .next. With --skip-build the existing production build must already contain the route.
//
// Steps (Tijucas/SC as the city, one family with a cluster):
//   1. no garment index            -> city page renders, classic grid, no tabs data
//   2. index promoted on disk      -> the cached page still has no tabs (this is the problem being fixed)
//   3. POST /api/admin/garment-index/revalidate -> the same page now has the tabs and the exact piece link
//   4. index corrupted + revalidate -> classic grid again, page still 200
//   5. index removed (rollback) + revalidate -> classic grid, page 200
//   6. valid index promoted again + revalidate -> tabs again
//   7. the route rejects a missing/wrong token (401)
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TIJUCAS_ID, fixtureSnapshot } from "./fixture-snapshot.mjs";

const PORT = 3213;
const BASE = `http://localhost:${PORT}`;
const TOKEN = "verify-garment-revalidation-token";
const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");
const CITY = "/sul/sc/tijucas";
const CLUSTER = "777";
const PIECE_URL = "https://www.usesul.com.br/usesul/product/fixture-peruano";

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  }
}

let server: ChildProcess | null = null;
let serverLog = "";
const tmpDirs: string[] = [];

function run(cmd: string, args: string[], env: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: process.cwd(), env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout?.on("data", (d) => (log += d.toString()));
    child.stderr?.on("data", (d) => (log += d.toString()));
    child.on("close", (code) => {
      if (code !== 0) console.log(log.split("\n").slice(-30).join("\n"));
      resolve(code ?? 1);
    });
  });
}

async function waitForHealth(timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("server did not become healthy in time");
}

// The tab bar itself renders on the client (it reads ?peca= with useSearchParams, so the server HTML carries the classic
// grid as the Suspense fallback and a BAILOUT_TO_CLIENT_SIDE_RENDERING marker). What proves the SERVER built the page
// with the tabs is their data in the page payload: the piece's slug and the tab label exist only when the index had it.
const hasTabs = (html: string) => html.includes("fixture-peruano") && html.includes("Algodão Peruano");
const hasClassicGrid = (html: string) => html.includes("Comprar Ponto de Origem de Tijucas na loja");

async function page() {
  const res = await fetch(`${BASE}${CITY}`);
  return { status: res.status, html: await res.text() };
}

async function revalidate(token: string | null = TOKEN) {
  return fetch(`${BASE}/api/admin/garment-index/revalidate`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: JSON.stringify({ storeKeys: ["use-sul"] }),
  });
}

/** Same atomic promotion the sync uses: temp file + rename. */
async function promote(dir: string, content: string) {
  const file = path.join(dir, "garment-index.json");
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

/** How many visits after revalidation until `predicate` holds (the docs say the rebuild happens on the next visit). */
async function visitsUntil(predicate: (html: string) => boolean, max = 4) {
  for (let visit = 1; visit <= max; visit++) {
    const { status, html } = await page();
    if (status === 200 && predicate(html)) return visit;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

/** A production build persists ISR pages on disk; a page cached by an earlier run would leak into step 1. Only the city page under test is removed. */
async function forgetCachedCityPage() {
  const dir = path.join(process.cwd(), ".next", "server", "app", "sul", "sc");
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) if (file.startsWith("tijucas.")) await rm(path.join(dir, file), { recursive: true, force: true });
}

async function main() {
  const skipBuild = process.argv.includes("--skip-build");
  const volumeDir = await mkdtemp(path.join(tmpdir(), "verify-garment-revalidation-volume-"));
  tmpDirs.push(volumeDir);

  if (!skipBuild) {
    const buildDir = await mkdtemp(path.join(tmpdir(), "verify-garment-revalidation-build-"));
    tmpDirs.push(buildDir);
    console.log("=== Step 0: next build with NO catalog snapshot (Railway build phase) ===");
    const code = await run(nextBin, ["build"], { CATALOG_SNAPSHOT_DIR: buildDir });
    check("next build succeeds", code === 0, code);
    if (code !== 0) return;
  } else if (!existsSync(path.join(process.cwd(), ".next", "BUILD_ID"))) {
    throw new Error("--skip-build needs an existing production build (.next/BUILD_ID)");
  }

  await forgetCachedCityPage();
  const snapshot = fixtureSnapshot(109.9, 0.6) as { stores: Record<string, { bindings: Record<string, unknown>[] }> };
  const tijucas = snapshot.stores["use-sul"].bindings.find((b) => b.cityId === TIJUCAS_ID)!;
  tijucas.productClusterId = CLUSTER;
  await mkdir(volumeDir, { recursive: true });
  await writeFile(path.join(volumeDir, "catalog-snapshot.json"), JSON.stringify(snapshot));

  const validIndex = JSON.stringify({
    version: 1,
    stores: {
      "use-sul": {
        syncedAt: new Date().toISOString(),
        clusters: { [CLUSTER]: [[72, "9000009001", "fixture-peruano", "images/product_v2/main_image/fixture-peruano.jpg", 139.9]] },
      },
    },
  });

  server = spawn(nextBin, ["start", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, CATALOG_SNAPSHOT_DIR: volumeDir, ADMIN_SYNC_TOKEN: TOKEN, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  server.stdout?.on("data", (d) => (serverLog += d.toString()));
  server.stderr?.on("data", (d) => (serverLog += d.toString()));
  await waitForHealth(60000);

  console.log("\n=== Step 1: no garment index -> classic grid, no tabs data ===");
  {
    const { status, html } = await page();
    check("city page -> 200", status === 200, status);
    check("classic grid is rendered", hasClassicGrid(html));
    check("no tabs data in the page", !hasTabs(html));
  }

  console.log("\n=== Step 2: index promoted on disk, page already cached -> still the old grid ===");
  await promote(volumeDir, validIndex);
  {
    const { html } = await page();
    check("the cached page has NOT changed yet (this is what the revalidation fixes)", !hasTabs(html) && hasClassicGrid(html));
  }

  console.log("\n=== Step 3: revalidation -> the same city shows the tabs, without waiting for ISR ===");
  {
    const res = await revalidate();
    const body = (await res.json()) as { revalidated?: boolean; cities?: number };
    check("POST revalidate -> 200", res.status === 200 && body.revalidated === true, { status: res.status, body });
    check("at least the fixture city was marked", (body.cities ?? 0) >= 1, body);
    const visits = await visitsUntil(hasTabs);
    check("tabs data appears (within 2 visits after revalidation)", visits !== null && visits <= 2, visits);
    const { html } = await page();
    check("the exact piece link is on the page", html.includes(PIECE_URL));
    check("classic cards are still there", hasClassicGrid(html));
    console.log(`  (tabs appeared on visit ${visits})`);
  }

  console.log("\n=== Step 4: corrupted index + revalidation -> safe fallback to the classic grid ===");
  await promote(volumeDir, "{ this is not json");
  await revalidate();
  {
    const visits = await visitsUntil((html) => !hasTabs(html) && hasClassicGrid(html));
    check("page is 200 with the classic grid and no tabs data", visits !== null && visits <= 2, visits);
  }

  console.log("\n=== Step 5: index removed (rollback) + revalidation -> classic grid ===");
  await rm(path.join(volumeDir, "garment-index.json"), { force: true });
  await revalidate();
  {
    const visits = await visitsUntil((html) => !hasTabs(html) && hasClassicGrid(html));
    check("page is 200 with the classic grid and no tabs data", visits !== null && visits <= 2, visits);
  }

  console.log("\n=== Step 6: valid index promoted again + revalidation -> tabs again ===");
  await promote(volumeDir, validIndex);
  await revalidate();
  {
    const visits = await visitsUntil(hasTabs);
    check("tabs data is back", visits !== null && visits <= 2, visits);
  }

  console.log("\n=== Step 7: the route is not open ===");
  check("no token -> 401", (await revalidate(null)).status === 401);
  check("wrong token -> 401", (await revalidate("wrong")).status === 401);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) {
    console.log("\n--- server log tail ---");
    console.log(serverLog.split("\n").slice(-30).join("\n"));
  }
}

async function cleanup() {
  if (server?.pid) {
    for (const signal of ["SIGTERM", "SIGKILL"] as const) {
      try {
        process.kill(-server.pid, signal);
      } catch {
        server.kill(signal);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
}

main()
  .catch((err) => {
    console.error("verify-garment-revalidation crashed:", err);
    failures++;
  })
  .finally(async () => {
    await cleanup();
    process.exit(failures === 0 ? 0 : 1);
  });
