import Link from "next/link";
import { globalParts } from "@/lib/admin/pending";
import type { Workspace } from "@/lib/admin/workspace";

/**
 * On Aparência and Tracking: the global document (Use Origens palette, cards' button, Meu Pequeno Mundo, global tracking) is ONE document, published
 * in one place, Publicar → Configuração global. This says whether it has unpublished changes and what they are, and leads there.
 */
export function GlobalPendingNote({ global, owner }: { global: Workspace; owner: boolean }) {
  if (!global.dirty) return null;
  const parts = globalParts(global.baseDoc, global.doc);
  return (
    <div className="a-flash flex flex-wrap items-center justify-between gap-3" data-testid="global-pending">
      <p className="max-w-3xl">
        <strong>A configuração global tem alterações não publicadas</strong>{parts.length ? `: ${parts.join(", ")}` : ""}. Ela reúne as configurações compartilhadas e as cores das páginas sem região, e é publicada inteira, em Publicar{owner ? "" : " (só o owner publica)"}.
      </p>
      <Link href="/admin/publicar#global" className="a-btn sm">{owner ? "Revisar e publicar" : "Ver em Publicar"}</Link>
    </div>
  );
}
