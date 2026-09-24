import "server-only";
import { revalidatePath } from "next/cache";
import { platform } from "./platform";
import { publishDeps } from "./ops";
import { reconcileReleases } from "./publishing";

/** Reconciles the release store (Postgres) with the published.json projection and the ISR cache. Idempotent; returns the actions it took. */
export async function reconcileBootPublished(): Promise<string[]> {
  const done = await reconcileReleases(publishDeps(), async () => {
    try {
      revalidatePath("/[region]", "layout");
    } catch {
      // Outside a request there is no cache context to invalidate; a fresh process serves fresh renders (ISR also expires on its own).
    }
  });
  if (done.length > 0) await platform().audit.record({ actor: "system", action: "reconcile", meta: { actions: done, at: "boot" } }).catch(() => undefined);
  return done;
}
