// Regression check for "the Railway build has no catalog": the INK snapshot lives on the runtime Volume, which
// does not exist yet while `next build` runs on Railway. If a route that reads the catalog is prerendered at
// build time, its HTML is baked with an EMPTY catalog ("0 cidades", no hero products) and keeps serving that
// until the next ISR revalidation. verify-bootstrap.mts cannot see this: it runs against a local build that
// already had data/generated/catalog-snapshot.json on disk when it was built.
//
// Usage: npm run verify:prerender  (runs its own `next build`, so it replaces the current .next)
//
// What it does, in order:
//   1. Builds with CATALOG_SNAPSHOT_DIR pointing at a genuinely EMPTY temp directory (build machine, no Volume).
//   2. Starts `next start` (production mode) against a DIFFERENT temp directory that already holds a valid
//      fixture snapshot (Volume mounted at runtime) — never real INK data.
//   3. Confirms the very first request to /sul, /sul/privacidade, a state page and a city page already shows
//      the real city count and real hero/product data, with no resync and no waiting for ISR.
//   4. Promotes a second, larger fixture via POST /api/admin/catalog-sync and confirms /sul and
//      /sul/privacidade now show the new count, i.e. a resync still invalidates the ISR cache.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtureCityIds, fixtureSnapshot } from "./fixture-snapshot.mjs";

const PORT = 3212;
const BASE = `http://localhost:${PORT}`;
const TOKEN = "verify-prerender-test-token";
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  }
}

const brNumber = (n: number) => n.toLocaleString("pt-BR");
/** The "N cidades do Sul em camiseta" strings on a page (React inserts `<!-- -->` between text nodes). */
function cityCounts(html: string): string[] {
  return [...html.replaceAll("<!-- -->", "").matchAll(/([\d.]+) cidades do Sul em camiseta/g)].map((m) => m[1]);
}

let server: ChildProcess | null = null;
let serverLog = "";
const tmpDirs: string[] = [];

function runBuild(env: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(nextBin, ["build"], { cwd: process.cwd(), env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout?.on("data", (d) => (log += d.toString()));
    child.stderr?.on("data", (d) => (log += d.toString()));
    child.on("close", (code) => {
      if (code !== 0) console.log(log.split("\n").slice(-30).join("\n"));
      resolve(code ?? 1);
    });
  });
}

function spawnServer(snapshotDir: string): ChildProcess {
  const child = spawn(nextBin, ["start", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, CATALOG_SNAPSHOT_DIR: snapshotDir, ADMIN_SYNC_TOKEN: TOKEN, ALLOW_FIXTURE_SYNC: "true", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own process group, so the whole server tree can be killed at once (see verify-bootstrap.mts)
  });
  child.stdout?.on("data", (d) => (serverLog += d.toString()));
  child.stderr?.on("data", (d) => (serverLog += d.toString()));
  return child;
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

async function waitForJobDone(timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = (await (await fetch(`${BASE}/api/admin/catalog-sync`, { headers: AUTH })).json()) as { status: string };
    if (body.status === "succeeded" || body.status === "failed") return body;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("sync job did not finish in time");
}

async function main() {
  const buildDir = await mkdtemp(path.join(tmpdir(), "verify-prerender-build-"));
  const volumeDir = await mkdtemp(path.join(tmpdir(), "verify-prerender-volume-"));
  tmpDirs.push(buildDir, volumeDir);

  console.log("=== Step 1: next build with NO catalog snapshot (Railway build phase, Volume not mounted) ===");
  const code = await runBuild({ CATALOG_SNAPSHOT_DIR: buildDir });
  check("next build succeeds without a snapshot", code === 0, code);
  if (code !== 0) return;

  console.log("\n=== Step 2: start the server with a valid snapshot in place (Volume mounted at runtime) ===");
  await mkdir(volumeDir, { recursive: true });
  const runtimeCities = fixtureCityIds(0.6).length;
  await writeFile(path.join(volumeDir, "catalog-snapshot.json"), JSON.stringify(fixtureSnapshot(100, 0.6)));
  server = spawnServer(volumeDir);
  await waitForHealth(60000);
  check("GET /api/ready -> 200", (await fetch(`${BASE}/api/ready`)).status === 200);

  console.log("\n=== Step 3: first request already shows the real catalog (no resync, no ISR wait) ===");
  {
    const expected = brNumber(runtimeCities);
    const home = await (await fetch(`${BASE}/sul`)).text();
    const homeCounts = cityCounts(home);
    check(`/sul shows "${expected} cidades" everywhere it shows a count`, homeCounts.length > 0 && homeCounts.every((c) => c === expected), homeCounts);
    check("/sul has no '0 cidades' baked in", !homeCounts.includes("0"), homeCounts);
    check("/sul hero renders a real product card (Porto Alegre, ponto-de-origem)", home.includes("/sul/rs/porto-alegre/ponto-de-origem"));
    check("/sul hero card shows a real price", /R\$\s?109,90/.test(home.replaceAll("<!-- -->", "")));

    const privacy = await (await fetch(`${BASE}/sul/privacidade`)).text();
    const privacyCounts = cityCounts(privacy);
    check("/sul/privacidade header shows the real count", privacyCounts.length > 0 && privacyCounts.every((c) => c === expected), privacyCounts);

    const stateRes = await fetch(`${BASE}/sul/sc`);
    const state = await stateRes.text();
    check("/sul/sc -> 200 with the real count", stateRes.status === 200 && cityCounts(state).every((c) => c === expected), cityCounts(state));

    const cityRes = await fetch(`${BASE}/sul/sc/tijucas`);
    const city = await cityRes.text();
    check("/sul/sc/tijucas -> 200 with a real product link", cityRes.status === 200 && city.includes("https://www.usesul.com.br/usesul/product/fixture"), cityRes.status);
    check("/sul/sc/tijucas has the real count", cityCounts(city).every((c) => c === expected), cityCounts(city));
  }

  console.log("\n=== Step 4: a new sync still invalidates the ISR cache (no rebuild, no restart) ===");
  {
    const full = fixtureCityIds(1).length;
    const post = await fetch(`${BASE}/api/admin/catalog-sync`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureSnapshot: fixtureSnapshot(250, 1) }),
    });
    check("POST (larger fixture) -> 202", post.status === 202, post.status);
    const job = await waitForJobDone(30000);
    check("sync job succeeded", job.status === "succeeded", job);

    const expected = brNumber(full);
    const home = cityCounts(await (await fetch(`${BASE}/sul`)).text());
    check(`/sul now shows "${expected} cidades"`, home.length > 0 && home.every((c) => c === expected), home);
    const privacy = cityCounts(await (await fetch(`${BASE}/sul/privacidade`)).text());
    check(`/sul/privacidade now shows "${expected} cidades"`, privacy.length > 0 && privacy.every((c) => c === expected), privacy);
  }

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
    console.error("verify-prerender crashed:", err);
    failures++;
  })
  .finally(async () => {
    await cleanup();
    process.exit(failures === 0 ? 0 : 1);
  });
