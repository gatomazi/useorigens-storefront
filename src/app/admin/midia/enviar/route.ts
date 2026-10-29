import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { adminSurface, currentActor } from "@/lib/admin/auth/guard";
import { allow } from "@/lib/admin/auth/rate-limit";
import { saveUpload } from "@/lib/admin/media";
import { describeUploadFailure } from "@/lib/admin/media/upload-errors";
import { platform } from "@/lib/admin/platform";

export const dynamic = "force-dynamic";

type UploadResult = { ok: boolean; message: string };
const reply = (result: UploadResult, status = 200) => NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Uploads ONE picture (the media screen, `MediaUploader`) and answers with a result, so the screen can send several one after another.
 *
 * A route, not a Server Action: Cloudflare, in front of the site, inspects the body of every request that carries `Next-Action` (its managed rule
 * against the React Server Components exploits) and refuses some pictures because of what their bytes happen to contain: the same photo passed or
 * failed depending on the JPEG compression, at any size (29/10/2026). A plain multipart POST is not inspected by that rule.
 * The guard is the one of a Server Action: the admin origin in production, a signed-in person. The server decodes, validates and re-encodes.
 */
export async function POST(request: NextRequest) {
  const config = await adminSurface();
  if (!config) return new Response(null, { status: 404 });
  if (config.mode === "prod" && request.headers.get("origin") !== config.adminOrigin) return new Response(null, { status: 404 });
  const actor = await currentActor(config);
  if (!actor) return reply({ ok: false, message: "Sua sessão expirou. Entre de novo no painel e envie outra vez." }, 401);

  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size === 0) return reply({ ok: false, message: "Escolha um arquivo." }, 400);
  if (!allow(`upload:${actor.id}`, 60, 10 * 60_000)) return reply({ ok: false, message: "Muitos envios seguidos. Aguarde alguns minutos." }, 429);
  const result = await saveUpload(Buffer.from(await file.arrayBuffer()), file.name, actor.id === "dev-local" ? null : actor.id).catch((error: unknown) => {
    // The reason is logged (never a secret: the object-store client only reports the HTTP status) and its class shown to the owner.
    console.error("[admin] media upload failed:", error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "unknown");
    return { ok: false as const, error: describeUploadFailure(error, process.env.BUCKET_ADDRESSING) };
  });
  revalidatePath("/admin", "layout");
  if (!result.ok) return reply({ ok: false, message: result.error });
  await platform().audit.record({ actor: actor.id, action: "media.upload", scope: "sul", target: result.choice.assetId, meta: null }).catch(() => undefined);
  return reply({ ok: true, message: result.duplicate ? `A imagem "${result.choice.label}" já existia; foi reaproveitada.` : `Imagem "${result.choice.label}" enviada${platform().mode === "prod" ? "" : " (somente neste computador)"}.` });
}
