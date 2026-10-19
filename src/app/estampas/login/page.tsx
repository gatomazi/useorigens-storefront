import { notFound, redirect } from "next/navigation";
import { studioSignedIn, studioSurface } from "@/lib/print-studio/auth";
import styles from "../studio.module.css";

const messages: Record<string, string> = { credenciais: "Usuário ou senha incorretos. Confira os dados e tente novamente.", limite: "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente." };
export default async function StudioLogin({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const config = await studioSurface();
  if (!config) notFound();
  if (await studioSignedIn(config)) redirect("/estampas");
  const { erro } = await searchParams;
  return <main className={styles.login} id="conteudo"><div className={styles.loginBox}>
    <h1>Estúdio de estampas</h1><p>Entre para criar e salvar suas estampas.</p>
    {erro && messages[erro] && <p role="alert" className={styles.error}>{messages[erro]}</p>}
    <form action="/estampas/entrar" method="post">
      <label>Usuário<input name="username" autoComplete="username" required maxLength={100} autoCapitalize="none" spellCheck={false} /></label>
      <label>Senha<input name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
      <button type="submit">Entrar no editor</button>
    </form>
  </div></main>;
}
