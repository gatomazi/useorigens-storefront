import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentActor, requireAdminSurface } from "@/lib/admin/auth/guard";
import { authorizeParams } from "@/lib/mcp/auth/authorize-params";
import { checkAuthorizeRequest, isLoopbackRedirect, OFFLINE_SCOPE } from "@/lib/mcp/auth/oauth";
import { mcpResourceFromHeaders, oauthStore } from "@/lib/mcp/auth/resource";

/**
 * OAuth consent for the MCP connector (docs/mcp/README.md). Lives under /admin because the admin session cookie is scoped to /admin: the
 * owner signs in with the same Login with Railway as the panel, then approves or denies here. The request is validated BEFORE anything
 * is shown; an untrusted client or redirect URI gets an error page and is never redirected to. Approval is a same-origin POST
 * (`decision/route.ts`), which validates the whole request again.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const config = await requireAdminSurface();
  const where = mcpResourceFromHeaders(await headers());
  if (!where) notFound();
  const params = authorizeParams(await searchParams);
  const check = await checkAuthorizeRequest(oauthStore(), params, where);
  if (!check.ok && check.kind === "page") return <Problem message={check.message} />;
  if (!check.ok) redirect(check.url);

  const actor = await currentActor(config);
  if (!actor) redirect(`/admin/login?next=${encodeURIComponent(`/admin/oauth/authorize?${params.toString()}`)}`);
  if (actor.role !== "owner") return <Problem message="Só o dono da loja pode conectar o Claude aos dados das lojas." />;

  const { client, redirectUri, scope } = check.request;
  const target = new URL(redirectUri);
  const loopback = isLoopbackRedirect(redirectUri);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="a-label">Use Origens</p>
        <h1 className="a-h1">Conectar ao Claude</h1>
        <p className="a-muted mt-2">
          <strong>{client.clientName ?? "Um aplicativo"}</strong> pede acesso aos dados das lojas Use Origens em seu nome ({actor.email}).
        </p>
      </div>
      <div className="a-card">
        <p className="a-label">Depois de aprovar, você volta para</p>
        <p className="mt-1 break-all text-[1.25rem] font-semibold">{target.host}</p>
        {loopback && (
          <p className="a-flash err mt-3" role="alert">
            Este endereço é um programa no seu próprio computador (por exemplo, o Claude Code). Só aprove se você acabou de pedir a conexão nele.
          </p>
        )}
      </div>
      <div>
        <p className="a-label">O que fica liberado</p>
        <ul className="a-muted mt-2 list-disc space-y-1 pl-5">
          <li>Consultar produtos, vendas e pedidos das lojas, somente leitura. Nada é alterado na INK.</li>
          <li>Dados de comprador (nome, e-mail, telefone, documento, endereço completo) nunca são enviados ao Claude.</li>
          {scope.includes(OFFLINE_SCOPE) && <li>Manter a conexão ativa: o acesso se renova sozinho e cai depois de 30 dias sem uso.</li>}
        </ul>
      </div>
      <form method="post" action="/admin/oauth/authorize/decision" className="flex gap-3">
        {[...params.entries()].map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button className="a-btn" type="submit" name="decision" value="approve">
          Aprovar
        </button>
        <button className="a-btn ghost" type="submit" name="decision" value="deny">
          Negar
        </button>
      </form>
      <p className="a-muted text-[0.875rem]">Você pode desconectar a qualquer momento nas configurações de conectores do Claude.</p>
    </main>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="a-label">Use Origens</p>
        <h1 className="a-h1">Não foi possível conectar</h1>
      </div>
      <p className="a-flash err" role="alert">
        {message}
      </p>
    </main>
  );
}
