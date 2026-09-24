import { redirect } from "next/navigation";
import { currentActor, requireAdminSurface } from "@/lib/admin/auth/guard";
import { safeNext } from "@/lib/admin/auth/oidc";

const MESSAGES: Record<string, string> = {
  sessao: "A tentativa de entrada expirou ou não pôde ser confirmada. Tente de novo.",
  negado: "O Google não confirmou a entrada. Tente de novo.",
  acesso: "Este e-mail não tem acesso ao painel. Peça a quem administra para cadastrá-lo.",
  limite: "Muitas tentativas seguidas. Aguarde alguns minutos.",
  indisponivel: "O painel está temporariamente indisponível. Tente novamente em instantes.",
};

/** The only page an anonymous visitor of the admin host can see. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; next?: string }> }) {
  const config = await requireAdminSurface();
  if (config.mode === "dev" || (await currentActor(config))) redirect("/admin");
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="a-label">Use Origens</p>
        <h1 className="a-h1">Painel</h1>
        <p className="a-muted mt-2">Acesso restrito à equipe. Entre com a conta Google cadastrada.</p>
      </div>
      {sp.erro && MESSAGES[sp.erro] && <p className="a-flash err" role="alert">{MESSAGES[sp.erro]}</p>}
      <a className="a-btn" href={`/admin/auth/start?next=${encodeURIComponent(next)}`}>Entrar com Google</a>
    </main>
  );
}
