// Minimal reproduction of a Next.js (16.3.5) image-optimizer hang found while diagnosing the E2E suite
// (docs/admin/cms-v1-round3.md §4). Read-only against a LOCAL server; sends nothing anywhere else.
//
//   npm run build && npx next start -p 3407        # a production server; the optimizer cache may be warm or cold
//   npx tsx scripts/repro-image-optimizer-hang.mts http://localhost:3407 [image]
//
// Each round picks a `w` the optimizer has not produced yet (a new cache key = a cold entry), starts ONE request and aborts it
// after 100-300 ms (a visitor navigating away, or a test closing its page), while three other requests for the SAME url are
// already waiting. Expected: the followers get the image. Observed on 16.3.5: in roughly half of the rounds the followers never
// answer, and neither does any later request for that url, until the process restarts. Other urls are unaffected.
const base = process.argv[2];
if (!base) throw new Error("usage: repro-image-optimizer-hang.mts <baseUrl of a running production server>");
const WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840]; // Next's default `imageSizes` + `deviceSizes`
// Optional 2nd argument: the image to optimise (a /public path or an allowed https URL). Defaults to the old local city banner.
const image = process.argv[3] ?? "/banners/sul/city-desktop.png";
const url = (w: number) => `${base}/_next/image?url=${encodeURIComponent(image)}&w=${w}&q=80`;
const headers = { Accept: "image/avif,image/webp,*/*" };

async function get(u: string, timeoutMs: number): Promise<string> {
  const t0 = Date.now();
  try {
    const res = await fetch(u, { headers, signal: AbortSignal.timeout(timeoutMs) });
    await res.arrayBuffer();
    return `${res.status} in ${Date.now() - t0} ms`;
  } catch {
    return `NO ANSWER after ${timeoutMs} ms`;
  }
}

let hung = 0;
for (const w of WIDTHS) {
  const u = url(w);
  const leader = new AbortController();
  const leaderReq = fetch(u, { headers, signal: leader.signal }).catch(() => undefined);
  const followers = [1, 2, 3].map(() => get(u, 15_000));
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  leader.abort(); // the client goes away while the entry is still being generated
  await leaderReq;
  const results = await Promise.all(followers);
  const stuck = results.some((r) => r.startsWith("NO ANSWER"));
  if (stuck) {
    hung++;
    console.log(`w=${String(w).padStart(4)}  HUNG   followers: ${results.join(" | ")}  later request: ${await get(u, 10_000)}`);
  } else {
    console.log(`w=${String(w).padStart(4)}  ok     followers: ${results.join(" | ")}`);
  }
}
console.log(`\n${hung} of ${WIDTHS.length} cold entries hung${hung > 0 ? " (bug reproduced)" : " (not reproduced this time — the race is timing-dependent; run again)"}`);
process.exit(0);
