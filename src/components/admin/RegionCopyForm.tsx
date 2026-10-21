"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { copyRegionConfigurationAction, reviewRegionCopyAction } from "@/app/admin/region-copy-actions";
import { COPY_PARTS, type CopyCollection, type CopyPart, type CopyReview, type CopySource, type CopyVersion } from "@/lib/admin/region-copy";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";

function ConfirmCopyButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="a-btn" disabled={pending}>{pending ? "Copiando…" : "Confirmar cópia no rascunho"}</button>;
}

/** One interaction across all regional editors: choose a source, map real collections, review, then commit to the draft. */
export function RegionCopyForm({ scope, part, rev, sources, collections }: { scope: RegionSlug; part: CopyPart; rev: number | null; sources: CopySource[]; collections: CopyCollection[] }) {
  const uid = useId();
  const [fromScope, setFromScope] = useState(sources[0]?.scope ?? "sul");
  const [version, setVersion] = useState<CopyVersion>("working");
  const [sourceId, setSourceId] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [review, setReview] = useState<CopyReview | null>(null);
  const [pending, startTransition] = useTransition();
  const reviewRef = useRef<HTMLDivElement>(null);
  const source = sources.find((s) => s.scope === fromScope);
  const items = source?.[version] ?? [];
  const item = items.find((x) => x.id === sourceId) ?? items[0];
  const selectedMappings = Object.fromEntries((item?.collections ?? []).flatMap((ref) => {
    const value = mappings[ref.key] ?? ref.suggested;
    return value ? [[ref.key, value]] : [];
  }));
  const canReview = Boolean(item) && (item?.collections ?? []).every((ref) => selectedMappings[ref.key]);
  const reset = () => { setReview(null); setMappings({}); setSourceId(""); };

  useEffect(() => { if (review) reviewRef.current?.focus(); }, [review]);

  return (
    <details className="a-card" data-testid="region-copy">
      <summary className="cursor-pointer p-5 text-[0.9375rem] font-bold focus-visible:outline-2 focus-visible:outline-offset-2">Copiar de outra região</summary>
      <div className="space-y-4 border-t border-black/15 p-5">
        <p className="a-muted max-w-3xl text-[0.9375rem]">{COPY_PARTS[part].description} A cópia só vai para a loja depois de publicar.</p>
        {sources.length === 0 ? <p className="a-muted text-[0.9375rem]">Para copiar, você precisa ter acesso à região de origem e à de destino. Peça ao responsável pelo painel para ajustar suas permissões.</p> : (
          <>
            <form onSubmit={(event) => {
              event.preventDefault();
              const fd = new FormData(event.currentTarget);
              startTransition(async () => {
                try { setReview(await reviewRegionCopyAction(fd)); }
                catch { setReview({ ok: false, errors: ["Não foi possível revisar a cópia. Verifique sua conexão e tente novamente."] }); }
              });
            }}>
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="part" value={part} />
              <input type="hidden" name="rev" value={rev ?? "null"} />
              <input type="hidden" name="mappings" value={JSON.stringify(selectedMappings)} />
              <fieldset disabled={pending} className="min-w-0 space-y-4">
                <legend className="sr-only">Origem da cópia de {COPY_PARTS[part].label}</legend>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="a-label" htmlFor={`${uid}-source`}>Região de origem</label>
                    <select id={`${uid}-source`} name="fromScope" className="a-select" value={fromScope} onChange={(e) => { setFromScope(e.target.value as RegionSlug); reset(); }}>
                      {sources.map((s) => <option key={s.scope} value={s.scope}>{REGIONS[s.scope].name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="a-label" htmlFor={`${uid}-version`}>Versão da origem</label>
                    <select id={`${uid}-version`} name="sourceVersion" className="a-select" value={version} onChange={(e) => { setVersion(e.target.value as CopyVersion); reset(); }}>
                      <option value="working">Configuração atual (inclui rascunho salvo)</option>
                      <option value="published">Publicada (ou padrão inicial)</option>
                    </select>
                  </div>
                </div>
                {(part === "page" || part === "customizer") ? (
                  <div>
                    <label className="a-label" htmlFor={`${uid}-item`}>{part === "page" ? "Página de origem" : "Modelo de origem"}</label>
                    <select id={`${uid}-item`} name="sourceId" className="a-select" value={item?.id ?? ""} onChange={(e) => { setSourceId(e.target.value); setMappings({}); setReview(null); }} disabled={!items.length}>
                      {!items.length && <option value="">Nenhum item disponível nesta versão</option>}
                      {items.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </div>
                ) : <input type="hidden" name="sourceId" value="" />}
                {item ? <p className="text-[0.9375rem]"><strong>{REGIONS[fromScope].name} → {REGIONS[scope].name}:</strong> {item.detail}.</p> : <p className="a-muted text-[0.9375rem]">Não há {COPY_PARTS[part].label.toLocaleLowerCase("pt-BR")} disponível nesta versão da origem. Escolha outra região ou versão.</p>}
                {!!item?.collections.length && (
                  <div className="space-y-3">
                    <p className="text-[0.9375rem] font-bold">Associar às coleções de {REGIONS[scope].name}</p>
                    <p className="a-muted max-w-3xl text-[0.875rem]">Nomes equivalentes vêm sugeridos. Confira cada associação; cada região usa os produtos da própria loja. As coleções internas necessárias serão habilitadas no rascunho.</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {item.collections.map((ref, i) => {
                        const choices = collections.filter((c) => !c.needsResync && (!ref.products || c.matchedCount >= 3) && (!ref.publicOnly || c.isAvailable));
                        return (
                          <div key={ref.key}>
                            <label className="a-label" htmlFor={`${uid}-collection-${i}`}>{ref.label} → {REGIONS[scope].name}</label>
                            <select id={`${uid}-collection-${i}`} className="a-select" required value={mappings[ref.key] ?? ref.suggested} onChange={(e) => { setMappings((before) => ({ ...before, [ref.key]: e.target.value })); setReview(null); }}>
                              <option value="">{choices.length ? "Escolha a coleção equivalente" : "Nenhuma coleção compatível; confira a Biblioteca"}</option>
                              {choices.map((c) => <option key={c.id} value={String(c.id)}>{c.name} · {c.matchedCount} produto(s){c.isAvailable ? "" : " · interna"}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <button type="submit" className="a-btn ghost" disabled={pending || !canReview}>{pending ? "Revisando…" : "Revisar cópia"}</button>
              </fieldset>
            </form>
            {review && (
              <div ref={reviewRef} tabIndex={-1} className="space-y-3 border-t border-black/15 pt-4 focus-visible:outline-2 focus-visible:outline-offset-4" aria-label="Revisão da cópia">
                {!review.ok ? <div role="alert"><p className="font-bold">A cópia ainda não pode ser feita</p><ul className="mt-2 list-disc space-y-1 pl-5 text-[0.9375rem]">{review.errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div> : (
                  <>
                    <h2 className="a-h2">Revisar cópia · {REGIONS[review.request.fromScope].name} para {REGIONS[scope].name}</h2>
                    <ul className="max-h-72 list-disc space-y-1 overflow-y-auto pl-5 text-[0.9375rem]">{review.summary.map((line, i) => <li key={i}>{line}</li>)}</ul>
                    {!!review.warnings.length && <div><p className="text-[0.9375rem] font-bold">Ajustes para revisar</p><ul className="mt-2 list-disc space-y-1 pl-5 text-[0.875rem]">{review.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
                    <p className="max-w-3xl text-[0.9375rem]">Ao confirmar, as alterações acima serão salvas apenas no rascunho de <strong>{REGIONS[scope].name}</strong>. A origem será preservada.</p>
                    <form action={copyRegionConfigurationAction}>
                      {Object.entries({ scope, fromScope: review.request.fromScope, part, sourceVersion: review.request.sourceVersion, sourceId: review.request.sourceId, rev: String(review.request.rev ?? "null"), mappings: JSON.stringify(review.request.mappings), checksum: review.checksum }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
                      <ConfirmCopyButton />
                    </form>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
