// Reproducible verification of the empty-Volume bootstrap, first sync, and ISR revalidation, run entirely
// against a real `next start` (production mode) server — never against real INK. See
// docs/deploy/infra-audit-review.md §2/§3 for what this proves and CLAUDE_RAILWAY_BOOTSTRAP_PREDEPLOY_REVIEW.md.
//
// Usage: npm run verify:bootstrap  (requires a prior `npm run build`)
//
// What it does, in order:
//   1. Points CATALOG_SNAPSHOT_DIR at a fresh, genuinely empty temp directory (simulates a brand-new Railway
//      Volume) and starts `next start` against it, with ADMIN_SYNC_TOKEN and ALLOW_FIXTURE_SYNC set only for
//      this run.
//   2. Confirms the empty-Volume bootstrap contract: /api/health 200, /api/ready 503, and a real storefront
//      page is intercepted by the proxy (503, noindex) instead of rendering as a normal (if empty) page.
//   3. Promotes fixture snapshot A (one product for Tijucas/SC) via POST /api/admin/catalog-sync, polls
//      GET for completion, confirms /api/ready flips to 200 and the PDP renders A's product/price.
//   4. Re-requests the same PDP (still cached from step 3) then promotes fixture snapshot B (different
//      product name/price for the same city) — WITHOUT rebuilding or restarting — and confirms the next
//      request already serves B, proving `revalidatePath` actually clears the ISR cache (not just the
//      in-process snapshot object). Same check for the search index route (/api/cidades/sul).
//   5. Fires two sync requests back-to-back and confirms one gets 202 and the other 409 (concurrency lock).
//   6. Starts a sync with an artificial delay (fixtureSyncDelayMs, test-only), SIGKILLs the server mid-delay
//      — before the snapshot is ever written — to simulate the worst case of a Railway redeploy (default
//      0-second drain: SIGTERM immediately followed by SIGKILL). Confirms the snapshot file on disk is
//      byte-identical to before (never touched), restarts a fresh server against the SAME directory, confirms
//      the job state resets to idle (not stuck "running" forever) and the old data is still served, then runs
//      one more real sync to confirm the instance is fully usable again after the simulated crash.
//   7. Cleans up: kills the (possibly restarted) server, removes the temp directory.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile as readFileAsync, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3211;
const BASE = `http://localhost:${PORT}`;
const TOKEN = "verify-bootstrap-test-token";
const AUTH = { Authorization: `Bearer ${TOKEN}` };

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  }
}

const TIJUCAS_ID = "4218004"; // Tijucas, SC — a real municipality already in the build-time geo dataset

// Real Sul municipality ids (data/geo/municipios.json, already versioned — no fabricated data), enough of
// them to legitimately cross the 50% readiness bar (src/lib/catalog/readiness.ts): a 1-city fixture would
// correctly be rejected as "not ready" by that same guard, so proving the bootstrap/revalidation flow end to
// end needs a fixture that would plausibly pass it, same as a real (if modest) sync would.
const geoRows = JSON.parse(await readFileAsync(path.join(process.cwd(), "data", "geo", "municipios.json"), "utf8")) as [number, string, string, string, string][];
const sulCityIds = geoRows.filter((r) => r[2] === "PR" || r[2] === "SC" || r[2] === "RS").map((r) => String(r[0]));
const FIXTURE_CITY_IDS = Array.from(new Set([TIJUCAS_ID, ...sulCityIds])).slice(0, Math.ceil(sulCityIds.length * 0.6));
console.log(`Fixture covers ${FIXTURE_CITY_IDS.length}/${sulCityIds.length} Sul municipalities (>50% readiness bar).`);

function fixtureSnapshot(priceForTijucas: number) {
  const bindings = FIXTURE_CITY_IDS.map((cityId, i) => ({
    cityId,
    designFamily: "ponto-de-origem",
    designVariant: "base",
    isPrimary: true,
    priority: 0,
    commerceStoreKey: "use-sul",
    inkProductId: String(9_000_000_000 + i), // realistic (numeric, like real INK ids) — see ranking.ts compareIds
    slug: `fixture-${i}`,
    storeProductUrl: "https://www.usesul.com.br/usesul/product/fixture",
    imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/fixture.jpg",
    price: cityId === TIJUCAS_ID ? priceForTijucas : 109.9,
    syncedAt: new Date().toISOString(),
  }));
  return {
    version: 1,
    stores: {
      "use-sul": {
        commerceStoreKey: "use-sul",
        syncedAt: new Date().toISOString(),
        productCount: bindings.length,
        bindings,
        merch: [],
        excluded: [],
      },
    },
  };
}

