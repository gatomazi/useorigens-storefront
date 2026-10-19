import { requireAdmin } from "@/lib/admin/auth/guard";
import { listPrintsResponse, savePrintResponse } from "@/lib/print-studio/http";

export const dynamic = "force-dynamic";
export async function GET() {
  await requireAdmin();
  return listPrintsResponse();
}
export async function POST(request: Request) {
  const actor = await requireAdmin({ mutation: true });
  return savePrintResponse(request, actor.name || actor.email, () => requireAdmin({ owner: true, mutation: true }));
}
