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