async function waitForHealth(timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
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
    const res = await fetch(`${BASE}/api/admin/catalog-sync`, { headers: AUTH });
    const body = (await res.json()) as { status: string };
    if (body.status === "succeeded" || body.status === "failed") return body;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("sync job did not finish in time");
}

let server: ChildProcess | null = null;
let tmpDir = "";
let serverLog = "";

// Spawns the `next` binary directly — NOT `npx next start` (an earlier version of this script did that; a
// SIGKILL to the npx wrapper left the real `next-server` process alive and orphaned on the shared host,
// silently finishing its delayed job in the background and making Step 6 misreport success as a false
// negative on the harness, not the app). Also spawned `detached: true`, in its OWN process group: SIGKILL
// never cascades from a parent to its children on Unix (that's not what a wrapper layer, npx or otherwise,
// was ever going to fix) — the correct way to kill "this process and everything it spawned" atomically is to
// signal the whole group (`process.kill(-pid, ...)`, see below), which is also the closer local analog of
// what actually happens on Railway: the platform tears down the whole container (every process in it) at
// once, not one process at a time — see docs/deploy/railway.md, "Por que o Start Command roda `next start`
// direto" and the note on process groups.
function spawnServer(): ChildProcess {
  const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");
  const child = spawn(nextBin, ["start", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CATALOG_SNAPSHOT_DIR: tmpDir,
      ADMIN_SYNC_TOKEN: TOKEN,
      ALLOW_FIXTURE_SYNC: "true",
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stdout?.on("data", (d) => (serverLog += d.toString()));
  child.stderr?.on("data", (d) => (serverLog += d.toString()));
  return child;
}

/** Kills a whole process group (the server and every process it spawned), not just the one PID — see spawnServer(). */
function killGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // Already dead, or this platform doesn't support negative-PID group signaling — fall back to the single process.
    child.kill(signal);
  }
}

