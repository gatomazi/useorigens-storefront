import { studioApiAccess } from "@/lib/print-studio/auth";
import { listPrintsResponse, savePrintResponse } from "@/lib/print-studio/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await studioApiAccess(request);
  return actor instanceof Response ? actor : listPrintsResponse();
}
export async function POST(request: Request) {
  const actor = await studioApiAccess(request, true);
  return actor instanceof Response ? actor : savePrintResponse(request, actor.username, null);
}
