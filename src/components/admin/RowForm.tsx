/** A one-button form that carries the region, the draft revision, the section id and (inside a page) the page id: the same forms serve the home and the pages. */
export function RowForm({ action, rev, scope, id, page, extra, children, danger = false, label }: { action: (fd: FormData) => Promise<void>; rev: number | null; scope: string; id: string; page?: string; extra?: Record<string, string>; children: React.ReactNode; danger?: boolean; label: string }) {
  return (
    <form action={action}>
      <input type="hidden" name="rev" value={rev ?? "null"} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="id" value={id} />
      {page && <input type="hidden" name="page" value={page} />}
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" aria-label={label} title={label} className={`a-btn sm ${danger ? "danger" : "ghost"}`}>{children}</button>
    </form>
  );
}
