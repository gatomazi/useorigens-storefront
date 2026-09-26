"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Row = { name: string; state: "waiting" | "working" | "ok" | "error"; message: string };
type UploadResult = { ok: boolean; message: string };

/** Above this the browser shrinks the picture first: the server decodes every upload in memory, and one request carries at most ~9 MB. */
const SHRINK_ABOVE_BYTES = 3.5 * 1024 * 1024;
const MAX_SIDE = 3000;

/**
 * Prepares one file for the upload. Large photos (typically generated art of 4–8 MB and 4000+ px) are decoded and re-encoded as WebP with a
 * long side of at most 3000 px, which is more than any home section shows; anything the browser cannot decode (or that would not get smaller)
 * is sent untouched and judged by the server, which is the only real gatekeeper.
 */
async function prepare(file: File, maxBytes: number): Promise<{ file: File; note: string | null }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (file.size <= SHRINK_ABOVE_BYTES && longSide <= MAX_SIDE) {
      bitmap.close();
      return { file, note: null };
    }
    const scale = Math.min(1, MAX_SIDE / longSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (blob && blob.size < file.size) {
      const name = file.name.replace(/\.[a-z0-9]+$/i, "") + ".webp";
      return { file: new File([blob], name, { type: "image/webp" }), note: `reduzida no navegador (${canvas.width}×${canvas.height})` };
    }
  } catch {
    /* not decodable here: the original goes as it is */
  }
  return { file, note: file.size > maxBytes ? "grande demais" : null };
}

export function MediaUploader({ action, maxMb }: { action: (fd: FormData) => Promise<UploadResult>; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const maxBytes = maxMb * 1024 * 1024;

  const patch = (i: number, next: Partial<Row>) => setRows((list) => list.map((r, k) => (k === i ? { ...r, ...next } : r)));

  async function send() {
    const files = [...(input.current?.files ?? [])].slice(0, 20);
    if (files.length === 0) return;
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: "waiting", message: "na fila" })));
    // One request per picture: a slow or failing one never takes the others down, and no request comes near the body limit.
    for (const [i, original] of files.entries()) {
      patch(i, { state: "working", message: "enviando…" });
      const { file, note } = await prepare(original, maxBytes);
      if (file.size > maxBytes) {
        patch(i, { state: "error", message: `o arquivo tem ${(file.size / 1024 / 1024).toFixed(1)} MB; o limite é ${maxMb} MB` });
        continue;
      }
      try {
        const fd = new FormData();
        fd.set("file", file);
        const result = await action(fd);
        patch(i, { state: result.ok ? "ok" : "error", message: `${result.message}${note ? ` (${note})` : ""}` });
      } catch {
        patch(i, { state: "error", message: "a conexão foi interrompida durante o envio; tente de novo (imagem muito grande ou rede instável)" });
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="a-card space-y-4 p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label className="a-label" htmlFor="file">Enviar imagens (PNG, JPEG, WebP ou AVIF, até {maxMb} MB cada, até 20 por vez)</label>
          <input id="file" ref={input} name="file" type="file" multiple accept="image/png,image/jpeg,image/webp,image/avif" className="a-input" disabled={busy} />
        </div>
        <button type="button" className="a-btn" onClick={send} disabled={busy}>{busy ? "Enviando…" : "Enviar"}</button>
      </div>
      <p className="a-muted text-[0.8125rem]">Fotos grandes (acima de 3,5 MB ou 3000 px) são reduzidas no seu navegador antes do envio: nenhuma seção da home usa mais que isso.</p>
      {rows.length > 0 && (
        <ul className="space-y-1.5 text-[0.875rem]" aria-label="Resultado do envio" role="status">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex flex-wrap items-baseline gap-2">
              <span className={`a-badge ${r.state === "ok" ? "ok" : r.state === "error" ? "bad" : ""}`}>{r.state === "ok" ? "Enviada" : r.state === "error" ? "Falhou" : r.state === "working" ? "Enviando" : "Na fila"}</span>
              <span className="font-bold break-all">{r.name}</span>
              <span className="a-muted">{r.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
