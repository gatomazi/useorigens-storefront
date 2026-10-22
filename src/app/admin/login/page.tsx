import { redirect } from "next/navigation";
import { currentActor, requireAdminSurface } from "@/lib/admin/auth/guard";
import { safeNext } from "@/lib/admin/auth/oidc";

const MESSAGES: Record<string, string> = {
  sessao: "A tentativa de entrada expirou ou não pôde ser confirmada. Tente de novo.",
  negado: "O Railway não confirmou a entrada. Tente de novo ou entre com e-mail e senha abaixo.",
  acesso: "Este e-mail não tem acesso ao painel. Peça a quem administra para cadastrá-lo.",
  senha: "E-mail ou senha incorretos. Se você nunca definiu uma senha no painel, ainda não consegue entrar por aqui.",
  limite: "Muitas tentativas seguidas. Aguarde alguns minutos.",
  indisponivel: "O painel está temporariamente indisponível. Tente novamente em instantes.",
};

/** The only page an anonymous visitor of the admin host can see. Railway first; e-mail + password as the fallback when Railway fails. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; next?: string; ref?: string; modo?: string }> }) {
  const config = await requireAdminSurface();
  if (config.mode === "dev" || (await currentActor(config))) redirect("/admin");
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const passwordOpen = sp.modo === "senha" || sp.erro === "negado";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="a-label">Use Origens</p>
        <h1 className="a-h1">Painel</h1>
        <p className="a-muted mt-2">Acesso restrito à equipe. Entre com a conta Railway cadastrada.</p>
      </div>
      {sp.erro && MESSAGES[sp.erro] && <p className="a-flash err" role="alert">{MESSAGES[sp.erro]}</p>}
      {sp.erro === "acesso" && sp.ref && /^[\w.:@|-]{1,120}$/.test(sp.ref) && (
        <p className="a-muted text-[0.875rem]">Identificador da sua conta Railway (para quem administra o painel): <code className="break-all">{sp.ref}</code></p>
      )}
      <a className="a-btn" href={`/admin/auth/start?next=${encodeURIComponent(next)}`}>Entrar com Railway</a>
      <details className="a-card p-5" open={passwordOpen}>
        <summary className="cursor-pointer font-bold">O Railway não está funcionando? Entrar com e-mail e senha</summary>
        <form method="post" action="/admin/auth/password" className="mt-4 grid gap-4">
          <input type="hidden" name="next" value={next} />
          <div><label className="a-label" htmlFor="login-email">E-mail</label><input id="login-email" name="email" type="email" required autoComplete="username" className="a-input" /></div>
          <div><label className="a-label" htmlFor="login-password">Senha</label><input id="login-password" name="password" type="password" required autoComplete="current-password" className="a-input" /></div>
          <button type="submit" className="a-btn ghost">Entrar com senha</button>
          <p className="a-muted text-[0.8125rem]">A senha é definida por você dentro do painel, em <strong>Senha de reserva</strong>, depois de entrar com o Railway pelo menos uma vez.</p>
        </form>
      </details>
    </main>
  );
}
