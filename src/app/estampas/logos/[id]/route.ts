import { studioApiAccess } from "@/lib/print-studio/auth";
import { logoResponse } from "@/lib/print-studio/logo-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await studioApiAccess(request);
  return actor instanceof Response ? actor : logoResponse((await params).id);
}
