import { adminSurface, currentActor } from "@/lib/admin/auth/guard";
import { logoResponse } from "@/lib/print-studio/logo-server";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = await adminSurface();
  if (!config || !(await currentActor(config))) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return logoResponse((await params).id);
}
