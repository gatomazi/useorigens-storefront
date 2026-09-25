import Link from "next/link";
import type { StructuredModel } from "@/lib/site-config/structured";
import type { StructuredStatus } from "@/lib/admin/structured-status";

/** A schematic (not the real component) so the editor recognises the model at a glance; the real preview is the draft below. */
function Wireframe({ template }: { template: StructuredModel["template"] }) {
  const box = "bg-black/15";
  if (template === "city-styles") {
    return (
      <div aria-hidden className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 8 }, (_, i) => <span key={i} className={`${box} block aspect-[4/5]`} />)}
      </div>
    );
  }
  if (template === "states") {
    return (
      <div aria-hidden className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => <span key={i} className="block border-t-[3px] border-black/30 pt-2"><span className={`${box} block h-2 w-3/4`} /><span className={`${box} mt-1 block h-2 w-1/2`} /></span>)}
      </div>
    );
  }
  return (
    <div aria-hidden className="bg-[#0a0c0a] p-3">
      <span className="block h-2.5 w-3/4 bg-white/70" />
      <span className="mt-1.5 block h-2 w-1/2 bg-white/40" />
      <span className="mt-3 block h-5 w-20 bg-white/80" />
    </div>
  );
}

export function StructuredModelCard({
  model, status, existing, addForm,
}: {
  model: StructuredModel;
  status: StructuredStatus;
  /** The section of this model the region already has (single-instance models can only be edited). */
  existing: { id: string; title?: string } | null;
  /** The add button (a server-action form) — rendered by the page so the action stays a server import. */
  addForm: React.ReactNode | null;
}) {
  return (
    <li className="flex flex-col gap-3 border border-black/20 bg-white p-4">
      <Wireframe template={model.template} />
      <div>
        <h3 className="font-extrabold">{model.name}</h3>
        <p className="a-muted mt-1 text-[0.875rem]">{model.purpose}</p>
      </div>
      <p className="text-[0.8125rem]">{status.ok ? <span className="a-badge ok">{status.summary}</span> : <span className="a-badge bad">{status.summary}</span>}</p>
      {status.notes.map((n) => <p key={n} className="a-muted text-[0.8125rem]">{n}</p>)}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {existing && <Link href={`/admin/home/${existing.id}`} className="a-btn sm">Ir para a seção{existing.title ? `: ${existing.title.replace(/\n/g, " ").slice(0, 28)}` : ""}</Link>}
        {addForm}
      </div>
    </li>
  );
}
