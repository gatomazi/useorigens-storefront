import { InkRequestError, type InkProductClient } from "./ink-product-client";
import { inkArts, safeInkUrl, type ProductJob, type ProductJobStore } from "./ink-products";

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
/** Without a link this long after the creation, a person looks at it. */
const LINK_GIVE_UP_MS = 10 * 60_000;

let queue: Promise<unknown> = Promise.resolve();
/** The heavy part (two renders of ~84 MB each and a POST of ~20 MB) one job at a time in this process: a burst must not exhaust the instance. */
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Takes the job if nobody holds it and carries it as far as it can: draws the art, creates the product at INK (hidden, with the job id as the
 * Idempotency-Key, forever the same), then follows it until the link and the photo are there or the photo wait is over. A transient failure leaves
 * the job for a later run (the waiting page asks again); a 409 "indeterminate" or a failure after INK holds the product goes to `check`.
 */
export async function runProductJob(id: string, deps: WorkerDeps, describe: (job: ProductJob) => { description: string; tags: string[] }): Promise<void> {
  const claimed = await deps.store.claim(id, LEASE_MS, deps.now());
  if (!claimed) return;
  let job = claimed;
  try {
    if (!job.inkProductId) {
      const created = await oneAtATime(async () => {
        const { darkInk, lightInk } = await deps.render(job);
        job = (await deps.store.update(id, { status: "creating" })) ?? job;
        const arts = inkArts(await deps.client.printableAreas(job.productTypeId), darkInk, lightInk);
        const { description, tags } = describe(job);
        return deps.client.createProduct({ product_type_id: job.productTypeId, name: job.name, description, price: job.price, visible_in_store: false, tags, arts }, job.id);
      });
      if (!/^\d{1,20}$/.test(created.id)) throw new Error("a INK não devolveu o id do produto");
      job = (await deps.store.update(id, { status: "photos", inkProductId: created.id, inkUrl: safeInkUrl(created.url), inkImageUrl: created.imageUrl, inkCreatedAt: deps.now().toISOString(), error: null })) ?? job;
    }
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
      await deps.store.update(id, { status: "ready", inkUrl: url, inkImageUrl: image, readyAt: deps.now().toISOString() }, { release: true });
    } else if (deps.now().getTime() > since + LINK_GIVE_UP_MS) {
      await deps.store.update(id, { status: "check", error: "a INK não devolveu um link da loja" }, { release: true });
    } else {
      await deps.store.update(id, { inkImageUrl: image }, { release: true }); // still "photos": the next run asks INK again
    }
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    const attempts = job.attempts + 1;
    if (e instanceof InkRequestError && e.indeterminate) await deps.store.update(id, { status: "check", attempts, error: `INK 409: ${message}` }, { release: true });
    else if (job.inkProductId) await deps.store.update(id, { status: "check", attempts, error: message }, { release: true });
    else if (e instanceof InkRequestError && e.transient && attempts < MAX_ATTEMPTS) await deps.store.update(id, { status: "queued", attempts, error: message }, { release: true });
    else await deps.store.update(id, { status: "failed", attempts, error: message }, { release: true });
  }
}
