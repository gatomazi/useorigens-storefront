import { discardGlobalTrackingAction, publishGlobalTrackingAction, saveTrackingAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { effectiveTable, pendingTrackingChanges, seedForEnv } from "@/lib/admin/publishing";
import { publishDeps } from "@/lib/admin/ops";
import { REGION_SCOPES, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace, type Workspace } from "@/lib/admin/workspace";
import type { TrackingOrigin } from "@/lib/site-config/resolve";
import type { PublishedBundle, Scope, VendorSetting } from "@/lib/site-config/schema";

type Tool = "meta" | "ga4";
const TOOLS: { key: Tool; label: string; hint: string; placeholder: string }[] = [
  { key: "meta", label: "Meta Pixel", hint: "Só números (ex.: 123456789012345).", placeholder: "123456789012345" },
  { key: "ga4", label: "Google Analytics 4", hint: "Formato G-XXXXXXXXXX.", placeholder: "G-XXXXXXXXXX" },
];
const ORIGIN: Record<TrackingOrigin, string> = { own: "ID próprio", global: "herdado do global", legacy: "legado (variável do build)", disabled: "desligado", "inherit-inactive": "herda um global inativo", unconfigured: "sem configuração" };

const modeOf = (v: VendorSetting | undefined, scope: Scope): VendorSetting["mode"] => v?.mode ?? (scope === "sul" ? "legacy" : "disabled");
const idOf = (v: VendorSetting | undefined): string => (v && "id" in v && v.id ? v.id : "");

function VendorFields({ scope, tool, setting, readOnly }: { scope: Scope; tool: (typeof TOOLS)[number]; setting: VendorSetting | undefined; readOnly: boolean }) {
  const mode = modeOf(setting, scope);
  const isGlobal = scope === "global";
  const options: { value: VendorSetting["mode"]; label: string }[] = isGlobal
    ? [
        { value: "override", label: "Ativo com este ID" },
        { value: "disabled", label: "Inativo (as regiões que herdam ficam sem ID)" },
      ]
    : [
        { value: "inherit", label: "Herdar o global" },
        { value: "override", label: "Usar ID próprio" },
        { value: "disabled", label: "Desligado" },
        ...(scope === "sul" ? [{ value: "legacy" as const, label: "Legado: ID atual do build (até publicar outra escolha)" }] : []),
      ];
  return (
    <fieldset className="space-y-2" disabled={readOnly}>
      <legend className="a-label">{tool.label}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2 text-[0.9375rem]">
          <input type="radio" name={`${tool.key}_mode`} value={o.value} defaultChecked={mode === o.value} className="mt-1" /> <span>{o.label}</span>
        </label>
      ))}
      <div>
        <label className="a-label" htmlFor={`${scope}-${tool.key}-id`}>{isGlobal ? "ID" : "ID próprio"}</label>
        <input id={`${scope}-${tool.key}-id`} name={`${tool.key}_id`} className="a-input" defaultValue={idOf(setting)} placeholder={tool.placeholder} autoComplete="off" spellCheck={false} maxLength={40} />
        <p className="a-muted mt-1 text-[0.8125rem]">{tool.hint} {isGlobal ? "Em “Inativo” o ID fica guardado para ativar depois." : "Só vale com “Usar ID próprio”."}</p>
      </div>
    </fieldset>
  );
}

function TrackingCard({ scope, ws, readOnly, note }: { scope: Scope; ws: Workspace; readOnly: boolean; note?: string }) {
  const tracking = ws.doc.tracking;
  return (
    <section className="a-card p-5" aria-labelledby={`t-${scope}`}>
      <h2 id={`t-${scope}`} className="a-h2">{scope === "global" ? "Global" : scopeName(scope)}{ws.dirty && <span className="a-badge warn ml-2">Rascunho não publicado</span>}</h2>
      {note && <p className="a-muted mt-1 text-[0.875rem]">{note}</p>}
      <form action={saveTrackingAction} className="mt-4 space-y-5">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
        <div className="grid gap-6 sm:grid-cols-2">
          {TOOLS.map((tool) => <VendorFields key={tool.key} scope={scope} tool={tool} setting={tracking[tool.key]} readOnly={readOnly} />)}
        </div>
        {readOnly ? <p className="a-muted text-[0.875rem]">Somente leitura para o seu perfil.</p> : <button type="submit" className="a-btn">Salvar rascunho de {scope === "global" ? "global" : scopeName(scope)}</button>}
      </form>
    </section>
  );
}

