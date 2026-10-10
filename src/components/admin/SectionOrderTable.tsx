"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import { DragSortStatus, GripIcon, useDragSort } from "./useDragSort";

export type SectionOrderRow = {
  id: string;
  /** How the section is named in the handle's label and in what screen readers hear. */
  label: string;
  /** False for the fixed rows (hero, footer): no grip, and nothing passes them. */
  movable: boolean;
  dimmed: boolean;
  /** The row's other cells (Seção, Fonte, Estado, Ações), drawn on the server. */
  cells: ReactNode;
};

/**
 * The sections of the home or of a page, in order, rearranged by dragging a row by its grip. The new order is saved in one go when the row
 * is let go (`reorderSections`, with the same draft revision check as every other row action); until the server answers, the list already
 * shows it, and if the save is refused the saved order comes back with the reason on top of the page.
 */
export function SectionOrderTable({ rows, caption, action, rev, scope, page }: { rows: SectionOrderRow[]; caption: string; action: (fd: FormData) => Promise<void>; rev: number | null; scope: string; page?: string }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useOptimistic(rows.map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const movable = rows.flatMap((r, i) => (r.movable ? [i] : []));
  const sort = useDragSort({
    ids: saved,
    label: (id) => `“${byId.get(id)?.label ?? id}”`,
    min: movable[0] ?? 0,
    max: movable.at(-1) ?? 0,
    disabled: pending,
    onDrop: (ids) =>
      startTransition(async () => {
        setSaved(ids);
        const fd = new FormData();
        fd.set("rev", rev === null ? "null" : String(rev));
        fd.set("scope", scope);
        if (page) fd.set("page", page);
        fd.set("order", JSON.stringify(ids));
        await action(fd);
      }),
  });

  return (
    <>
      <table className="a-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr><th scope="col">#</th><th scope="col">Seção</th><th scope="col">Fonte dos produtos</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ações</span></th></tr>
        </thead>
        <tbody>
          {sort.order.map((id, i) => {
            const r = byId.get(id)!;
            return (
              <tr key={id} {...sort.row(id)} className={r.dimmed ? "opacity-60" : ""}>
                <td className="a-muted w-8 !py-0 !pl-1 font-bold">
                  <span className="flex items-center gap-1">
                    {r.movable ? (
                      <button {...sort.handle(id)} className="a-grip" aria-label={`Mover “${r.label}”`} title="Arraste para mudar a posição">
                        <GripIcon />
                      </button>
                    ) : (
                      <span className="a-grip pointer-events-none" aria-hidden="true" />
                    )}
                    {i + 1}
                  </span>
                </td>
                {r.cells}
              </tr>
            );
          })}
        </tbody>
      </table>
      <DragSortStatus hintId={sort.hintId} announcement={sort.announcement} />
      {pending && <p className="a-muted border-t border-black/10 px-3 py-2 text-[0.8125rem] font-bold">Salvando a nova ordem…</p>}
    </>
  );
}
