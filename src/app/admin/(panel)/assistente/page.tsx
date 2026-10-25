import Link from "next/link";
import { importInkFaqAction, previewAssistantAction, saveAssistantAction } from "@/app/admin/actions";
import { AssistantEditor } from "@/components/admin/AssistantEditor";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace } from "@/lib/admin/workspace";
import { assistantEnabled } from "@/lib/assistant/flag";
import { readPublished } from "@/lib/site-config/published";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; pergunta?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const state = readPublished();
  const published = state.source === "published" ? state.bundle.docs[scope]?.assistant : undefined;
  const ceiling = assistantEnabled();
  const liveAnswers = published?.answers.filter((a) => a.enabled).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Assistente <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">
          O botão “Ajuda” no canto da loja e das páginas da INK desta região: acha estampas, responde dúvidas com as palavras da loja, leva aos pedidos e
          passa para o WhatsApp o que não souber. Não usa IA. Salvar guarda um <strong>rascunho</strong>: a loja e a INK só mudam depois de publicar em <em>Publicar</em>.
        </p>
        <p className="mt-2 text-[0.9375rem]" data-testid="assistant-published-now">
          <strong>Publicado agora:</strong>{" "}
          {!ceiling ? "desligado no servidor (ASSISTANT=off), nada aparece." : published?.enabled ? `ligado, com ${liveAnswers} ${liveAnswers === 1 ? "resposta" : "respostas"}.` : "desligado (a INK mostra o “Ajuda?” e o WhatsApp dela)."}
        </p>
        <p className="mt-2 text-[0.9375rem]">
          <Link className="a-link" href="/admin/assistente/perguntas">Ver o que as pessoas perguntam</Link> e o que ficou sem resposta.
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <AssistantEditor region={scope} config={ws.doc.assistant} readOnly={!canEdit(actor, scope)} rev={String(ws.record?.rev ?? "null")} action={saveAssistantAction} importAction={importInkFaqAction} previewAction={previewAssistantAction} prefill={sp.pergunta} />
    </div>
  );
}
