import { InkRequestError, type InkProductClient } from "./ink-product-client";
import { inkArts, safeInkUrl, type ProductJob, type ProductJobStore } from "./ink-products";
import { isProvisionalInkPhoto } from "./product-status";

export type WorkerDeps = {
  store: ProductJobStore;
  client: InkProductClient;
  /** The two full-size PNGs: the dark-ink art (for white, grey and yellow shirts) and the light-ink art (every other colour). */
  render(job: ProductJob): Promise<{ darkInk: Buffer; lightInk: Buffer }>;
  now(): Date;
  sleep(ms: number): Promise<void>;
};

/** How long a worker holds a job; a job left behind (the process restarted) is taken again once it expires. */
export const LEASE_MS = 3 * 60_000;
/** The owner's choice (27/10/2026): wait for INK's photo up to a minute after the creation, then send the customer anyway. */
export const PHOTO_WAIT_MS = 60_000;
const POLL_MS = 4_000;
const MAX_ATTEMPTS = 4;
/** After a transient failure the job waits 20 s, 40 s, 80 s before the next try (INK's 429s need it; the 12/09 migration waited 15–60 s). */
export const retryDelayMs = (attempts: number): number => 20_000 * 2 ** Math.max(0, attempts - 1);
/** Without a link this long after the creation, a person looks at it. */
const LINK_GIVE_UP_MS = 10 * 60_000;
/** INK's first photo can be a provisional one (/cache/): the final one came about a minute later on 28/10/2026. It is looked for this long. */
export const FINAL_PHOTO_WAIT_MS = 3 * 60_000;
const FINAL_PHOTO_POLL_MS = 15_000;
/** States in which nothing exists at INK yet: the only ones an error before the creation may change. */
const BEFORE_INK = ["queued", "creating"] as const;

let queue: Promise<unknown> = Promise.resolve();
/** The heavy part (two renders of ~84 MB each and a POST of ~20 MB) one job at a time in this process: a burst must not exhaust the instance. */
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Carries a job as far as it can. The creation runs in the one-at-a-time queue and takes the job's lease only when its turn comes (a job waiting in
 * the queue holds nothing, so its lease cannot expire while it waits); a job INK already holds skips it. Then, outside the queue, it follows the
 * product until the link and the photo are there or the photo wait is over. The Idempotency-Key is the job id, forever the same. A transient failure
 * keeps the job for a later try after a growing pause; a 409 "indeterminate" goes to `check`; an error never overwrites a job that reached INK.
 */
export async function runProductJob(id: string, deps: WorkerDeps, describe: (job: ProductJob) => { description: string; tags: string[] }): Promise<void> {
  const held = await oneAtATime(async (): Promise<ProductJob | null> => {
    const job = await deps.store.claim(id, LEASE_MS, deps.now());
    if (!job || job.inkProductId) return job;
    try {
      const { darkInk, lightInk } = await deps.render(job);
      const creating = (await deps.store.update(id, { status: "creating", leaseUntil: new Date(deps.now().getTime() + LEASE_MS).toISOString() }, { onlyIf: BEFORE_INK })) ?? job;
      const arts = inkArts(await deps.client.printableAreas(creating.productTypeId), darkInk, lightInk);
      const { description, tags } = describe(creating);
      const made = await deps.client.createProduct({ product_type_id: creating.productTypeId, name: creating.name, description, price: creating.price, visible_in_store: false, tags, arts }, creating.id);
      if (!/^\d{1,20}$/.test(made.id)) throw new Error("a INK não devolveu o id do produto");
      return deps.store.update(id, { status: "photos", inkProductId: made.id, inkUrl: safeInkUrl(made.url), inkImageUrl: made.imageUrl, inkCreatedAt: deps.now().toISOString(), error: null }, { onlyIf: BEFORE_INK });
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      const attempts = job.attempts + 1;
      if (e instanceof InkRequestError && e.indeterminate) await deps.store.update(id, { status: "check", attempts, error: `INK 409: ${message}` }, { release: true, onlyIf: BEFORE_INK });
      else if (e instanceof InkRequestError && e.transient && attempts < MAX_ATTEMPTS) await deps.store.update(id, { status: "queued", attempts, error: message, leaseUntil: new Date(deps.now().getTime() + retryDelayMs(attempts)).toISOString() }, { onlyIf: BEFORE_INK });
      else await deps.store.update(id, { status: "failed", attempts, error: message }, { release: true, onlyIf: BEFORE_INK });
      return null;
    }
  });
  if (!held?.inkProductId || held.status !== "photos") return;

  const job = held;
  try {
    const since = new Date(job.inkCreatedAt ?? job.updatedAt).getTime();
    let { inkUrl: url, inkImageUrl: image } = job;
    while (!(url && image) && deps.now().getTime() < since + PHOTO_WAIT_MS) {
      await deps.sleep(POLL_MS);
      try {
        const seen = await deps.client.getProduct(job.inkProductId!);
        url = safeInkUrl(seen.url) ?? url;
        image = seen.imageUrl ?? image;
      } catch (e) {
        if (!(e instanceof InkRequestError && e.transient)) throw e;
      }
    }
    if (url) {
      const ready = await deps.store.update(job.id, { status: "ready", inkUrl: url, inkImageUrl: image, readyAt: deps.now().toISOString() }, { release: true, onlyIf: ["photos"] });
      // The customer goes now, with the provisional photo; the final one replaces it as soon as INK has it.
      if (ready && isProvisionalInkPhoto(image)) await swapForFinalPhoto(ready, deps);
    } else if (deps.now().getTime() > since + LINK_GIVE_UP_MS) await deps.store.update(job.id, { status: "check", error: "a INK não devolveu um link da loja" }, { release: true, onlyIf: ["photos"] });
    else await deps.store.update(job.id, { inkImageUrl: image }, { release: true, onlyIf: ["photos"] }); // still "photos": the next run asks INK again
  } catch (e) {
    await deps.store.update(job.id, { status: "check", attempts: job.attempts + 1, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { release: true, onlyIf: ["photos"] });
  }
}

/** Looks for INK's final photo for a while; nothing here may change the job but its picture (a failure keeps the provisional one). */
async function swapForFinalPhoto(job: ProductJob, deps: WorkerDeps): Promise<void> {
  const until = deps.now().getTime() + FINAL_PHOTO_WAIT_MS;
  while (deps.now().getTime() < until) {
    await deps.sleep(FINAL_PHOTO_POLL_MS);
    const seen = await deps.client.getProduct(job.inkProductId!).catch(() => null);
    if (seen?.imageUrl && !isProvisionalInkPhoto(seen.imageUrl)) {
      await deps.store.update(job.id, { inkImageUrl: seen.imageUrl }, { onlyIf: ["ready"] }).catch(() => null);
      return;
    }
  }
}
