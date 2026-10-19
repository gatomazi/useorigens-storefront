import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findBrandLogo } from "./logos";

/** Fixed catalog only: user-provided paths never reach the filesystem. Original PNG bytes are served untouched. */
export async function logoResponse(id: string): Promise<Response> {
  const headers = { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const logo = findBrandLogo(id);
  if (!logo) return new Response(null, { status: 404, headers });
  try {
    const bytes = await readFile(path.join(process.cwd(), "assets", "print-studio", "logos", `${logo.id}.png`));
    return new Response(new Uint8Array(bytes), { headers });
  } catch { return new Response(null, { status: 503, headers }); }
}