export default async function TrackingPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const sp = await searchParams;
  const owner = actor.role === "owner";
  const published = await platform().files.read();
  const base: PublishedBundle = published ?? seedForEnv();
  const scopes: Scope[] = ["global", ...REGION_SCOPES];
  const workspaces = Object.fromEntries(await Promise.all(scopes.map(async (s) => [s, await loadWorkspace(s)] as const))) as Record<Scope, Workspace>;
  // "If everything drafted were published now": the published bundle with each scope's working document laid over it.
  const withDrafts: PublishedBundle = { ...base, docs: { ...base.docs, ...Object.fromEntries(scopes.map((s) => [s, workspaces[s].doc])) } };
  const live = effectiveTable(published);
  const next = effectiveTable(withDrafts);
  const globalDoc = workspaces.global;
  const globalPending = await pendingTrackingChanges(publishDeps(), globalDoc.doc);
  const inheritors = REGION_SCOPES.filter((r) => (["meta", "ga4"] as const).some((t) => modeOf(base.docs[r]?.tracking[t], r) === "inherit"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Tracking</h1>
        <p className="a-muted mt-2 max-w-3xl">Meta Pixel e GA4 são independentes. Cada região herda o global, usa um ID próprio ou desliga a ferramenta. Salvar guarda só um <strong>rascunho</strong>: nada muda na loja até você publicar e confirmar os IDs efetivos. O painel nunca dispara pixel algum.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section className="a-card overflow-x-auto" aria-label="IDs efetivos">
        <table className="a-table a-stack">
          <caption className="a-h2 p-4 text-left">IDs efetivos por região</caption>
          <thead><tr><th scope="col">Região</th><th scope="col">Ferramenta</th><th scope="col">No ar agora</th><th scope="col">Se publicar o rascunho</th></tr></thead>
          <tbody>
            {live.map((row, i) => {
              const after = next[i];
              const changes = after.id !== row.id;
              return (
                <tr key={`${row.scope}-${row.tool}`} data-testid={`eff-${row.scope}-${row.tool}`}>
                  <td data-label="Região" className="font-bold">{scopeName(row.scope)}</td>
                  <td data-label="Ferramenta">{row.tool === "meta" ? "Meta Pixel" : "GA4"}</td>
                  <td data-label="No ar agora">{row.id ? <code>{row.id}</code> : <span className="a-muted">nenhum</span>} <span className="a-muted text-[0.8125rem]">· {ORIGIN[row.origin]}</span></td>
                  <td data-label="Se publicar o rascunho">{after.id ? <code>{after.id}</code> : <span className="a-muted">nenhum</span>} <span className="a-muted text-[0.8125rem]">· {ORIGIN[after.origin]}</span>{changes && <span className="a-badge warn ml-2">muda</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="a-muted p-4 text-[0.8125rem]">“Legado” = os IDs de sempre do Sul, lidos da configuração do build até você publicar uma escolha explícita. Norte e Centro-Oeste nunca herdam os IDs do Sul: começam sem rastreamento.</p>
      </section>

      <TrackingCard scope="global" ws={globalDoc} readOnly={!owner} note="Um ID opcional que qualquer região pode herdar. Só o owner altera. Trocar o ID aqui muda, ao publicar, todas as regiões que herdam." />
      {owner && (
        <section className="a-card p-5" aria-label="Publicar o tracking global">
          {inheritors.length > 0 && <p className="a-flash err mb-3">Hoje herdam o global: <strong>{inheritors.map((r) => scopeName(r)).join(", ")}</strong>. Publicar um novo ID global muda o rastreamento dessas regiões.</p>}
          <form action={publishGlobalTrackingAction} className="space-y-3">
            {globalPending.length > 0 && (
              <div className="a-flash err" role="group" aria-label="Confirmação do rastreamento">
                <p className="font-extrabold">Isto muda o rastreamento efetivo:</p>
                <ul className="mt-1 list-disc pl-5">{globalPending.map((l) => <li key={l}>{l}</li>)}</ul>
                <label className="mt-3 flex items-start gap-2"><input type="checkbox" name="confirmTracking" className="mt-1" /> <span>Revisei os IDs efetivos acima e confirmo que eles podem ir para a loja.</span></label>
              </div>
            )}
            <button type="submit" className="a-btn" disabled={!globalDoc.dirty}>Publicar tracking global</button>
            {!globalDoc.dirty && <span className="a-muted ml-3 text-[0.875rem]">Nada a publicar: o rascunho é igual ao publicado.</span>}
          </form>
          <form action={discardGlobalTrackingAction} className="mt-3"><button type="submit" className="a-btn ghost sm" disabled={!globalDoc.record}>Descartar rascunho do global</button></form>
        </section>
      )}

      {REGION_SCOPES.map((r) => (
        <TrackingCard key={r} scope={r} ws={workspaces[r]} readOnly={!canEdit(actor, r)} note={r === "sul" ? "Hoje o Sul usa os IDs legados do build. Escolher outra opção e publicar substitui isso; “Legado” volta a eles." : "Começa sem rastreamento. Escolha herdar o global ou informar um ID próprio; a publicação fica na tela Publicar desta região."} />
      ))}
    </div>
  );
}
