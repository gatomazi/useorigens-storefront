"use client";

import { Fragment, useMemo, useState } from "react";
import { arrangeMembers } from "@/lib/site-config/sources";
import { DragSortStatus, GripIcon, useDragSort } from "./useDragSort";

/** One product of the collection as the panel lists it (from the catalog snapshot: never typed in). */
export type OrderMember = { id: string; name: string; context?: string; price: string | null; imageUrl: string };

function Thumb({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- an admin thumbnail of a catalog photo (already public on the store)
  return <img src={src} alt="" className="h-14 w-11 shrink-0 bg-neutral-300 object-cover" loading="lazy" />;
}

const label = (m: OrderMember) => (m.context ? `${m.name} · ${m.context}` : m.name);

/**
 * The order of an ink-category section, on our side: dragging a row by its grip (or "Topo") sets the owner's order, "Esconder" takes a
 * product out of this section, and "Voltar à ordem da INK" undoes both. What is posted (`source_arrangement`) is read by `parseSectionForm` for THIS collection only
 * (`source_arrangement_for`). A product INK adds later is not in the saved order, so it shows at the end, flagged "novo" — the same rule the
 * storefront applies (`arrangeMembers`).
 */
export function CollectionOrder({
  collectionRef,
  members,
  initial,
  visible,
}: {
  /** "store:collectionId" the list was drawn for. */
  collectionRef: string;
  /** The collection's products, in INK's order. */
  members: OrderMember[];
  initial: { order: "category" | "manual"; productIds?: string[]; hiddenIds?: string[] };
  /** How many product cards the section shows (the limit, minus the customizer card when there is one). */
  visible: number;
}) {
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const savedOrder = initial.order === "manual" ? (initial.productIds ?? []) : null;
  // `null` = INK's order. Hidden products keep their place in a manual order, so "Mostrar" brings one back where it was.
  const [order, setOrder] = useState<string[] | null>(savedOrder);
  const [hidden, setHidden] = useState<string[]>(() => (initial.hiddenIds ?? []).filter((id) => byId.has(id)));

  const arranged = arrangeMembers(memberIds, { productIds: order ?? undefined, hiddenIds: hidden });
  const saved = new Set([...(savedOrder ?? []), ...(initial.hiddenIds ?? [])]);
  const isNew = (id: string) => savedOrder !== null && !saved.has(id);
  const stale = [...new Set([...(initial.productIds ?? []), ...(initial.hiddenIds ?? [])])].filter((id) => !byId.has(id)).length;

  const sort = useDragSort({ ids: arranged, onDrop: setOrder, label: (id) => label(byId.get(id)!) });
  // While a row is being dragged, the list shows where it would land (the cut and the numbers follow it).
  const rows = sort.order;
  const toTop = (id: string) => setOrder([id, ...arranged.filter((x) => x !== id)]);
  const hide = (id: string) => setHidden((h) => [...h, id]);
  const show = (id: string) => setHidden((h) => h.filter((x) => x !== id));
  const reset = () => {
    setOrder(null);
    setHidden([]);
  };

  const manual = order !== null;
  const value = JSON.stringify(manual ? { order: "manual", productIds: arranged, hiddenIds: hidden } : { order: "category", hiddenIds: hidden });

  return (
    <div className="space-y-3" data-testid="collection-order">
      <input type="hidden" name="source_arrangement" value={value} />
      <input type="hidden" name="source_arrangement_for" value={collectionRef} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="a-label !mb-0">Ordem dos produtos</p>
        <span className={`a-badge${manual ? " ok" : ""}`} data-testid="collection-order-mode">{manual ? "Ordem manual" : "Ordem da INK"}</span>
      </div>
      <p className="a-muted text-[0.8125rem]">
        Arraste o produto pela alça <span className="inline-flex translate-y-0.5 text-ink"><GripIcon /></span> para mudar a posição, ou use “Topo” para levá-lo direto ao primeiro lugar. “Esconder” tira um produto só desta seção (na INK nada muda). Produto novo que a INK colocar na coleção entra no fim da lista. Salve o rascunho para ver na prévia.
      </p>
      <DragSortStatus hintId={sort.hintId} announcement={sort.announcement} />
      {stale > 0 && <p className="a-flash err text-[0.875rem]">{stale} produto(s) da ordem salva não estão mais entre os produtos da coleção e saem da lista ao salvar.</p>}
      {rows.length === 0 && <p className="a-flash err text-[0.875rem]">Todos os produtos estão escondidos: a seção não aparece na loja.</p>}
      <ol className="max-h-[36rem] overflow-y-auto border border-black/20 bg-white" aria-label="Produtos da seção, na ordem da loja">
        {rows.map((id, i) => {
          const m = byId.get(id)!;
          return (
            <Fragment key={id}>
              {i === visible && (
                <li className="border-y-2 border-dashed border-black/40 bg-neutral-100 px-3 py-1.5 text-[0.75rem] font-bold" data-testid="collection-order-cut">
                  A loja mostra só os {visible} primeiros. Os abaixo ficam de reserva.
                </li>
              )}
              <li {...sort.row(id)} className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/10 bg-white py-2 pl-1 pr-3 ${i >= visible && sort.active !== id ? "opacity-60" : ""}`} data-testid="collection-order-row">
                <button {...sort.handle(id)} className="a-grip -mr-2" aria-label={`Mover ${label(m)}`} title="Arraste para mudar a posição">
                  <GripIcon />
                </button>
                <span className="w-6 shrink-0 text-right text-[0.8125rem] font-extrabold">{i + 1}</span>
                <Thumb src={m.imageUrl} />
                <div className="min-w-0 flex-1 basis-32 text-[0.8125rem]">
                  <p className="font-bold">
                    {label(m)} {isNew(id) && <span className="a-badge warn">novo</span>}
                  </p>
                  <p className="a-muted">{m.price ?? "Sem preço"} · #{id}</p>
                </div>
                {/* Beside the product on a wide panel, on a line of their own below it on a phone. */}
                <div className="ml-auto flex shrink-0 gap-1">
                  <button type="button" className="a-btn ghost sm" onClick={() => toTop(id)} disabled={i === 0} aria-label={`Levar ${label(m)} para o topo`}>Topo</button>
                  <button type="button" className="a-btn danger sm" onClick={() => hide(id)} aria-label={`Esconder ${label(m)} desta seção`}>Esconder</button>
                </div>
              </li>
            </Fragment>
          );
        })}
      </ol>
      {hidden.length > 0 && (
        <div>
          <p className="a-label">Escondidos nesta seção ({hidden.length})</p>
          <ul className="space-y-1" aria-label="Produtos escondidos">
            {hidden.map((id) => {
              const m = byId.get(id)!;
              return (
                <li key={id} className="flex items-center gap-3 text-[0.8125rem]">
                  <Thumb src={m.imageUrl} />
                  <span className="min-w-0 flex-1 font-bold">{label(m)}</span>
                  <button type="button" className="a-btn ghost sm" onClick={() => show(id)} aria-label={`Mostrar ${label(m)} de novo`}>Mostrar</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <button type="button" className="a-btn ghost sm" onClick={reset} disabled={!manual && hidden.length === 0}>Voltar à ordem da INK</button>
    </div>
  );
}
