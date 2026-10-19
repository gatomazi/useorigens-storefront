import { adminSurface, currentActor } from "@/lib/admin/auth/guard";
import { printFileResponse } from "@/lib/print-studio/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const config = await adminSurface();
  if (!config || !(await currentActor(config))) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return printFileResponse(request, await params, true);
}
