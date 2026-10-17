import { saveCollectionNotesAction } from "@/app/admin/actions";
import { collectionMenuEntries, siteCollectionMenu } from "@/lib/catalog/collection-menu";
import type { RegionSlug } from "@/lib/geo/regions";
import { MAX_COLLECTION_NOTE, type ScopeDoc } from "@/lib/site-config/schema";

/**
 * The short description of each collection of the site's menu ("Camisetas com o estado inteiro"), shown under its name in the header's open menu and in
 * the phone menu. One line each; an empty field = the name alone. Only collections that really show in the site's menu are listed (they have a page).
 */
export function CollectionNotesCard({ region, doc, rev, readOnly }: { region: RegionSlug; doc: ScopeDoc; rev: number | null; readOnly: boolean }) {
  const { top, more } = collectionMenuEntries(region, doc);
  const shown = [...top, ...more].filter((e) => e.pagePath);
  const notes = new Map((doc.collections?.descriptions ?? []).map((d) => [`${d.store}:${d.collectionId}`, d.text]));
  const live = siteCollectionMenu(region, doc).categories.filter((c) => c.detail).length;
  return (
    <section id="descricoes-colecoes" className="a-card scroll-mt-4 p-5" aria-labelledby="descricoes-colecoes-titulo" data-testid="collection-notes">
      <h2 id="descricoes-colecoes-titulo" className="a-h2">Descrições das coleções no menu</h2>
      <p className="a-muted mt-2 max-w-3xl">Uma linha curta embaixo do nome de cada coleção, no menu aberto do topo do site (Coleções/Categorias) e no menu do celular, para explicar o que é cada uma. Até {MAX_COLLECTION_NOTE} caracteres. Deixe vazio para mostrar só o nome. Vale depois de publicar.</p>
      {shown.length === 0 ? (
        <p className="a-muted mt-4">Nenhuma coleção aparece no menu do site agora.</p>
      ) : (
        <form action={saveCollectionNotesAction} className="mt-4 space-y-3">
          <input type="hidden" name="rev" value={rev ?? "null"} />
          <input type="hidden" name="scope" value={region} />
          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((e) => {
              const key = `${e.ref.store}:${e.ref.collectionId}`;
              return (
                <div key={key}>
                  <label className="a-label" htmlFor={`note_${key}`}>{e.record.name}{e.position === "top" ? " · no topo" : ""}</label>
                  <input id={`note_${key}`} name={`note_${key}`} defaultValue={notes.get(key) ?? ""} maxLength={MAX_COLLECTION_NOTE} className="a-input" placeholder="Ex.: Camisetas com o estado inteiro" disabled={readOnly} />
                </div>
              );
            })}
          </div>
          <p className="a-muted text-[0.8125rem]">{live === 0 ? "Hoje nenhuma coleção tem descrição neste rascunho." : `${live} ${live === 1 ? "coleção tem" : "coleções têm"} descrição neste rascunho.`}</p>
          {!readOnly && <button type="submit" className="a-btn" data-testid="save-collection-notes">Salvar rascunho das descrições</button>}
        </form>
      )}
    </section>
  );
}
