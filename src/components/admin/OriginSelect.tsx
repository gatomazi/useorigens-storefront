import { ARTICLE_KIND_LABELS, ARTICLE_KINDS } from "@/lib/umapenca/types";

/** Where a personalization model's product is sold. Values are parsed by `parseOrigin` (src/lib/admin/customizer-form.ts). */
export function OriginSelect({ id, name, defaultValue = "ink" }: { id: string; name: string; defaultValue?: string }) {
  return (
    <div>
      <label className="a-label" htmlFor={id}>Origem</label>
      <select id={id} name={name} className="a-select" defaultValue={defaultValue}>
        <option value="ink">Camiseta · INK</option>
        {ARTICLE_KINDS.map((kind) => (
          <option key={kind} value={`umapenca:${kind}`}>{ARTICLE_KIND_LABELS[kind].singular} · Uma Penca</option>
        ))}
      </select>
    </div>
  );
}