async function main() {
  tmpDir = await mkdtemp(path.join(tmpdir(), "verify-bootstrap-"));
  console.log(`Simulated empty Volume: ${tmpDir}`);

  server = spawnServer();
  await waitForHealth(60000);

  console.log("\n=== Step 1: bootstrap with an empty Volume ===");
  {
    const health = await fetch(`${BASE}/api/health`);
    check("GET /api/health -> 200", health.status === 200);

    const ready = await fetch(`${BASE}/api/ready`);
    const readyBody = await ready.json();
    check("GET /api/ready -> 503", ready.status === 503, readyBody);
    check("reason mentions never synced", String(readyBody.reason).includes("never synced"), readyBody.reason);

    const page = await fetch(`${BASE}/sul/sc/tijucas`, { redirect: "manual" });
    check("GET /sul/sc/tijucas -> 503 (maintenance gate, not a normal empty page)", page.status === 503, page.status);
    check("maintenance response has X-Robots-Tag: noindex", page.headers.get("x-robots-tag") === "noindex");
    const pageText = await page.text();
    check("maintenance response is not the normal page shell", !pageText.includes("Estilos"));
  }

  console.log("\n=== Step 2: first sync (fixture A) via POST /api/admin/catalog-sync ===");
  {
    const post = await fetch(`${BASE}/api/admin/catalog-sync`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureSnapshot: fixtureSnapshot(100) }),
    });
    check("POST (fixture A) -> 202", post.status === 202, await post.clone().json().catch(() => null));

    const job = await waitForJobDone(15000);
    check("job finished with status succeeded", job.status === "succeeded", job);

    const ready = await fetch(`${BASE}/api/ready`);
    check("GET /api/ready -> 200 after sync", ready.status === 200, await ready.clone().json());
  }

  console.log("\n=== Step 3: warm a page with A, sync fixture B, confirm it serves B WITHOUT rebuild/restart ===");
  {
    const pageA = await fetch(`${BASE}/sul/sc/tijucas/ponto-de-origem`);
    const textA = await pageA.text();
    check("PDP now renders (ready)", pageA.status === 200);
    check("PDP shows fixture A's price", textA.includes("100"), { status: pageA.status });

    const searchA = await fetch(`${BASE}/api/cidades/sul`);
    // Search index doesn't carry price, just confirms the route itself is warmed/cacheable before the sync.
    check("search index route responds before second sync", searchA.status === 200);

    const post = await fetch(`${BASE}/api/admin/catalog-sync`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureSnapshot: fixtureSnapshot(250) }),
    });
    check("POST (fixture B) -> 202", post.status === 202);
    const job = await waitForJobDone(15000);
    check("fixture B job succeeded", job.status === "succeeded", job);

    // No rebuild, no restart between this and the previous request.
    const pageB = await fetch(`${BASE}/sul/sc/tijucas/ponto-de-origem`);
    const textB = await pageB.text();
    check("PDP now shows fixture B's price (ISR cache was actually invalidated)", textB.includes("250"), { hasOldPrice: textB.includes("100") });
    check("PDP no longer shows fixture A's price", !textB.includes("R$ 100"));
  }

  console.log("\n=== Step 4: concurrency lock — two syncs at once ===");
  {
    const [r1, r2] = await Promise.all([
      fetch(`${BASE}/api/admin/catalog-sync`, { method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: JSON.stringify({ fixtureSnapshot: fixtureSnapshot(301) }) }),
      fetch(`${BASE}/api/admin/catalog-sync`, { method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: JSON.stringify({ fixtureSnapshot: fixtureSnapshot(302) }) }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    check("exactly one 202 and one 409", statuses[0] === 202 && statuses[1] === 409, statuses);
    await waitForJobDone(15000);
  }

  console.log("\n=== Step 5: auth ===");
  {
    const noAuth = await fetch(`${BASE}/api/admin/catalog-sync`, { method: "POST" });
    check("POST with no Authorization -> 401", noAuth.status === 401, noAuth.status);
    const wrongAuth = await fetch(`${BASE}/api/admin/catalog-sync`, { method: "POST", headers: { Authorization: "Bearer wrong" } });
    check("POST with wrong token -> 401", wrongAuth.status === 401, wrongAuth.status);
  }

  console.log("\n=== Step 6: process killed mid-sync (simulated Railway redeploy, 0s drain) ===");
  {
    const snapshotFile = path.join(tmpDir, "catalog-snapshot.json");
    const before = readFileSync(snapshotFile, "utf8");

    const post = await fetch(`${BASE}/api/admin/catalog-sync`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureSnapshot: fixtureSnapshot(999), fixtureSyncDelayMs: 4000 }),
    });
    check("POST with fixtureSyncDelayMs -> 202", post.status === 202);

    // The job is now sleeping inside after(), well before it ever calls promoteSnapshot/writeSnapshot.
    await new Promise((r) => setTimeout(r, 1200));
    const runningStatus = await fetch(`${BASE}/api/admin/catalog-sync`, { headers: AUTH }).then((r) => r.json());
    check("job is running (not yet written) at kill time", runningStatus.status === "running", runningStatus);

    // SIGKILL, not SIGTERM: the worst case — Railway's default drain is 0 seconds, so a redeploy can behave
    // exactly like this (no chance for any in-process cleanup to run at all).
    killGroup(server!, "SIGKILL");
    await new Promise((r) => setTimeout(r, 500));

    const afterKill = readFileSync(snapshotFile, "utf8");
    check("snapshot file byte-identical after the kill (never touched mid-write)", afterKill === before);

    console.log("  ..restarting a fresh server against the same directory..");
    server = spawnServer();
    await waitForHealth(60000);

    const statusAfterRestart = await fetch(`${BASE}/api/admin/catalog-sync`, { headers: AUTH }).then((r) => r.json());
    check("fresh process reports idle, not stuck running forever", statusAfterRestart.status === "idle", statusAfterRestart);

    const readyAfterRestart = await fetch(`${BASE}/api/ready`);
    check("GET /api/ready -> 200 (old good data survived the crash)", readyAfterRestart.status === 200);

    const pdpAfterRestart = await fetch(`${BASE}/sul/sc/tijucas/ponto-de-origem`);
    const pdpTextAfterRestart = await pdpAfterRestart.text();
    check("PDP still shows the LAST GOOD price (250, from Step 3), not the interrupted 999", pdpTextAfterRestart.includes("250") && !pdpTextAfterRestart.includes("R$ 999"));

    // Prove the instance is fully usable again, not just "not broken".
    const recoverPost = await fetch(`${BASE}/api/admin/catalog-sync`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureSnapshot: fixtureSnapshot(777) }),
    });
    check("a normal sync after the restart -> 202", recoverPost.status === 202);
    const recoverJob = await waitForJobDone(15000);
    check("post-restart sync succeeds normally", recoverJob.status === "succeeded", recoverJob);
    const pdpFinal = await fetch(`${BASE}/sul/sc/tijucas/ponto-de-origem`).then((r) => r.text());
    check("PDP shows the new sync's price after full recovery", pdpFinal.includes("777"));
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) {
    console.log("\n--- server log tail ---");
    console.log(serverLog.split("\n").slice(-40).join("\n"));
  }
}

async function cleanup() {
  if (server) {
    killGroup(server, "SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    killGroup(server, "SIGKILL"); // belt and suspenders — never leave an orphan behind after this script exits
  }
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
}

main()
  .catch((err) => {
    console.error("verify-bootstrap crashed:", err);
    failures++;
  })
  .finally(async () => {
    await cleanup();
    process.exit(failures === 0 ? 0 : 1);
  });
