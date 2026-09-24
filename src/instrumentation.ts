/**
 * Runs once when a new server instance starts, before it takes traffic (Next.js `register()` convention).
 * Purely informational: logs the catalog snapshot's state at boot so a missing/empty snapshot shows up in
 * Railway's deploy logs immediately, instead of only being discoverable by noticing an empty storefront or
 * polling /api/ready. Never throws, never blocks startup — liveness stays independent of catalog state
 * (see /api/health vs /api/ready).
 *
 * Always logs the resolved absolute path checked (bootstrap review §2: "não presumir /app" — process.cwd()
 * at runtime is an assumption, not a guarantee), so a Volume mounted at the wrong path is obvious from the
 * very first deploy log instead of only surfacing as "snapshot not found" with no further clue.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  void reconcilePublishedAtBoot();
  const { snapshotStatus } = await import("./lib/catalog/snapshot-file");
  const status = snapshotStatus();
  if (!status.present) {
    console.warn(
      `[boot] catalog snapshot: NOT FOUND at ${status.path} — every city will show as having no products until one exists. ` +
        `If a Volume is meant to be mounted here, confirm the mount path matches exactly. Run \`npm run catalog:sync\` locally or POST /api/admin/catalog-sync.`,
    );
    return;
  }
  const ageMin = status.ageMs === null ? "?" : Math.round(status.ageMs / 60000);
  console.log(
    `[boot] catalog snapshot: present at ${status.path}, ${ageMin}min old, ${status.totalProducts} products across ${status.stores.length} store(s): ` +
      status.stores.map((s) => `${s.storeKey}=${s.productCount}`).join(", "),
  );
}

/**
 * Production CMS only (complete admin configuration): after a start, bring published.json back in line with the database's live release
 * (a redeploy with an empty or restored Volume, or a publish interrupted by a restart). Fire-and-forget with a delay so it never
 * competes with the boot, never throws, and does nothing at all when the admin is not configured — the storefront itself never depends
 * on it (it reads the file, or falls back to the seed).
 */
async function reconcilePublishedAtBoot(): Promise<void> {
  try {
    const { adminConfig } = await import("./lib/admin/config");
    if (adminConfig().mode !== "prod") return;
    setTimeout(() => {
      void (async () => {
        try {
          const { reconcileBootPublished } = await import("./lib/admin/boot-reconcile");
          const done = await reconcileBootPublished();
          if (done.length > 0) console.log(`[boot] cms: reconciled published config (${done.join(", ")})`);
        } catch (error) {
          console.warn(`[boot] cms: reconcile skipped (${error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "postgres://***") : "error"})`);
        }
      })();
    }, 15_000).unref();
  } catch {
    /* never block startup */
  }
}
