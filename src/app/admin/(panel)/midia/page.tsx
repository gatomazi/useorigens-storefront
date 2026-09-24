import { deleteMediaAction, uploadMediaAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { canUpload, listMedia, MAX_UPLOAD_BYTES } from "@/lib/admin/media";
import { platform } from "@/lib/admin/platform";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { loadWorkspace } from "@/lib/admin/workspace";

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [media, ws] = await Promise.all([listMedia(), loadWorkspace()]);
  const prod = platform().mode === "prod";
  const uploads = canUpload();
  const used = JSON.stringify(ws.doc);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Mídia</h1>
        <p className="a-muted mt-2 max-w-2xl">Banners do projeto (os mesmos da loja) e imagens enviadas. {prod ? <>As imagens enviadas ficam no R2, em vários tamanhos, e uma imagem que faz parte de uma versão publicada nunca é apagada (para o “restaurar” continuar funcionando).</> : <>No desenvolvimento, as imagens enviadas ficam <strong>somente neste computador</strong>; em produção irão para o R2.</>}</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {uploads ? (
        <form action={uploadMediaAction} encType="multipart/form-data" className="a-card grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className="a-label" htmlFor="file">Enviar imagem (PNG, JPEG, WebP ou AVIF, até {MAX_UPLOAD_BYTES / 1024 / 1024} MB, 6000 px)</label>
            <input id="file" name="file" type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="a-input" required />
          </div>
          <button type="submit" className="a-btn">Enviar</button>
        </form>
      ) : (
        <p className="a-flash err">O envio de imagens ainda não está configurado neste ambiente (falta o armazenamento R2). Você pode usar os banners do projeto.</p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Imagens">
        {media.map((m) => {
          const src = m.kind === "banner" ? m.src.replace(/\.[a-z]+$/i, "-640.webp") : m.src;
          const inUse = used.includes(m.assetId);
          return (
            <li key={m.assetId} className="a-card">
              {/* eslint-disable-next-line @next/next/no-img-element -- dev-only admin thumbnail of a local static file */}
              <img src={src} alt="" className="a-thumb" loading="lazy" />
              <div className="space-y-1 p-3 text-[0.875rem]">
                <p className="break-all font-bold">{m.label}</p>
                <p className="a-muted">{m.width}×{m.height} · {m.kind === "banner" ? "banner do projeto" : prod ? "enviada" : "enviada aqui"}</p>
                <p>{inUse ? <span className="a-badge ok">Em uso no rascunho</span> : <span className="a-badge">Livre</span>}</p>
                {m.kind === "upload" && (
                  <form action={deleteMediaAction}><input type="hidden" name="assetId" value={m.assetId} /><button type="submit" className="a-btn danger sm" disabled={inUse}>Excluir</button></form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
