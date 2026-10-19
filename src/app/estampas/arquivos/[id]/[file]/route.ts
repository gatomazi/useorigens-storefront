import { studioApiAccess } from "@/lib/print-studio/auth";
import { printFileResponse } from "@/lib/print-studio/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const actor = await studioApiAccess(request);
  return actor instanceof Response ? actor : printFileResponse(request, await params, false);
}
