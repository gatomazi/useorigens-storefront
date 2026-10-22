import { setOwnPasswordAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { PASSWORD_MIN } from "@/lib/admin/auth/password";
import { platform } from "@/lib/admin/platform";

/** Everyone signed in: their own fallback password, used on the login page when Login with Railway fails. */
export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const { users } = platform();
  const sp = await searchParams;
  if (!users) {
    return (
      <div className="space-y-4">
        <h1 className="a-h1">Senha de reserva</h1>
        <p className="a-muted max-w-2xl">No ambiente de desenvolvimento não há login. A senha de reserva existe só no painel em produção.</p>
      </div>
    );
  }
  const [hasPassword, available] = await Promise.all([users.getPasswordHash(actor.id).then(Boolean), users.withPassword().then((ids) => ids !== null)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Senha de reserva</h1>
        <p className="a-muted mt-2 max-w-2xl">
          O jeito normal de entrar continua sendo o Railway. Esta senha serve para quando o Railway falhar: na tela de entrada, abra
          &ldquo;Entrar com e-mail e senha&rdquo; e use <strong>{actor.email}</strong> com a senha definida aqui. Guarde-a num gerenciador de senhas.
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {!available && <p className="a-flash err">A senha de reserva ainda não está disponível: falta aplicar a migração 0008 no banco.</p>}
      <p>
        Situação: {hasPassword ? <span className="a-badge ok">Senha definida</span> : <span className="a-badge">Sem senha: só entra com o Railway</span>}
      </p>

      <form action={setOwnPasswordAction} className="a-card grid max-w-xl gap-4 p-5">
        <p className="a-h2">{hasPassword ? "Trocar a senha" : "Definir uma senha"}</p>
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" name="username" value={actor.email} autoComplete="username" readOnly hidden />
        {hasPassword && (
          <div><label className="a-label" htmlFor="current">Senha atual</label><input id="current" name="current" type="password" required autoComplete="current-password" className="a-input" /></div>
        )}
        <div><label className="a-label" htmlFor="password">Nova senha</label><input id="password" name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" aria-describedby="password-help" /></div>
        <p id="password-help" className="a-muted -mt-2 text-[0.8125rem]">Pelo menos {PASSWORD_MIN} caracteres. Ao salvar, suas outras sessões abertas são encerradas.</p>
        <div><label className="a-label" htmlFor="confirm">Repita a nova senha</label><input id="confirm" name="confirm" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" /></div>
        <div><button type="submit" className="a-btn" disabled={!available}>Salvar senha</button></div>
      </form>

      {hasPassword && (
        <form action={setOwnPasswordAction} className="a-card grid max-w-xl gap-4 p-5">
          <p className="a-h2">Remover a senha</p>
          <p className="a-muted text-[0.875rem]">Sem senha, você só consegue entrar com o Railway.</p>
          <input type="hidden" name="intent" value="clear" />
          <div><label className="a-label" htmlFor="current-clear">Senha atual</label><input id="current-clear" name="current" type="password" required autoComplete="current-password" className="a-input" /></div>
          <div><button type="submit" className="a-btn sm danger">Remover senha</button></div>
        </form>
      )}
    </div>
  );
}
