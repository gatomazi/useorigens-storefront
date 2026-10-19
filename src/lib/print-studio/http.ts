import "server-only";
import { MAX_PROJECT_BYTES, parseProjectFile, projectFileName } from "@/lib/print-studio/model";
import { serverPrintStore } from "@/lib/print-studio/server";
import { MAX_PNG_BYTES } from "@/lib/print-studio/server-store";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const MAX_BODY = MAX_PROJECT_BYTES + MAX_PNG_BYTES + 65536;

async function boundedFormData(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw new Error("O envio excede o limite de 56 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("O envio está vazio.");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error("O envio excede o limite de 56 MB."); }
    chunks.push(new Uint8Array(value));
  }
  return new Response(new Blob(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}

export async function listPrintsResponse() {
  try { return Response.json({ items: await serverPrintStore().list() }, { headers: HEADERS }); }
  catch { return Response.json({ error: "Não foi possível carregar as estampas. Tente novamente." }, { status: 503, headers: HEADERS }); }
}

export async function savePrintResponse(request: Request, createdBy: string, authorizeTemplate: (() => Promise<unknown>) | null) {
  let form: FormData;
  try { form = await boundedFormData(request); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Envio inválido." }, { status: 400, headers: HEADERS }); }
  const kind = form.get("kind");
  if (kind !== "art" && kind !== "template") return Response.json({ error: "Escolha estampa ou modelo." }, { status: 400, headers: HEADERS });
  if (kind === "template") {
    if (!authorizeTemplate) return Response.json({ error: "Somente o responsável pode publicar modelos." }, { status: 403, headers: HEADERS });
    await authorizeTemplate();
  }
  let project;
  let bytes;
  try {
    const json = form.get("project");
    const png = form.get("png");
    if (typeof json !== "string" || !(png instanceof File) || png.size > MAX_PNG_BYTES) throw new Error("Envie o modelo e a imagem PNG da estampa.");
    project = parseProjectFile(json);
    bytes = new Uint8Array(await png.arrayBuffer());
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Modelo inválido." }, { status: 400, headers: HEADERS }); }
  try {
    const item = await serverPrintStore().save({ project, png: bytes, kind, createdBy });
    return Response.json({ item }, { status: 201, headers: HEADERS });
  } catch {
    return Response.json({ error: "Não foi possível salvar a estampa no servidor. Confira o armazenamento e tente novamente; sua edição continua aqui." }, { status: 503, headers: HEADERS });
  }
}

export async function printFileResponse(request: Request, { id, file }: { id: string; file: string }, canDownload: boolean) {

  if ((!canDownload && file === "art.png") || (file !== "project.json" && file !== "art.png" && file !== "preview.webp")) return new Response(null, { status: 404, headers: HEADERS });
  try {
    const bytes = await serverPrintStore().read(id, file);
    if (!bytes) return new Response(null, { status: 404, headers: HEADERS });
    const headers: Record<string, string> = { ...HEADERS, "Content-Type": file.endsWith(".json") ? "application/json" : file.endsWith(".png") ? "image/png" : "image/webp" };
    if (file === "art.png" && new URL(request.url).searchParams.get("download") === "1") {
      const metadata = await serverPrintStore().read(id, "metadata.json");
      const name = metadata ? JSON.parse(metadata.toString()).name : "estampa";
      headers["Content-Disposition"] = `attachment; filename="${projectFileName(name)}.png"`;
    }
    return new Response(new Uint8Array(bytes), { headers });
  } catch { return new Response(null, { status: 503, headers: HEADERS }); }
}
